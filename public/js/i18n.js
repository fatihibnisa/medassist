// MedAssist i18n. Uzbek (Latin) source strings are the keys; ru/en dictionaries map them.
// Missing keys fall back to Uzbek, so a new string never breaks the UI.
import { RU, EN } from './i18n-dict.js';

const DICTS = { ru: RU, en: EN };
export const LANGS = [['uz', 'UZ', 'O‘zbekcha'], ['ru', 'RU', 'Русский'], ['en', 'EN', 'English']];
const LOCALE = { uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' };

let current = (() => { try { const l = localStorage.getItem('ma-lang'); if (DICTS[l] || l === 'uz') return l; } catch { /* private mode */ } const n = (navigator.language || '').slice(0, 2); return n === 'ru' ? 'ru' : 'uz'; })();
export const lang = () => current;
export const locale = () => LOCALE[current];
export function setLang(l) {
  if (!LOCALE[l]) return;
  current = l;
  try { localStorage.setItem('ma-lang', l); } catch { /* private mode */ }
  document.documentElement.setAttribute('lang', l);
}

/** t('Salom, {name}!', {name}) — translate, then fill {placeholders}. */
export function t(s, vars) {
  if (s == null) return '';
  let out = String(s);
  if (current !== 'uz') { const d = DICTS[current]; if (d && d[out] != null) out = d[out]; }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return out;
}

/** Server messages: exact match first, then a known prefix before ":" (e.g. "Xavfsizlik tekshiruvi: …"). */
export function tServer(msg) {
  if (current === 'uz' || !msg) return msg;
  const d = DICTS[current];
  if (d[msg] != null) return d[msg];
  const i = msg.indexOf(': ');
  if (i > 0 && d[msg.slice(0, i)] != null) return d[msg.slice(0, i)] + msg.slice(i);
  return msg;
}
