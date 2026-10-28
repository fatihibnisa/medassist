import { esc, icon, logo, logoMark, session, app, api, theme, fmtDay, fmtDate, errMsg, spinner, t, langSwitch, toast } from '../core.js';
import { shell, bodyMap, ornament, ikat, mapStage } from '../ui.js';
import { openScanner, scanImageFile, codeFromScan } from './common.js';

const install = { prompt: null };
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); install.prompt = e; app.queue(); });

const mesh = '<div class="mesh" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
function topnav() {
  const u = session.user;
  return '<div class="topnav"><div class="container"><div class="bar glass">' + logo() +
    '<nav aria-label="' + esc(t('Sahifa bo‘limlari')) + '"><a href="#/" data-act="scroll" data-to="features">' + esc(t('Imkoniyatlar')) + '</a><a href="#/" data-act="scroll" data-to="how">' + esc(t('Qanday ishlaydi')) + '</a><a href="#/" data-act="scroll" data-to="doctors">' + esc(t('Shifokorlarga')) + '</a><a href="#/" data-act="scroll" data-to="faq">' + esc(t('Savollar')) + '</a></nav>' +
    '<div class="row nw" style="gap:8px">' + langSwitch('sm hide-xs') + '<button class="icon-btn theme-btn" data-act="theme" aria-label="' + esc(t('Mavzuni almashtirish')) + '">' + icon(theme.isDark() ? 'sun' : 'moon', 19) + '</button>' +
    (u ? '<a class="btn btn-primary btn-sm" href="' + app.homeFor(u) + '">' + esc(t('Kabinetga o‘tish')) + '</a>' : '<a class="btn btn-ghost btn-sm" href="#/login">' + esc(t('Kirish')) + '</a><a class="btn btn-primary btn-sm" href="#/register">' + esc(t('Boshlash')) + '</a>') +
    '</div></div></div></div>';
}

function phoneMock() {
  return '<div class="stage">' + ornament('hero-orn') +
    '<div class="float-card glass" style="left:-34px;top:70px"><span class="ic" style="background:var(--mint-soft);color:var(--mint-ink)">' + icon('check', 18, 2.6) + '</span><span>' + esc(t('Javob tayyor')) + '<br><span class="xs faint">Dr. A. Karimov · ' + esc(t('Terapevt')) + '</span></span></div>' +
    '<div class="float-card glass" style="right:-34px;top:300px;animation-delay:-3s"><span class="ic" style="background:var(--primary-soft);color:var(--primary)">' + icon('alarm', 18) + '</span><span>' + esc(t('Dori vaqti')) + '<br><span class="xs faint">08:00 · Paratsetamol</span></span></div>' +
    '<div class="float-card glass" style="left:-30px;bottom:24px;animation-delay:-1.5s"><span class="ic" style="background:var(--amber-soft);color:var(--amber-ink)">' + icon('star', 18) + '</span><span>' + esc(t('Reyting 4.9')) + '<br><span class="xs faint">' + esc(t('Kardiolog · 15 yil')) + '</span></span></div>' +
    '<div class="phone" aria-hidden="true"><div class="notch"></div><div class="screen"><div class="mesh-in"></div><div class="inner">' +
      '<div class="row between nw"><span class="b" style="font-size:15px">' + esc(t('Qayer og‘riyapti?')) + '</span><span class="seg" style="transform:scale(.85);transform-origin:right"><button aria-pressed="true">' + esc(t('Old')) + '</button><button>' + esc(t('Orqa')) + '</button></span></div>' +
      '<div class="map-stage" style="padding:6px 0">' + bodyMap({ view: 'front', sel: { throat: { pain: 5 }, head: { pain: 3 } }, open: 'throat', width: 118, scan: true }) + '</div>' +
      '<div class="glass" style="padding:12px;border-radius:18px"><div class="row between nw"><b>' + esc(t('Tomoq')) + '</b><span class="pill" style="background:#F97316;color:#fff">5/10</span></div><div class="xs muted" style="margin-top:4px">' + esc(t('Mos mutaxassis:')) + ' ' + esc(t('LOR')) + '</div>' +
      '<div class="pain-scale" style="margin-top:10px;gap:3px">' + Array.from({ length: 11 }, (_, i) => '<span style="height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;' + (i === 5 ? 'background:#F97316;color:#fff' : 'background:var(--fill)') + '">' + i + '</span>').join('') + '</div></div>' +
      '<span class="btn btn-primary btn-block" style="margin-top:auto;min-height:48px">' + esc(t('Davom etish')) + '</span>' +
    '</div></div></div></div>';
}

const FEATURES = [
  ['map', 'Interaktiv tana xaritasi', 'Old va orqa tomondagi 48 ta sohadan og‘riyotgan joyni bosing. Ilova shu sohada nima borligini va qaysi mutaxassis kerakligini tushuntiradi.', 'wide'],
  ['steth', 'Mos shifokorni tanlash', 'Reyting, tajriba, narx va manzil bo‘yicha shifokor tanlang. Onlayn maslahat oling yoki klinikaga navbatga yoziling.', 'wide'],
  ['pulse', 'Xavfni darhol aniqlash', 'Qat’iy tibbiy qoidalar shoshilinch belgilarni soniyalarda aniqlaydi va 103 ga qo‘ng‘iroq qilishni tavsiya etadi.'],
  ['spark', 'Shifokor tasdiqlagan AI', 'AI faqat shifokorga qoralama tayyorlaydi. Siz faqat litsenziyali shifokor tasdiqlagan javobni ko‘rasiz.'],
  ['alarm', 'Dori eslatmalari', 'Dorixona retseptni tasdiqlagach, ilova dori ichish vaqtlarini o‘zi tuzadi va budilnikdek eslatadi.'],
  ['qr', 'QR kodli e-retsept', 'Retsept PDF va QR kod bilan keladi. Dorixona uni skanerlab bir zumda tekshiradi.', 'wide'],
  ['shield', 'Dori xavfsizlik filtri', 'Allergiya, yosh, homiladorlik va sutkalik doza har bir retseptda avtomatik tekshiriladi.', 'wide']
];
const STEPS = [
  ['Joyni belgilang', 'Tana xaritasida og‘riq joyi, darajasi va davomiyligini ko‘rsating.'],
  ['Mutaxassis tavsiyasi', 'Ilova qaysi shifokorga borish kerakligini aytadi va eng yaxshilarini ko‘rsatadi.'],
  ['Onlayn yoki klinikada', 'Shifokor bilan chatda maslahatlashing yoki qabulga yoziling.'],
  ['Retsept va eslatma', 'QR kodli retsept keladi, dori ichish vaqtini ilova eslatadi.']
];
const FAQ = [
  ['MedAssist shifokorning o‘rnini bosadimi?', 'Yo‘q. Har bir tashxis va retseptni litsenziyasi tekshirilgan shifokor qo‘yadi. AI faqat shifokorga yordamchi qoralama tayyorlaydi va bemorga ko‘rsatilmaydi.'],
  ['Shoshilinch holatda nima qilaman?', 'Ko‘krakda kuchli og‘riq, hushdan ketish, kuchli qon ketish kabi belgilarda ilova darhol 103 ga qo‘ng‘iroq qilishni tavsiya etadi. Bunday holatda ilovaga emas, tez yordamga murojaat qiling.'],
  ['Ma’lumotlarim kimga ko‘rinadi?', 'Faqat murojaatingizni olgan shifokorga. Administratorlar tibbiy ma’lumotni ko‘rmaydi. Har bir ko‘rish audit jurnaliga yoziladi.'],
  ['Retseptni dorixonada qanday ko‘rsataman?', 'Telefoningizdagi QR kodni yoki PDF faylni ko‘rsating. Dorixona “Retseptni tekshirish” sahifasida uni skanerlaydi va dori berilganini belgilaydi.'],
  ['Ilovani telefonga o‘rnatsa bo‘ladimi?', 'Ha. Sayt PWA ilova sifatida ishlaydi: brauzer menyusidan “Bosh ekranga qo‘shish”ni tanlang — ilova kabi ochiladi.']
];

export function landingView() {
  return {
    title: 'Onlayn tibbiy konsultatsiya',
    html() {
      const u = session.user;
      const primary = u ? (u.role === 'PATIENT' ? '#/app/new' : app.homeFor(u)) : '#/register';
      return mesh + topnav() + '<main class="page enter">' +
        '<section class="container hero">' +
          '<div><span class="eyebrow glass"><b>' + esc(t('Yangi')) + '</b>' + esc(t('Shifokor tasdiqlagan onlayn konsultatsiya')) + '</span>' +
          '<h1>' + esc(t('Og‘riq qayerda — shunchaki ko‘rsating.')) + '</h1>' + ikat() +
          '<p class="lead">' + esc(t('Tana xaritasida og‘riyotgan joyni belgilang. Ilova mos mutaxassisni tavsiya qiladi, litsenziyali shifokor tashxis qo‘yadi, retsept QR kod bilan keladi va dori vaqtini eslatadi.')) + '</p>' +
          '<div class="hero-ctas"><a class="btn btn-primary btn-lg" href="' + primary + '">' + esc(t(u && u.role === 'PATIENT' ? 'Yangi murojaat' : u ? 'Kabinetga o‘tish' : 'Murojaat yuborish')) + icon('next', 20, 2.4) + '</a>' +
          '<a class="btn btn-lg" href="#/verify">' + icon('scan', 20) + esc(t('Retseptni tekshirish')) + '</a></div>' +
          '<div class="trust"><span>' + icon('shield', 18) + esc(t('Litsenziyali shifokorlar')) + '</span><span>' + icon('lock', 18) + esc(t('Shifrlangan ma’lumot')) + '</span><span>' + icon('alert', 18) + esc(t('103 ogohlantirishi')) + '</span></div></div>' +
          phoneMock() +
        '</section>' +
        '<section class="section container" id="features"><div class="section-head"><h2>' + esc(t('Murojaatdan retseptgacha — bitta ilovada')) + '</h2>' + ikat() + '<p class="muted lg">' + esc(t('Bemor uchun sodda, shifokor uchun tez, dorixona uchun ishonchli.')) + '</p></div>' +
          '<div class="bento">' + FEATURES.map(([ic, tl, d, w], i) => '<article class="glass feature reveal ' + (w || '') + '" style="--d:' + i + '"><span class="ic">' + icon(ic, 22) + '</span><h3>' + esc(t(tl)) + '</h3><p>' + esc(t(d)) + '</p></article>').join('') + '</div></section>' +
        '<section class="section container" id="how"><div class="section-head"><h2>' + esc(t('Qanday ishlaydi')) + '</h2>' + ikat() + '<p class="muted lg">' + esc(t('To‘rt qadam. O‘rtacha ikki daqiqa.')) + '</p></div>' +
          '<div class="steps4">' + STEPS.map(([tl, d], i) => '<article class="glass step reveal" style="--d:' + i + '"><span class="n">' + (i + 1) + '</span><h3>' + esc(t(tl)) + '</h3><p>' + esc(t(d)) + '</p></article>').join('') + '</div></section>' +
        '<section class="section container" id="doctors"><div class="glass band"><div class="col g20"><span class="eyebrow" style="padding-left:0">' + icon('steth', 18) + esc(t('Shifokorlar uchun')) + '</span><h2>' + esc(t('Bemorlaringizni tartibli navbatda qabul qiling')) + '</h2>' +
          '<ul class="ticks">' + ['Onlayn va jonli (klinikadagi) navbat bitta joyda', 'Qabul vaqtlarini o‘zingiz belgilaysiz, holatingizni bemorlar ko‘radi', 'Xavotirli bemorlar bosh ekranda birinchi turadi', 'Statistika, reyting va bir bosishda hisobot (CSV)'].map((x) => '<li>' + icon('check', 18, 2.6) + esc(t(x)) + '</li>').join('') + '</ul>' +
          '<div class="row"><a class="btn btn-primary btn-lg" href="#/register?role=doctor">' + esc(t('Shifokor sifatida qo‘shilish')) + '</a></div></div>' +
          '<div class="glass" style="padding:18px;border-radius:24px;display:flex;flex-direction:column;gap:10px">' +
            [['Rustam Q.', '61 · ' + t('Ko‘krak, chap') + ' 7/10', 'RED', 'Shoshilinch'], ['Bobur A.', '52 · ' + t('Bel, chap') + ' 6/10', 'YELLOW', 'O‘rtacha'], ['Dilnoza Y.', '34 · ' + t('Tomoq') + ' 5/10', 'GREEN', 'Yengil']]
              .map(([n, m, sv, l], i) => '<div class="item qcard ' + sv + ' reveal" style="cursor:default;--d:' + i + '"><div class="row between nw"><b>' + n + '</b><span class="pill ' + sv + '"><span class="dot"></span>' + esc(t(l)) + '</span></div><span class="sm muted">' + esc(m) + '</span></div>').join('') +
          '</div></div></section>' +
        '<section class="section container" id="faq" style="max-width:820px"><div class="section-head"><h2>' + esc(t('Ko‘p so‘raladigan savollar')) + '</h2>' + ikat() + '</div><div class="col">' +
          FAQ.map(([q, a]) => '<details class="glass faq"><summary>' + esc(t(q)) + icon('plus', 20) + '</summary><p>' + esc(t(a)) + '</p></details>').join('') + '</div></section>' +
        '<section class="section container"><div class="glass cta-band col g20" style="align-items:center">' + ornament('cta-orn') + '<h2>' + esc(t('Sog‘lig‘ingiz haqida savol bormi?')) + '</h2><p class="muted lg" style="max-width:52ch">' + esc(t('Ro‘yxatdan o‘tish bir daqiqa oladi. Telefon raqamingiz SMS kod bilan tasdiqlanadi.')) + '</p>' +
          '<div class="row center"><a class="btn btn-primary btn-lg" href="' + primary + '">' + esc(t(u ? 'Davom etish' : 'Bepul ro‘yxatdan o‘tish')) + '</a>' +
          (install.prompt ? '<button class="btn btn-lg" data-act="install">' + icon('install', 20) + esc(t('Ilovani o‘rnatish')) + '</button>' : '<a class="btn btn-lg" href="#/" data-act="scroll" data-to="faq">' + icon('install', 20) + esc(t('Telefonga o‘rnatish')) + '</a>') + '</div></div></section>' +
        '</main><footer class="site container"><div class="row between"><div class="row">' + logoMark(26) + '<span>© ' + new Date().getFullYear() + ' MedAssist</span>' + langSwitch('sm') + '</div>' +
        '<span>' + esc(t('Shoshilinch holatda —')) + ' <a href="tel:103"><b>103</b></a>. ' + esc(t('MedAssist tez tibbiy yordam xizmati emas.')) + '</span></div></footer>';
    },
    after() { revealOnScroll(); },
    on: {
      scroll(el) { const s = document.getElementById(el.dataset.to); if (s) s.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); },
      async install() { if (!install.prompt) return; install.prompt.prompt(); await install.prompt.userChoice.catch(() => null); install.prompt = null; app.render(); }
    }
  };
}
// Landing sections fade up as they enter the viewport.
let io = null;
function revealOnScroll() {
  if (!('IntersectionObserver' in window)) { document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')); return; }
  if (io) io.disconnect();
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.reveal:not(.in)').forEach((e) => io.observe(e));
}

/* ---------------- 404 ---------------- */
export function notFoundView() {
  return {
    title: 'Sahifa topilmadi',
    html() {
      const home = session.user ? app.homeFor(session.user) : '#/';
      return mesh + topnav() + '<main class="container page enter"><section class="nf" role="alert">' + ornament() +
        '<div class="nf-code" aria-hidden="true">404</div><h1 style="font-size:clamp(26px,4vw,40px)">' + esc(t('Sahifa topilmadi')) + '</h1>' + ikat() +
        '<p class="muted lg" style="max-width:48ch">' + esc(t('Bu manzil mavjud emas yoki ko‘chirilgan. Manzilni tekshiring yoki bosh sahifaga qayting.')) + '</p>' +
        '<div class="row center"><a class="btn btn-primary btn-lg" href="/' + home + '">' + icon('home', 20) + esc(t('Bosh sahifa')) + '</a><button class="btn btn-lg" data-act="back" data-to="' + home + '">' + icon('back', 20) + esc(t('Orqaga')) + '</button></div></section></main>';
    }
  };
}

/* ---------------- verify (pharmacy) ---------------- */
export function verifyView(params) {
  const q = params.query || new URLSearchParams();
  const s = { code: params.code || '', loading: false, result: null, error: '', pharmacy: (() => { try { return localStorage.getItem('ma-pharmacy') || ''; } catch { return ''; } })(), dispensing: false, autoScan: !!q.get('scan') };
  const check = async () => {
    const code = codeFromScan(s.code).replace(/\s+/g, '');
    if (code.length < 6) { s.error = t('Kodni to‘liq kiriting'); app.render(); return; }
    s.code = code; s.loading = true; s.error = ''; app.render();
    try { s.result = await api('/public/verify/' + encodeURIComponent(code)); s.fresh = true; setTimeout(() => { s.fresh = false; }, 800); }
    catch (e) { s.error = errMsg(e); s.result = null; }
    s.loading = false; app.render();
  };
  return {
    title: 'Retseptni tekshirish',
    html() {
      const r = s.result;
      let res = '';
      if (r && r.status === 'NOT_FOUND') res = '<div class="alert err">' + icon('alert') + '<div>' + esc(t('Bunday retsept topilmadi. Kodni qayta tekshiring.')) + '</div></div>';
      else if (r) {
        const ok = r.status === 'VALID';
        const verdict = ok && r.dispensedAt ? ['warn', 'alert', 'Dori allaqachon berilgan'] : ok ? ['ok', 'check', 'Haqiqiy retsept'] : ['err', 'x', r.status === 'CANCELLED' ? 'Bekor qilingan' : 'Muddati o‘tgan'];
        res = '<div class="glass card lg col g20 verdict ' + verdict[0] + (s.fresh ? ' anim' : '') + '"><div class="row nw" style="gap:16px"><span class="verdict-ic">' + icon(verdict[1], 30, 2.6) + '</span><div><h2 style="font-size:24px">' + esc(t(verdict[2])) + '</h2><p class="muted">' + esc(r.number) + '</p></div></div>' +
          (r.cancelReason ? '<div class="alert err">' + icon('alert') + '<div>' + esc(t('Sabab:')) + ' ' + esc(r.cancelReason) + '</div></div>' : '') +
          (r.dispensedAt ? '<div class="alert warn">' + icon('alert') + '<div>' + esc(t('Berilgan:')) + ' ' + fmtDate(r.dispensedAt) + (r.dispensedBy ? ' · ' + esc(r.dispensedBy) : '') + '. ' + esc(t('Qayta berish mumkin emas.')) + '</div></div>' : '') +
          '<div class="kv"><div><span>' + esc(t('Berilgan')) + '</span><b>' + fmtDay(r.issuedAt) + '</b></div><div><span>' + esc(t('Amal qiladi')) + '</span><b>' + fmtDay(r.validUntil) + '</b></div><div><span>' + esc(t('Bemor')) + '</span><b>' + esc(r.patient) + '</b></div></div>' +
          '<div class="well"><span class="xs faint b">' + esc(t('SHIFOKOR')) + '</span><div class="b">' + esc(r.doctor.fullName) + '</div><div class="sm muted">' + esc(t(r.doctor.specialty)) + ' · ' + esc(t('litsenziya')) + ' ' + esc(r.doctor.licenseNumber) + '</div></div>' +
          '<div class="col g6"><h4>' + esc(t('Dorilar')) + '</h4>' + r.items.map((i) => '<div class="med"><b>' + esc(i.name) + ' ' + esc(i.strength) + ' <span class="faint sm">' + esc(t(i.form)) + '</span></b><span class="sm">' + esc(i.dosage) + ', ' + esc(t('kuniga {n} marta', { n: i.timesPerDay })) + ', ' + esc(t('{n} kun', { n: i.days })) + '</span></div>').join('') + '</div>' +
          (ok && !r.dispensedAt ? '<div class="glass card tight col g12 dispense"><b>' + esc(t('Dorixona uchun: dorini berdingizmi?')) + '</b><p class="sm muted">' + esc(t('Belgilaganingizdan keyin bemorga dori ichish jadvali va eslatmalar yoqiladi. Retsept ikkinchi marta ishlatilmaydi.')) + '</p>' +
            '<div class="row nw"><input class="input" id="pharm" data-bind="pharmacy" placeholder="' + esc(t('Dorixona nomi va manzili')) + '" value="' + esc(s.pharmacy) + '"><button class="btn btn-mint" data-act="dispense"' + (s.dispensing ? ' disabled' : '') + '>' + (s.dispensing ? spinner() : icon('check', 18, 2.6) + esc(t('Dori berildi'))) + '</button></div></div>' : '') +
          '<p class="xs faint">' + esc(t('Bemorning shaxsiy va tibbiy ma’lumotlari ko‘rsatilmaydi.')) + '</p></div>';
      }
      // Reached both from the public landing page and from a signed-in patient's sidebar: wrap in the
      // app shell for the latter so the nav/back-button chrome never drops out mid-session (consistent design).
      const heading = session.user ? '' : '<div class="col g6"><h1 style="font-size:clamp(28px,4vw,40px)">' + esc(t('Retseptni tekshirish')) + '</h1>' + ikat() + '<p class="muted lg">' + esc(t('Dorixonalar uchun: QR kodni skanerlang yoki retseptdagi 8 belgili kodni kiriting.')) + '</p></div>';
      const body = heading +
        '<div class="glass card col scan-card"><div class="grid g2" style="gap:10px"><button class="btn btn-primary btn-lg scan-btn" data-act="scan">' + icon('scan', 22) + esc(t('Kamera bilan skanerlash')) + '</button>' +
        '<label class="btn btn-lg" style="cursor:pointer">' + icon('image', 20) + esc(t('QR rasmini yuklash')) + '<input type="file" class="sr" data-file="scanFile" accept="image/*"></label></div>' +
        '<div class="or-sep"><span>' + esc(t('yoki kodni kiriting')) + '</span></div>' +
        '<label class="field"><span>' + esc(t('Tekshirish kodi yoki retsept raqami')) + '</span><div class="row nw"><input class="input" id="vcode" data-bind="code" data-enter="check" value="' + esc(s.code) + '" placeholder="K7Q2M9XA" autocomplete="off" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.12em"><button class="btn btn-primary" data-act="check"' + (s.loading ? ' disabled' : '') + '>' + (s.loading ? spinner() : esc(t('Tekshirish'))) + '</button></div></label>' +
        (s.error ? '<div class="alert err">' + icon('alert') + '<div>' + esc(s.error) + '</div></div>' : '') + res;
      if (session.user) return shell('<div class="col g20" style="max-width:720px">' + body + '</div>', { title: t('Retseptni tekshirish'), subtitle: esc(t('Dorixonalar uchun tekshiruv')), back: app.homeFor(session.user), active: '#/verify' });
      return mesh + topnav() + '<main class="container narrow page enter" style="padding-top:24px;padding-bottom:64px"><div class="col g20">' + body + '</div></main>';
    },
    bind(k, v) { s[k] = v; },
    on: {
      check,
      async scan() { const r = await openScanner(); if (r) { s.code = codeFromScan(r); await check(); } },
      async scanFile(el) { const f = el.files && el.files[0]; el.value = ''; if (!f) return; const r = await scanImageFile(f); if (!r) { s.error = t('Rasmda QR kod topilmadi. Aniqroq rasm yuklang'); app.render(); return; } s.code = codeFromScan(r); await check(); },
      async dispense() {
        if (s.pharmacy.trim().length < 2) { toast(t('Dorixona nomini yozing'), 'err'); return; }
        try { localStorage.setItem('ma-pharmacy', s.pharmacy.trim()); } catch { /* private mode */ }
        s.dispensing = true; app.render();
        try { await api('/public/verify/' + encodeURIComponent(s.code) + '/dispense', { method: 'POST', body: { pharmacy: s.pharmacy.trim() } }); toast(t('Belgilandi: dori berildi')); await check(); }
        finally { s.dispensing = false; app.render(); }
      }
    },
    async mount() { if (s.code) await check(); else if (s.autoScan) { const r = await openScanner(); if (r) { s.code = codeFromScan(r); await check(); } } }
  };
}
