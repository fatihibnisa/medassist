import { esc, icon, logo, session, app, api, go, catalog, errMsg, spinner, theme, markSignedIn, t, pwField, langSwitch } from '../core.js';
import { bodyMap, ornament, ikat, startNotifications } from '../ui.js';
import { startReminders } from '../reminders.js';

const mesh = '<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
const err = (m) => (m ? '<div class="alert err" role="alert" id="form-err">' + icon('alert') + '<div>' + esc(m) + '</div></div>' : '');
const side = () => '<aside class="auth-side">' + ornament('auth-orn') + '<div class="row between">' + logo() + '</div>' +
  '<div class="col g20" style="max-width:440px"><div class="map-stage" style="justify-content:flex-start;background:none;padding:0">' + bodyMap({ view: 'front', sel: { head: { pain: 3 }, throat: { pain: 5 }, kneeL: { pain: 7 } }, width: 120, scan: true }) + '</div>' +
  '<p class="side-tagline">' + esc(t('Og‘riq joyini ko‘rsating — qolganini shifokor hal qiladi.')) + '</p>' + ikat() + '<p class="muted lg">' + esc(t('Litsenziyali shifokorlar, QR kodli elektron retsept va shoshilinch belgilarni darhol aniqlash.')) + '</p></div>' +
  '<p class="xs faint">' + esc(t('Shoshilinch holatda darhol 103 ga qo‘ng‘iroq qiling.')) + '</p></aside>';
const frame = (inner) => mesh + '<div class="auth-wrap">' + side() + '<main class="auth-main"><div class="glass auth-card col g20 page enter">' +
  '<div class="row between nw"><a class="icon-btn" href="#/" aria-label="' + esc(t('Bosh sahifa')) + '">' + icon('back', 19) + '</a><span class="hide-desktop">' + logo() + '</span><div class="row nw" style="gap:6px">' + langSwitch('sm') + '<button class="icon-btn" data-act="theme" aria-label="' + esc(t('Mavzuni almashtirish')) + '">' + icon(theme.isDark() ? 'sun' : 'moon', 19) + '</button></div></div>' + inner + '</div></main></div>';
const phoneInput = (id, val) => '<label class="field"><span>' + esc(t('Telefon raqam')) + '</span><div class="input-group"><span class="prefix">+998</span><input class="input" id="' + id + '" aria-describedby="form-err" data-bind="phone" inputmode="tel" autocomplete="tel-national" placeholder="90 123 45 67" value="' + esc(val) + '" maxlength="14"></div></label>';

async function enter(r) {
  session.token = r.accessToken; session.user = r.user; markSignedIn(true);
  startNotifications();
  if (r.user.role === 'PATIENT') startReminders();
  go(app.takeNext(r.user));
}

/* ---------------- login ---------------- */
export function loginView() {
  const s = { phone: '', password: '', loading: false, error: '' };
  const submit = async () => {
    s.loading = true; s.error = ''; app.render();
    try { await enter(await api('/auth/login', { method: 'POST', body: { phone: s.phone, password: s.password } })); }
    catch (e) { s.error = errMsg(e); s.loading = false; app.render(); }
  };
  return {
    title: 'Kirish',
    html: () => frame('<div class="col g6"><h1>' + esc(t('Xush kelibsiz')) + '</h1><p class="muted">' + esc(t('Telefon raqam va parol bilan kiring.')) + '</p></div>' +
      phoneInput('l-phone', s.phone) +
      pwField({ id: 'password', label: t('Parol'), value: s.password, auto: 'current-password', enter: 'submit' }) +
      err(s.error) +
      '<button class="btn btn-primary btn-lg btn-block" data-act="submit"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : esc(t('Kirish'))) + '</button>' +
      '<div class="row between sm"><a href="#/reset">' + esc(t('Parolni unutdingizmi?')) + '</a><a href="#/register" class="b">' + esc(t('Ro‘yxatdan o‘tish')) + '</a></div>'),
    bind(k, v) { s[k] = v; },
    on: { submit }
  };
}

/* ---------------- register ---------------- */
export function registerView(params) {
  const q = params.query || new URLSearchParams();
  const s = {
    role: q.get('role') === 'doctor' ? 'DOCTOR' : 'PATIENT', step: 1, phone: '', code: '', devCode: '', resendAt: 0,
    fullName: '', password: '', password2: '', birthYear: '', gender: '', bloodType: '', allergies: '', chronic: '', pregnant: false, address: '',
    specialtyId: '', licenseNumber: '', experienceYears: '', specialties: [], consent: false, loading: false, error: ''
  };
  let timer = null;
  const tick = () => { if (s.resendAt > Date.now()) { clearTimeout(timer); timer = setTimeout(() => { app.render(); tick(); }, 1000); } };
  const sendCode = async () => {
    s.loading = true; s.error = ''; app.render();
    try {
      const r = await api('/auth/otp', { method: 'POST', body: { phone: s.phone, purpose: 'REGISTER' } });
      s.devCode = r.devCode || ''; s.step = 2; s.resendAt = Date.now() + 60000; tick();
    } catch (e) { s.error = errMsg(e); }
    s.loading = false; app.render();
    if (s.step === 2) setTimeout(() => { const el = document.getElementById('code'); if (el) el.focus(); }, 0);
  };
  const toDetails = () => { if (!/^\d{6}$/.test(s.code.trim())) { s.error = t('6 xonali kodni kiriting'); app.render(); return; } s.error = ''; s.step = 3; app.render(); };
  const submit = async () => {
    if (s.password !== s.password2) { s.error = t('Parollar mos kelmadi'); app.render(); return; }
    if (!s.consent) { s.error = t('Davom etish uchun shaxsiy ma’lumotlarni qayta ishlashga rozilik bering'); app.render(); return; }
    s.loading = true; s.error = ''; app.render();
    const body = { role: s.role, phone: s.phone, code: s.code.trim(), password: s.password, fullName: s.fullName };
    if (s.role === 'PATIENT') body.patient = { birthYear: Number(s.birthYear), gender: s.gender, bloodType: s.bloodType, allergies: s.allergies, chronic: s.chronic, pregnant: s.pregnant, address: s.address };
    else body.doctor = { specialtyId: Number(s.specialtyId), licenseNumber: s.licenseNumber, experienceYears: Number(s.experienceYears || 0) };
    try { await enter(await api('/auth/register', { method: 'POST', body })); }
    catch (e) {
      s.error = errMsg(e); s.loading = false;
      if (/Kod|код|code/i.test(s.error)) s.step = 2;
      app.render();
    }
  };
  return {
    title: 'Ro‘yxatdan o‘tish',
    html() {
      const steps = '<div class="progress" aria-label="' + esc(t('Qadam {a} / {b}', { a: s.step, b: 3 })) + '">' + [1, 2, 3].map((i) => '<i class="' + (i <= s.step ? 'on' : '') + '"></i>').join('') + '</div>';
      let body = '';
      if (s.step === 1) {
        body = '<div class="col g6"><h1>' + esc(t('Ro‘yxatdan o‘tish')) + '</h1><p class="muted">' + esc(t('Telefon raqamingizga SMS kod yuboramiz.')) + '</p></div>' +
          '<div class="seg role-seg" role="group" aria-label="' + esc(t('Kim sifatida')) + '"><button data-act="role" data-v="PATIENT" aria-pressed="' + (s.role === 'PATIENT') + '">' + icon('user', 16) + ' ' + esc(t('Bemor')) + '</button><button data-act="role" data-v="DOCTOR" aria-pressed="' + (s.role === 'DOCTOR') + '">' + icon('steth', 16) + ' ' + esc(t('Shifokor')) + '</button></div>' +
          phoneInput('r-phone', s.phone) + err(s.error) +
          '<button class="btn btn-primary btn-lg btn-block" data-act="sendCode"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : esc(t('SMS kod olish'))) + '</button>' +
          '<p class="sm muted" style="text-align:center">' + esc(t('Akkauntingiz bormi?')) + ' <a href="#/login" class="b">' + esc(t('Kirish')) + '</a></p>';
      } else if (s.step === 2) {
        const left = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000));
        body = '<div class="col g6"><h1>' + esc(t('Kodni kiriting')) + '</h1><p class="muted">' + esc(t('+998 {p} raqamiga 6 xonali kod yuborildi. Kod 2 daqiqa amal qiladi.', { p: s.phone })) + '</p></div>' +
          (s.devCode ? '<div class="alert info">' + icon('spark') + '<div>' + esc(t('Test rejimi: SMS yuborilmadi. Kod —')) + ' <b>' + esc(s.devCode) + '</b></div></div>' : '') +
          '<input class="input otp" id="code" data-bind="code" data-enter="toDetails" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="' + esc(t('SMS kod')) + '" value="' + esc(s.code) + '">' + err(s.error) +
          '<button class="btn btn-primary btn-lg btn-block" data-act="toDetails">' + esc(t('Tasdiqlash')) + '</button>' +
          '<div class="row between sm"><button class="btn btn-ghost btn-sm" data-act="back1">' + icon('back', 16) + esc(t('Raqamni o‘zgartirish')) + '</button>' +
          (left ? '<span class="faint">' + esc(t('Qayta yuborish: {n} s', { n: left })) + '</span>' : '<button class="btn btn-ghost btn-sm" data-act="sendCode">' + esc(t('Qayta yuborish')) + '</button>') + '</div>';
      } else {
        body = '<div class="col g6"><h1>' + esc(t(s.role === 'PATIENT' ? 'Tibbiy profil' : 'Shifokor ma’lumotlari')) + '</h1><p class="muted">' + esc(t(s.role === 'PATIENT' ? 'Shifokor tashxis qo‘yishda shu ma’lumotdan foydalanadi.' : 'Administrator litsenziyangizni tekshirgach, navbat ochiladi.')) + '</p></div>' +
          '<label class="field"><span>' + esc(t('Ism va familiya')) + '</span><input class="input" id="fullName" data-bind="fullName" autocomplete="name" value="' + esc(s.fullName) + '"></label>' +
          pwField({ id: 'password', label: t('Parol'), value: s.password, auto: 'new-password', hint: t('Kamida 8 belgi, harf va raqam bilan') }) +
          pwField({ id: 'password2', label: t('Parolni takrorlang'), value: s.password2, auto: 'new-password' }) +
          (s.role === 'PATIENT'
            ? '<div class="grid g2"><label class="field"><span>' + esc(t('Tug‘ilgan yil')) + '</span><input class="input" id="birthYear" data-bind="birthYear" inputmode="numeric" maxlength="4" placeholder="1990" value="' + esc(s.birthYear) + '"></label>' +
              '<div class="field"><span>' + esc(t('Jins')) + '</span><div class="seg" role="group" aria-label="' + esc(t('Jins')) + '" style="height:50px;align-items:stretch"><button data-act="gender" data-v="M" aria-pressed="' + (s.gender === 'M') + '" style="flex:1">' + esc(t('Erkak')) + '</button><button data-act="gender" data-v="F" aria-pressed="' + (s.gender === 'F') + '" style="flex:1">' + esc(t('Ayol')) + '</button></div></div></div>' +
              (s.gender === 'F' ? '<label class="check"><input type="checkbox" data-bind="pregnant"' + (s.pregnant ? ' checked' : '') + '>' + esc(t('Hozir homiladorman')) + '</label>' : '') +
              '<label class="field"><span>' + esc(t('Allergiya')) + '</span><input class="input" id="allergies" data-bind="allergies" placeholder="' + esc(t('Masalan: penitsillin. Bo‘lmasa bo‘sh qoldiring')) + '" value="' + esc(s.allergies) + '"></label>' +
              '<label class="field"><span>' + esc(t('Surunkali kasalliklar')) + '</span><input class="input" id="chronic" data-bind="chronic" placeholder="' + esc(t('Masalan: gipertenziya')) + '" value="' + esc(s.chronic) + '"></label>' +
              '<label class="field"><span>' + esc(t('Yashash manzili (ixtiyoriy)')) + '</span><input class="input" id="address" data-bind="address" placeholder="' + esc(t('Shahar, tuman, ko‘cha, uy')) + '" value="' + esc(s.address) + '"></label>' +
              '<label class="field"><span>' + esc(t('Qon guruhi')) + '</span><select class="input" id="bloodType" data-bind="bloodType">' + [['', t('Bilmayman')], ['O(I)+'], ['O(I)−'], ['A(II)+'], ['A(II)−'], ['B(III)+'], ['B(III)−'], ['AB(IV)+'], ['AB(IV)−']].map(([v, l]) => '<option value="' + v + '"' + (s.bloodType === v ? ' selected' : '') + '>' + esc(l || v) + '</option>').join('') + '</select></label>'
            : '<label class="field"><span>' + esc(t('Mutaxassislik')) + '</span><select class="input" id="specialtyId" data-bind="specialtyId"><option value="">' + esc(t('Tanlang')) + '</option>' + s.specialties.map((x) => '<option value="' + x.id + '"' + (String(s.specialtyId) === String(x.id) ? ' selected' : '') + '>' + esc(t(x.name)) + '</option>').join('') + '</select></label>' +
              '<div class="grid g2"><label class="field"><span>' + esc(t('Litsenziya raqami')) + '</span><input class="input" id="licenseNumber" data-bind="licenseNumber" placeholder="UZ-TR-0000" value="' + esc(s.licenseNumber) + '" style="text-transform:uppercase"></label>' +
              '<label class="field"><span>' + esc(t('Tajriba, yil')) + '</span><input class="input" id="experienceYears" data-bind="experienceYears" inputmode="numeric" maxlength="2" value="' + esc(s.experienceYears) + '"></label></div>' +
              '<p class="xs faint">' + esc(t('Ro‘yxatdan o‘tgach, profilda litsenziya nusxasi, rasm, klinika manzili va narxlarni kiritasiz.')) + '</p>') +
          '<label class="check sm"><input type="checkbox" data-bind="consent"' + (s.consent ? ' checked' : '') + '>' + esc(t('Shaxsiy va tibbiy ma’lumotlarimni qayta ishlashga roziman')) + '</label>' +
          err(s.error) +
          '<button class="btn btn-primary btn-lg btn-block" data-act="submit"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : esc(t('Ro‘yxatdan o‘tish'))) + '</button>';
      }
      return frame(steps + body);
    },
    bind(k, v) { s[k] = v; if (k === 'birthYear' || k === 'experienceYears') s[k] = String(v).replace(/\D/g, ''); },
    on: {
      role(el) { s.role = el.dataset.v; app.render(); },
      gender(el) { s.gender = el.dataset.v; if (s.gender !== 'F') s.pregnant = false; app.render(); },
      back1() { s.step = 1; s.code = ''; s.error = ''; app.render(); },
      sendCode, toDetails, submit
    },
    async mount() { s.specialties = (await catalog()).specialties; app.render(); },
    unmount() { clearTimeout(timer); }
  };
}

/* ---------------- reset ---------------- */
export function resetView() {
  const s = { step: 1, phone: '', code: '', password: '', password2: '', devCode: '', loading: false, error: '', done: false };
  return {
    title: 'Parolni tiklash',
    html() {
      if (s.done) return frame('<div class="col g20" style="text-align:center;align-items:center"><span class="avatar lg success-pop" style="background:var(--mint)">' + icon('check', 28, 2.6) + '</span><h1>' + esc(t('Parol yangilandi')) + '</h1><p class="muted">' + esc(t('Endi yangi parol bilan kirishingiz mumkin.')) + '</p><a class="btn btn-primary btn-lg btn-block" href="#/login">' + esc(t('Kirish')) + '</a></div>');
      return frame('<div class="col g6"><h1>' + esc(t('Parolni tiklash')) + '</h1><p class="muted">' + esc(t(s.step === 1 ? 'Ro‘yxatdan o‘tgan raqamingizni kiriting.' : 'SMS kod va yangi parolni kiriting.')) + '</p></div>' +
        (s.step === 1 ? phoneInput('rs-phone', s.phone) + err(s.error) + '<button class="btn btn-primary btn-lg btn-block" data-act="send"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : esc(t('Kod olish'))) + '</button>'
          : (s.devCode ? '<div class="alert info">' + icon('spark') + '<div>' + esc(t('Test rejimi. Kod —')) + ' <b>' + esc(s.devCode) + '</b></div></div>' : '') +
            '<input class="input otp" id="code" data-bind="code" inputmode="numeric" maxlength="6" aria-label="' + esc(t('SMS kod')) + '" value="' + esc(s.code) + '">' +
            pwField({ id: 'password', label: t('Yangi parol'), value: s.password, auto: 'new-password', hint: t('Kamida 8 belgi, harf va raqam bilan') }) +
            pwField({ id: 'password2', label: t('Parolni takrorlang'), value: s.password2, auto: 'new-password' }) + err(s.error) +
            '<button class="btn btn-primary btn-lg btn-block" data-act="save"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : esc(t('Parolni saqlash'))) + '</button>') +
        '<p class="sm" style="text-align:center"><a href="#/login">' + esc(t('Kirish sahifasiga qaytish')) + '</a></p>');
    },
    bind(k, v) { s[k] = v; },
    on: {
      async send() { s.loading = true; s.error = ''; app.render(); try { const r = await api('/auth/otp', { method: 'POST', body: { phone: s.phone, purpose: 'RESET' } }); s.devCode = r.devCode || ''; s.step = 2; } catch (e) { s.error = errMsg(e); } s.loading = false; app.render(); },
      async save() { if (s.password !== s.password2) { s.error = t('Parollar mos kelmadi'); app.render(); return; } s.loading = true; s.error = ''; app.render(); try { await api('/auth/reset', { method: 'POST', body: { phone: s.phone, code: s.code, password: s.password } }); s.done = true; } catch (e) { s.error = errMsg(e); } s.loading = false; app.render(); }
    }
  };
}
