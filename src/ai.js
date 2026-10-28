import { config } from './config.js';
import { one, all, run, insert, now, json, tx, medicineRow } from './db.js';
import { SEGMENT_NAMES, PAIN_KINDS, DURATIONS, SYMPTOMS, ruleDraft, safetyCheck, icdTitle, ICD_PATTERN } from '../public/shared/clinical.js';
import { audit } from './auth.js';

export const PROMPT_VERSION = 'v1.2';
export const aiAvailable = () => config.ai.enabled && !!config.ai.apiKey;

function buildPrompt(input, allowed) {
  return 'Sen shifokorga yordam beruvchi klinik qoralama tayyorlovchisan. Javobingni bemor ko‘rmaydi: uni litsenziyali shifokor tekshiradi va tasdiqlaydi, o‘zgartiradi yoki rad etadi.\n\n' +
    'Anonim bemor ma’lumoti (JSON):\n' + JSON.stringify(input) + '\n\n' +
    'Ruxsat etilgan dorilar (faqat shu "code" lardan foydalan, boshqasini yozma):\n' + JSON.stringify(allowed) + '\n\n' +
    'Qoidalar: antibiotik tavsiya qilma; allergiya, yosh, homiladorlik va surunkali kasallikni hisobga ol; dozani standartdan oshirma; ishonching past bo‘lsa confidence ni past qo‘y; differential ko‘pi bilan 3 ta. Matnlar o‘zbek tilida (lotin yozuvi).\n' +
    'Faqat JSON qaytar, boshqa hech narsa yozma, aynan shu shaklda:\n' +
    '{"diagnosis":{"icd10":"J06.9","title":"...","confidence":0.7},"differential":[{"icd10":"...","title":"...","confidence":0.2}],"reasoning":"1-2 gap","advice":["..."],"medicines":[{"medicineCode":"PARACETAMOL_500","dosageMg":500,"timesPerDay":3,"durationDays":3,"note":"..."}],"redFlags":["..."],"questionsForDoctor":["..."]}\n' +
    'Kukun, eritma yoki gel uchun dosageMg null bo‘lsin.';
}

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.ai.model, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(config.ai.timeoutMs)
  });
  if (!r.ok) throw new Error('AI API ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const data = await r.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{'), end = clean.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI javobida JSON yo‘q');
  return JSON.parse(clean.slice(start, end + 1));
}

function sanitizeDraft(d, codes) {
  if (!d || typeof d !== 'object' || !d.diagnosis || !ICD_PATTERN.test(String(d.diagnosis.icd10 || '').toUpperCase())) throw new Error('AI javobi sxemaga mos emas');
  const s = (v, n) => String(v == null ? '' : v).slice(0, n);
  const conf = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const arr = (v, n, len) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => s(x, len)).filter(Boolean);
  return {
    diagnosis: { icd10: String(d.diagnosis.icd10).toUpperCase(), title: s(d.diagnosis.title, 200) || icdTitle(String(d.diagnosis.icd10).toUpperCase()), confidence: conf(d.diagnosis.confidence) },
    differential: (Array.isArray(d.differential) ? d.differential : []).slice(0, 3).filter((x) => x && ICD_PATTERN.test(String(x.icd10 || '').toUpperCase()))
      .map((x) => ({ icd10: String(x.icd10).toUpperCase(), title: s(x.title, 200), confidence: conf(x.confidence) })),
    reasoning: s(d.reasoning, 600),
    advice: arr(d.advice, 8, 300),
    medicines: (Array.isArray(d.medicines) ? d.medicines : []).filter((m) => m && codes.has(m.medicineCode)).slice(0, 5).map((m) => ({
      medicineCode: m.medicineCode, dosageMg: m.dosageMg == null ? null : Number(m.dosageMg) || null,
      timesPerDay: Math.max(1, Math.min(6, Math.round(Number(m.timesPerDay) || 1))), durationDays: Math.max(1, Math.min(30, Math.round(Number(m.durationDays) || 3))), note: s(m.note, 200)
    })),
    redFlags: arr(d.redFlags, 6, 200),
    questionsForDoctor: arr(d.questionsForDoctor, 5, 200)
  };
}

/** Generate (or regenerate) the AI suggestion for a consultation. Never throws for AI failures: falls back to rules. */
export async function generateSuggestion(consultationId, ctx) {
  const c = one('SELECT * FROM consultations WHERE id = ?', consultationId);
  if (!c || c.severity === 'RED' || ['DIAGNOSED', 'CLOSED', 'CANCELLED'].includes(c.status)) return null;
  const p = json(c.patient_snapshot, {});
  const segs = all('SELECT segment_code AS code, pain_level AS pain, symptom_type AS kind, duration_idx AS dur FROM consultation_segments WHERE consultation_id = ?', c.id);
  const symptoms = json(c.symptoms, []);
  const meds = all('SELECT * FROM medicines WHERE is_active = 1').map(medicineRow);
  const allowed = meds.filter((m) => m.ai);
  const input = {
    age: p.age, sex: p.gender === 'F' ? 'ayol' : 'erkak', pregnant: !!p.pregnant, allergies: p.allergies || 'yo‘q', chronic: p.chronic || 'yo‘q',
    temperature: c.temperature, severity: c.severity,
    areas: segs.map((s) => ({ area: SEGMENT_NAMES[s.code], pain: s.pain, character: PAIN_KINDS[s.kind], duration: DURATIONS[s.dur] })),
    symptoms: symptoms.map((k) => SYMPTOMS[k]).filter(Boolean), complaint: c.complaint
  };
  let draft = null, source = 'RULES', model = null, error = null;
  if (aiAvailable()) {
    try {
      const raw = await callClaude(buildPrompt(input, allowed.map((m) => ({ code: m.code, name: m.name, form: m.form, strength: m.strength, standard: m.std, maxDailyMg: m.maxDaily, minAge: m.minAge, pregnancyOk: m.preg }))));
      draft = sanitizeDraft(raw, new Set(allowed.map((m) => m.code)));
      source = 'AI'; model = config.ai.model;
    } catch (e) { error = e.message; console.warn('[ai] fallback to rules:', e.message); }
  }
  if (!draft) draft = ruleDraft(segs, symptoms);

  // Safety filter — authoritative, in code.
  const byCode = new Map(meds.map((m) => [m.code, m]));
  const items = draft.medicines.map((m) => ({ med: byCode.get(m.medicineCode), code: m.medicineCode, doseMg: m.dosageMg, timesPerDay: m.timesPerDay, durationDays: m.durationDays, note: m.note }));
  const checks = safetyCheck(items, { age: p.age, pregnant: p.pregnant, allergies: p.allergies, chronic: p.chronic });
  const kept = [], removed = [];
  items.forEach((it, i) => {
    const row = { medicineCode: it.code, medicineId: it.med ? it.med.id : null, doseMg: it.doseMg, timesPerDay: it.timesPerDay, durationDays: it.durationDays, note: it.note };
    if (c.severity === 'YELLOW') removed.push({ ...row, reason: 'O‘rtacha holat: AI dori tavsiya qilmaydi, shifokor o‘zi tanlaydi' });
    else if (!it.med || !it.med.ai) removed.push({ ...row, reason: 'AI uchun ruxsat etilgan ro‘yxatda emas' });
    else if (checks[i].issues.length) removed.push({ ...row, reason: checks[i].issues.join('; ') });
    else kept.push(row);
  });

  const fresh = one('SELECT status FROM consultations WHERE id = ?', c.id);
  if (!fresh || ['DIAGNOSED', 'CLOSED', 'CANCELLED'].includes(fresh.status)) return null;
  tx(() => {
    run('DELETE FROM ai_suggestions WHERE consultation_id = ?', c.id);
    insert(`INSERT INTO ai_suggestions (consultation_id, source, model_name, prompt_version, draft_json, kept_json, removed_json, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      c.id, source, model, PROMPT_VERSION, JSON.stringify(draft), JSON.stringify(kept), JSON.stringify(removed), now());
    if (fresh.status === 'NEW') run("UPDATE consultations SET status = 'AI_DRAFTED', updated_at = ? WHERE id = ?", now(), c.id);
  });
  audit(ctx || null, 'AI_SUGGESTION', 'consultation', c.id, source + (error ? ' (fallback: ' + error.slice(0, 120) + ')' : '') + ', filtrlangan: ' + removed.length);
  return true;
}
