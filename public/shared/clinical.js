// MedAssist — shared clinical rules and reference data.
// Used by the server (authoritative) and by the browser (live preview only).
// Triage and medication safety are deterministic code: AI can never lower them.

export const SEGMENT_NAMES = {
  head: 'Bosh', throat: 'Tomoq', shR: 'O‘ng yelka', shL: 'Chap yelka', chestR: 'Ko‘krak, o‘ng', chestL: 'Ko‘krak, chap',
  uarmR: 'O‘ng qo‘l, yuqori', uarmL: 'Chap qo‘l, yuqori', farmR: 'O‘ng bilak', farmL: 'Chap bilak', handR: 'O‘ng panja', handL: 'Chap panja',
  epi: 'Qorin, yuqori', abdR: 'Qorin, o‘ng', abdL: 'Qorin, chap', pelvis: 'Qorin, pastki', thighR: 'O‘ng son', thighL: 'Chap son',
  kneeR: 'O‘ng tizza', kneeL: 'Chap tizza', shinR: 'O‘ng boldir', shinL: 'Chap boldir', footR: 'O‘ng oyoq panjasi', footL: 'Chap oyoq panjasi',
  occ: 'Ensa', neckB: 'Bo‘yin, orqa', scapL: 'Kurak, chap', scapR: 'Kurak, o‘ng', midback: 'Orqa, o‘rta', lowL: 'Bel, chap', lowR: 'Bel, o‘ng',
  sacrum: 'Dumg‘aza', hamL: 'Son orqasi, chap', hamR: 'Son orqasi, o‘ng', poplL: 'Tizza osti, chap', poplR: 'Tizza osti, o‘ng',
  calfL: 'Boldir mushagi, chap', calfR: 'Boldir mushagi, o‘ng', heelL: 'Tovon, chap', heelR: 'Tovon, o‘ng',
  earR: 'O‘ng quloq', earL: 'Chap quloq',
  // <body-map> ichki a’zolar ko‘rinishidagi qo‘shimcha kodlar — server validatsiyasi shular bilan ham mos bo‘lishi uchun.
  brain: 'Miya', eyes: 'Ko‘zlar', mouth: 'Og‘iz va tishlar', thyroid: 'Qalqonsimon bez', lungR: 'O‘ng o‘pka', lungL: 'Chap o‘pka', heart: 'Yurak',
  liver: 'Jigar', gallbladder: 'O‘t pufagi', stomach: 'Oshqozon', spleen: 'Taloq', pancreas: 'Oshqozon osti bezi', kidneyR: 'O‘ng buyrak', kidneyL: 'Chap buyrak',
  smallInt: 'Ingichka ichak', colon: 'Yo‘g‘on ichak', appendix: 'Ko‘richak', bladder: 'Qovuq (siydik pufagi)'
};
export const ORGAN_CODES = new Set(['brain', 'eyes', 'mouth', 'thyroid', 'lungR', 'lungL', 'heart', 'liver', 'gallbladder', 'stomach', 'spleen', 'pancreas', 'kidneyR', 'kidneyL', 'smallInt', 'colon', 'appendix', 'bladder']);

// Front-view SVG paths (viewBox 0 0 200 432). The back view reuses the shapes mirrored via BACK_MAP.
export const SEGMENT_PATHS = {
  head: 'M100 8C83 8 74 21 74 38C74 54 84 67 100 69C116 67 126 54 126 38C126 21 117 8 100 8Z', throat: 'M89 68Q100 73 111 68L113 84Q100 88 87 84Z',
  shR: 'M62 89C50 91 42 99 40 112L56 116Q57 104 62 98Z', shL: 'M138 89C150 91 158 99 160 112L144 116Q143 104 138 98Z',
  chestR: 'M63 88Q81 85 100 87L100 136L66 136Q60 112 63 88Z', chestL: 'M137 88Q119 85 100 87L100 136L134 136Q140 112 137 88Z',
  uarmR: 'M40 112L56 116Q55 143 52 170L36 168Q37 140 40 112Z', uarmL: 'M160 112L144 116Q145 143 148 170L164 168Q163 140 160 112Z',
  farmR: 'M36 168L52 170Q50 198 46 226L30 224Q32 196 36 168Z', farmL: 'M164 168L148 170Q150 198 154 226L170 224Q168 196 164 168Z',
  handR: 'M30 224L46 226Q48 240 46 252Q38 260 29 250Q26 236 30 224Z', handL: 'M170 224L154 226Q152 240 154 252Q162 260 171 250Q174 236 170 224Z',
  epi: 'M66 136L134 136Q133 152 132 168L68 168Q67 152 66 136Z', abdR: 'M68 168L100 168L100 206L70 206Q68 187 68 168Z', abdL: 'M132 168L100 168L100 206L130 206Q132 187 132 168Z',
  pelvis: 'M70 206L130 206Q130 220 126 232L74 232Q70 220 70 206Z',
  thighR: 'M74 232L100 232Q100 274 98 316L76 316Q71 274 74 232Z', thighL: 'M126 232L100 232Q100 274 102 316L124 316Q129 274 126 232Z',
  kneeR: 'M76 316L98 316Q99 328 97 340L77 340Q74 328 76 316Z', kneeL: 'M124 316L102 316Q101 328 103 340L123 340Q126 328 124 316Z',
  shinR: 'M77 340L97 340Q97 372 94 404L80 404Q75 372 77 340Z', shinL: 'M123 340L103 340Q103 372 106 404L120 404Q125 372 123 340Z',
  footR: 'M80 404L94 404Q97 414 97 424L70 424Q70 413 80 404Z', footL: 'M120 404L106 404Q103 414 103 424L130 424Q130 413 120 404Z'
};
export const BACK_MAP = {
  head: 'occ', throat: 'neckB', shR: 'shL', shL: 'shR', chestR: 'scapL', chestL: 'scapR', uarmR: 'uarmL', uarmL: 'uarmR', farmR: 'farmL', farmL: 'farmR',
  handR: 'handL', handL: 'handR', epi: 'midback', abdR: 'lowL', abdL: 'lowR', pelvis: 'sacrum', thighR: 'hamL', thighL: 'hamR', kneeR: 'poplL', kneeL: 'poplR',
  shinR: 'calfL', shinL: 'calfR', footR: 'heelL', footL: 'heelR'
};
export const SEGMENT_CODES = Object.keys(SEGMENT_NAMES);
const BACK_ONLY = new Set(Object.values(BACK_MAP).filter((v) => !SEGMENT_PATHS[v]));
const SHARED = new Set(Object.values(BACK_MAP).filter((v) => SEGMENT_PATHS[v]));
export const segmentSide = (code) => (BACK_ONLY.has(code) ? 'back' : SHARED.has(code) ? 'both' : 'front');

// Rough centroid of each shape in the 200x432 viewBox, for pinning a floating label to a body point.
export const SEGMENT_ANCHOR = {
  head: [100, 38], throat: [100, 76], shR: [50, 100], shL: [150, 100],
  chestR: [80, 110], chestL: [120, 110], uarmR: [43, 140], uarmL: [157, 140],
  farmR: [41, 197], farmL: [159, 197], handR: [37, 242], handL: [163, 242],
  epi: [100, 152], abdR: [84, 187], abdL: [116, 187], pelvis: [100, 219],
  thighR: [87, 274], thighL: [113, 274], kneeR: [87, 328], kneeL: [113, 328],
  shinR: [86, 372], shinL: [114, 372], footR: [84, 414], footL: [116, 414]
};
const REV_BACK_MAP = Object.fromEntries(Object.entries(BACK_MAP).map(([k, v]) => [v, k]));
/** The underlying shape key (one of SEGMENT_PATHS) for a segment id, regardless of which view it's normally shown in. */
export function shapeKeyFor(id) { return SEGMENT_ANCHOR[id] ? id : (REV_BACK_MAP[id] || null); }
/** Anchor point [x,y] for a segment id as shown in a given view ('front' | 'back' | 'organs'), or null if that id has no shape in that view. */
export function anchorFor(id, view) {
  if (view === 'organs') { const k = shapeKeyFor(id); return k ? SEGMENT_ANCHOR[k] : null; }
  const k = view === 'front' ? (SEGMENT_ANCHOR[id] ? id : null) : (REV_BACK_MAP[id] || (SEGMENT_ANCHOR[id] ? id : null));
  return k ? SEGMENT_ANCHOR[k] : null;
}

export const PAIN_KINDS = {
  sharp: 'O‘tkir, sanchiqli', dull: 'Simillovchi', burn: 'Achishuvchi', press: 'Siquvchi', pulse: 'Lo‘qillovchi', numb: 'Uvishish',
  // <body-map> jarohat/teri turlari — tashqi tana sohalari uchun.
  cut: 'Kesilgan', abrasion: 'Shilingan', thermal: 'Kuygan', bruise: 'Ko‘kargan', swelling: 'Shishgan', rash: 'Toshma, qichishish', bite: 'Tishlagan yoki chaqqan', fracture: 'Sinish gumoni'
};
export const DURATIONS = ['Bugun', '1–3 kun', '4–7 kun', '1 haftadan ko‘p'];
export const SYMPTOMS = { fever: 'Isitma', cough: 'Yo‘tal', runny: 'Tumov', nausea: 'Ko‘ngil aynishi', weak: 'Holsizlik', dizzy: 'Bosh aylanishi', breath: 'Nafas qisishi', sweat: 'Sovuq ter' };
export const DANGER_FLAGS = { thunder: 'To‘satdan juda kuchli bosh og‘rig‘i', faint: 'Hushdan ketish', bleed: 'Kuchli qon ketish', speech: 'Nutq buzilishi yoki yuz qiyshayishi' };
export const SEVERITY_LABEL = { GREEN: 'Yengil', YELLOW: 'O‘rtacha', RED: 'Shoshilinch' };
export const STATUS_LABEL = { NEW: 'Navbatda', AI_DRAFTED: 'Navbatda', ASSIGNED: 'Shifokor ko‘rmoqda', DIAGNOSED: 'Javob tayyor', CLOSED: 'Yopilgan' };
export const SPECIALTIES = ['Terapevt', 'Nevrolog', 'Travmatolog', 'Kardiolog', 'Gastroenterolog', 'LOR', 'Dermatolog', 'Pediatr'];

export const SPECIALTY_INFO = {
  Terapevt: 'Umumiy holat, isitma, shamollash, holsizlik — birinchi navbatdagi shifokor. Qaysi mutaxassis kerakligini ham aniqlaydi.',
  Nevrolog: 'Bosh og‘rig‘i, bosh aylanishi, uvishish, ensa va bo‘yin og‘rig‘i, asab tizimi muammolari.',
  Travmatolog: 'Suyak, bo‘g‘im, umurtqa, bel va tizza og‘rig‘i, lat yeyish va cho‘zilishlar.',
  Kardiolog: 'Yurak sohasidagi og‘riq, yurak urishi tezlashishi, qon bosimi muammolari.',
  Gastroenterolog: 'Oshqozon, ichak, jigar: qorin og‘rig‘i, jig‘ildon qaynashi, ko‘ngil aynishi.',
  LOR: 'Quloq, tomoq va burun: tomoq og‘rig‘i, tumov, quloq og‘rig‘i, sinusit.',
  Dermatolog: 'Teri: toshma, qichishish, dog‘lar, allergik reaksiyalar, soch va tirnoq muammolari.',
  Pediatr: '18 yoshgacha bo‘lgan bolalarning barcha kasalliklari.'
};

// Body regions: what lives there, typical causes, which specialist. Shown when a segment is selected.
const REGION = {
  head: ['Bosh miya, ko‘z, peshona va chakka sohasi', ['Taranglik og‘rig‘i', 'Migren', 'Qon bosimi o‘zgarishi', 'Sinusit', 'Ko‘z charchashi']],
  throat: ['Tomoq, halqum, bodomcha bezlari, qalqonsimon bez', ['Faringit', 'Angina', 'Shamollash', 'Ovoz zo‘riqishi']],
  shoulder: ['Yelka bo‘g‘imi, mushak va paylar', ['Mushak zo‘riqishi', 'Yelka bo‘g‘imi yallig‘lanishi', 'Noqulay uyqu holati']],
  chestR: ['O‘pka, ko‘krak qafasi mushaklari, qovurg‘alar', ['Bronxit', 'Mushak og‘rig‘i', 'Qovurg‘alararo nevralgiya']],
  chestL: ['Yurak, o‘pka, ko‘krak qafasi', ['Yurak muammolari (darhol tekshirish kerak)', 'Qovurg‘alararo nevralgiya', 'Jig‘ildon qaynashi']],
  arm: ['Qo‘l mushaklari, tirsak va bilak bo‘g‘imlari', ['Mushak zo‘riqishi', 'Lat yeyish', 'Asab qisilishi']],
  hand: ['Panja, barmoq bo‘g‘imlari, asablari', ['Tunnel sindromi', 'Artrit', 'Shikastlanish']],
  epi: ['Oshqozon, jigarning bir qismi, oshqozon osti bezi', ['Gastrit', 'Funksional dispepsiya', 'Jig‘ildon qaynashi']],
  abdR: ['Jigar, o‘t pufagi, ko‘richak (pastroqda)', ['O‘t pufagi muammolari', 'Ko‘richak yallig‘lanishi', 'Ichak spazmi']],
  abdL: ['Ichaklar, taloq, chap buyrak', ['Ichak spazmi', 'Gaz to‘planishi', 'Gastroenterit']],
  pelvis: ['Siydik pufagi, kichik chanoq a’zolari', ['Siydik yo‘llari infeksiyasi', 'Ichak muammolari', 'Ayollarda ginekologik sabablar']],
  thigh: ['Son mushaklari, son suyagi, yirik tomirlar', ['Mushak zo‘riqishi', 'Lat yeyish', 'Venoz muammolar']],
  knee: ['Tizza bo‘g‘imi, menisk, boylamlar', ['Artroz', 'Boylam cho‘zilishi', 'Menisk shikastlanishi']],
  shin: ['Boldir suyaklari va mushaklari', ['Mushak tirishishi', 'Lat yeyish', 'Venoz yetishmovchilik']],
  foot: ['Oyoq panjasi, to‘piq, tovon', ['To‘piq cho‘zilishi', 'Yassi oyoqlik', 'Tovon tikani (shpora)']],
  occ: ['Ensa, bosh orqasi', ['Taranglik og‘rig‘i', 'Bo‘yin osteoxondrozi', 'Qon bosimi oshishi']],
  neckB: ['Bo‘yin umurtqalari va mushaklari', ['Servikalgiya', 'Noqulay uyqu', 'Kompyuter oldida uzoq o‘tirish']],
  scap: ['Kurak, orqa mushaklari', ['Mushak zo‘riqishi', 'Qomat buzilishi', 'Qovurg‘alararo nevralgiya']],
  midback: ['Ko‘krak umurtqalari, orqa mushaklari', ['Qomat buzilishi', 'Mushak spazmi', 'Osteoxondroz']],
  low: ['Bel umurtqalari, buyraklar', ['Bel og‘rig‘i (lumbago)', 'Buyrak muammolari', 'Og‘ir ko‘tarish']],
  sacrum: ['Dumg‘aza, chanoq-son bo‘g‘imi', ['Bel-dumg‘aza og‘rig‘i', 'Uzoq o‘tirish', 'Siyatik nerv qisilishi']],
  ham: ['Son orqa mushaklari, siyatik nerv', ['Mushak cho‘zilishi', 'Siyatik nerv qisilishi']],
  popl: ['Tizza osti chuqurchasi', ['Beyker kistasi', 'Pay zo‘riqishi', 'Venoz muammolar']],
  calf: ['Boldir mushagi', ['Mushak tirishishi', 'Zo‘riqish', 'Tromboz (shishsa — darhol tekshiring)']],
  heel: ['Tovon, Axill payi', ['Tovon tikani', 'Axill payi yallig‘lanishi', 'Noqulay poyabzal']]
};
const REGION_OF = {
  shR: 'shoulder', shL: 'shoulder', uarmR: 'arm', uarmL: 'arm', farmR: 'arm', farmL: 'arm', handR: 'hand', handL: 'hand', thighR: 'thigh', thighL: 'thigh',
  kneeR: 'knee', kneeL: 'knee', shinR: 'shin', shinL: 'shin', footR: 'foot', footL: 'foot', scapL: 'scap', scapR: 'scap', lowL: 'low', lowR: 'low',
  hamL: 'ham', hamR: 'ham', poplL: 'popl', poplR: 'popl', calfL: 'calf', calfR: 'calf', heelL: 'heel', heelR: 'heel'
};
/** {organs, causes[], specialty, specialtyInfo} for a body segment. */
export function segmentInfo(code) {
  const r = REGION[REGION_OF[code] || code] || ['', []];
  const specialty = specialtyFor(code);
  return { organs: r[0], causes: r[1], specialty, specialtyInfo: SPECIALTY_INFO[specialty] || '' };
}

// "What bothers you?" — for patients who would rather pick a condition than a body part.
export const CONDITIONS = [
  { key: 'cold', label: 'Shamollash, isitma, holsizlik', specialty: 'Terapevt', icon: 'pulse' },
  { key: 'headache', label: 'Bosh og‘rig‘i, bosh aylanishi', specialty: 'Nevrolog', icon: 'spark' },
  { key: 'throat', label: 'Tomoq, quloq yoki burun', specialty: 'LOR', icon: 'chat' },
  { key: 'heart', label: 'Yurak, qon bosimi', specialty: 'Kardiolog', icon: 'pulse' },
  { key: 'stomach', label: 'Oshqozon, qorin, ichak', specialty: 'Gastroenterolog', icon: 'pill' },
  { key: 'joints', label: 'Bel, bo‘g‘im, suyak, shikast', specialty: 'Travmatolog', icon: 'map' },
  { key: 'skin', label: 'Teri, toshma, qichishish', specialty: 'Dermatolog', icon: 'eye' },
  { key: 'child', label: 'Bola kasalligi (18 yoshgacha)', specialty: 'Pediatr', icon: 'users' }
];
/** Recommended specialty for a set of segments (highest pain wins) or a condition key. */
export function recommendSpecialty({ segments, condition, age } = {}) {
  if (age != null && age < 18) return 'Pediatr';
  if (condition) { const c = CONDITIONS.find((x) => x.key === condition); if (c) return c.specialty; }
  const top = (segments || []).slice().sort((a, z) => (Number(z.pain) || 0) - (Number(a.pain) || 0))[0];
  return top ? specialtyFor(top.code) : 'Terapevt';
}

/** Dose times (minutes after midnight) spread between wake-up and bedtime. */
export function doseTimes(timesPerDay, wake = 480, sleep = 1320) {
  const n = Math.max(1, Math.min(12, Number(timesPerDay) || 1));
  if (sleep <= wake) sleep = wake + 14 * 60;
  if (n === 1) return [wake + 60];
  const step = (sleep - wake) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round((wake + step * i) / 5) * 5);
}

export const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
export const DEFAULT_WORK_HOURS = { 0: { on: false, start: '09:00', end: '13:00' }, 1: { on: true, start: '09:00', end: '17:00' }, 2: { on: true, start: '09:00', end: '17:00' }, 3: { on: true, start: '09:00', end: '17:00' }, 4: { on: true, start: '09:00', end: '17:00' }, 5: { on: true, start: '09:00', end: '17:00' }, 6: { on: true, start: '09:00', end: '13:00' } };
export const PRESENCE = { ONLINE: 'Onlayn — maslahatga tayyor', AT_WORK: 'Klinikada — qabulda', OFFLINE: 'Hozir mavjud emas' };

export const painColor = (p) => (p >= 8 ? '#EF4444' : p >= 5 ? '#F97316' : p >= 3 ? '#F59E0B' : p >= 1 ? '#EAB308' : '#94A3B8');
export const painWord = (p) => (p === 0 ? 'Yo‘q' : p <= 3 ? 'Yengil' : p <= 6 ? 'O‘rtacha' : p <= 8 ? 'Kuchli' : 'Chidab bo‘lmas');

export function specialtyFor(code) {
  if (['head', 'occ', 'neckB', 'brain'].includes(code)) return 'Nevrolog';
  if (['midback', 'lowL', 'lowR', 'sacrum', 'kneeR', 'kneeL', 'poplL', 'poplR', 'shR', 'shL', 'hamL', 'hamR', 'heelL', 'heelR', 'footR', 'footL', 'scapL', 'scapR'].includes(code)) return 'Travmatolog';
  if (['chestL', 'chestR', 'heart', 'lungR', 'lungL'].includes(code)) return 'Kardiolog';
  if (['epi', 'abdR', 'abdL', 'stomach', 'liver', 'gallbladder', 'spleen', 'pancreas', 'smallInt', 'colon', 'appendix'].includes(code)) return 'Gastroenterolog';
  if (['throat', 'earR', 'earL', 'mouth'].includes(code)) return 'LOR';
  if (code === 'eyes') return 'Nevrolog';
  return 'Terapevt';
}

export const ICD10 = [
  ['J06.9', 'O‘tkir yuqori nafas yo‘llari infeksiyasi'], ['J02.9', 'O‘tkir faringit'], ['J00', 'O‘tkir rinofaringit (shamollash)'], ['J20.9', 'O‘tkir bronxit'],
  ['R51', 'Bosh og‘rig‘i'], ['G44.2', 'Taranglik tipidagi bosh og‘rig‘i'], ['G43.9', 'Migren'], ['K30', 'Funksional dispepsiya'], ['K21.9', 'Gastroezofageal reflyuks'],
  ['K29.7', 'Gastrit'], ['A09', 'Gastroenterit'], ['R10.4', 'Qorin og‘rig‘i, aniqlanmagan'], ['M54.5', 'Bel og‘rig‘i'], ['M54.2', 'Servikalgiya (bo‘yin og‘rig‘i)'],
  ['M25.56', 'Tizza og‘rig‘i'], ['M79.1', 'Mialgiya'], ['S93.4', 'To‘piq boylamlarining cho‘zilishi'], ['T78.4', 'Allergiya, aniqlanmagan'], ['L50.9', 'Eshakemi'],
  ['N39.0', 'Siydik yo‘llari infeksiyasi'], ['I10', 'Arterial gipertenziya'], ['R50.9', 'Isitma, aniqlanmagan'], ['H10.9', 'Kon’yunktivit'], ['I20.9', 'Stenokardiya']
];
export const icdTitle = (code) => (ICD10.find((x) => x[0] === code) || [])[1] || '';
export const ICD_PATTERN = /^[A-Z]\d{2}(\.\d{1,2})?$/;

// Demo formulary. Doses are illustrative — verify against the official label before production use.
export const MEDICINES = [
  { code: 'PARACETAMOL_500', name: 'Paratsetamol', form: 'tabletka', strength: '500 mg', mg: 500, unitDose: null, std: '500 mg, kuniga 3–4 marta, oraliq kamida 4 soat', maxDaily: 4000, minAge: 12, preg: true, contraKeys: ['jigar', 'gepatit', 'alkogol'], allergyKeys: ['paratsetamol', 'parasetamol', 'acetaminophen'], se: ['Ko‘ngil aynishi', 'Teri toshmasi (kam)'], ci: ['Og‘ir jigar kasalligi', 'Alkogolni ko‘p iste’mol qilish'], ai: true },
  { code: 'IBUPROFEN_200', name: 'Ibuprofen', form: 'tabletka', strength: '200 mg', mg: 200, unitDose: null, std: '200–400 mg, kuniga 3 marta, ovqatdan keyin', maxDaily: 1200, minAge: 12, preg: false, contraKeys: ['oshqozon', 'yara', 'buyrak', 'astma', 'qon ketish'], allergyKeys: ['ibuprofen', 'nyaq', 'nsaid', 'aspirin', 'diklofenak'], se: ['Oshqozon og‘rig‘i', 'Jig‘ildon qaynashi', 'Bosh aylanishi'], ci: ['Oshqozon yarasi', 'Buyrak yetishmovchiligi', 'Homiladorlik'], ai: true },
  { code: 'CETIRIZINE_10', name: 'Setirizin', form: 'tabletka', strength: '10 mg', mg: 10, unitDose: null, std: '10 mg, kuniga 1 marta', maxDaily: 10, minAge: 6, preg: false, contraKeys: ['buyrak'], allergyKeys: ['setirizin', 'cetirizine'], se: ['Uyquchanlik', 'Og‘iz qurishi'], ci: ['Og‘ir buyrak yetishmovchiligi'], ai: true },
  { code: 'LORATADINE_10', name: 'Loratadin', form: 'tabletka', strength: '10 mg', mg: 10, unitDose: null, std: '10 mg, kuniga 1 marta', maxDaily: 10, minAge: 6, preg: false, contraKeys: ['jigar'], allergyKeys: ['loratadin'], se: ['Bosh og‘rig‘i', 'Charchoq'], ci: ['Og‘ir jigar kasalligi'], ai: true },
  { code: 'AMBROXOL_30', name: 'Ambroksol', form: 'tabletka', strength: '30 mg', mg: 30, unitDose: null, std: '30 mg, kuniga 2–3 marta', maxDaily: 90, minAge: 12, preg: false, contraKeys: ['oshqozon', 'yara'], allergyKeys: ['ambroksol'], se: ['Ko‘ngil aynishi', 'Ta’m o‘zgarishi'], ci: ['Oshqozon yarasi', 'Homiladorlikning 1-uch oyligi'], ai: true },
  { code: 'OMEPRAZOLE_20', name: 'Omeprazol', form: 'kapsula', strength: '20 mg', mg: 20, unitDose: null, std: '20 mg, kuniga 1 marta, nonushtadan oldin', maxDaily: 20, minAge: 18, preg: false, contraKeys: [], allergyKeys: ['omeprazol'], se: ['Bosh og‘rig‘i', 'Qorin dam bo‘lishi'], ci: ['Klopidogrel bilan birga'], ai: true },
  { code: 'ORS', name: 'Regidron', form: 'kukun', strength: '1 paket', mg: null, unitDose: '1 paket 1 litr suvda', std: 'Kun davomida qultumlab ichiladi', maxDaily: null, minAge: 1, preg: true, contraKeys: ['buyrak'], allergyKeys: [], se: ['Ko‘ngil aynishi (tez ichilsa)'], ci: ['Buyrak yetishmovchiligi'], ai: true },
  { code: 'CHLORHEXIDINE_RINSE', name: 'Xlorgeksidin (tomoq chayish)', form: 'eritma', strength: '0,05%', mg: null, unitDose: '15 ml chayish uchun', std: 'Kuniga 3–4 marta chayish, yutmaslik', maxDaily: null, minAge: 12, preg: true, contraKeys: [], allergyKeys: ['xlorgeksidin', 'chlorhexidine'], se: ['Ta’m o‘zgarishi'], ci: ['Allergiya'], ai: true },
  { code: 'DICLOFENAC_GEL', name: 'Diklofenak gel', form: 'gel', strength: '1%', mg: null, unitDose: 'yupqa qatlam', std: 'Og‘riyotgan joyga kuniga 3 marta surtiladi', maxDaily: null, minAge: 14, preg: false, contraKeys: ['astma'], allergyKeys: ['diklofenak', 'nyaq', 'nsaid', 'aspirin'], se: ['Teri qizarishi'], ci: ['Shikastlangan teri', 'NYaQ allergiyasi'], ai: true },
  { code: 'DROTAVERINE_40', name: 'Drotaverin', form: 'tabletka', strength: '40 mg', mg: 40, unitDose: null, std: '40–80 mg, kuniga 2–3 marta', maxDaily: 240, minAge: 12, preg: false, contraKeys: ['yurak', 'buyrak', 'jigar'], allergyKeys: ['drotaverin'], se: ['Bosh aylanishi', 'Qon bosimi pasayishi'], ci: ['Og‘ir yurak, buyrak, jigar yetishmovchiligi'], ai: false },
  { code: 'AMOXICILLIN_500', name: 'Amoksitsillin', form: 'kapsula', strength: '500 mg', mg: 500, unitDose: null, std: '500 mg, kuniga 3 marta (faqat shifokor)', maxDaily: 3000, minAge: 12, preg: true, contraKeys: [], allergyKeys: ['penitsillin', 'penicillin', 'amoksitsillin'], se: ['Diareya', 'Toshma'], ci: ['Penitsillin allergiyasi'], ai: false }
];

/**
 * Deterministic triage. Input:
 * { segments: [{code, pain, kind, dur}], symptoms: [keys], flags: [keys], temperature, patient: {age, pregnant, chronic} }
 */
export function triage(input) {
  const segs = input.segments || [];
  const has = (c) => segs.some((s) => s.code === c);
  const sym = new Set(input.symptoms || []);
  const flags = new Set(input.flags || []);
  const p = input.patient || {};
  const maxPain = segs.reduce((m, s) => Math.max(m, Number(s.pain) || 0), 0);
  const red = [], yellow = [];
  const chest = has('chestL') || has('chestR') || has('epi') || has('scapL');
  if (maxPain >= 8) red.push('Og‘riq darajasi 8/10 yoki yuqori');
  if (chest && (sym.has('breath') || sym.has('sweat') || has('uarmL') || has('shL') || has('farmL'))) red.push('Ko‘krak og‘rig‘i nafas qisishi, sovuq ter yoki chap qo‘lga tarqalish bilan');
  if (flags.has('thunder')) red.push(DANGER_FLAGS.thunder);
  if (flags.has('faint')) red.push(DANGER_FLAGS.faint);
  if (flags.has('bleed')) red.push(DANGER_FLAGS.bleed);
  if (flags.has('speech')) red.push(DANGER_FLAGS.speech);
  if (p.age != null && p.age < 18) red.push('18 yoshdan kichik');
  if (p.pregnant) red.push('Homiladorlik');
  if (red.length) return { severity: 'RED', reasons: red };
  if (maxPain >= 6) yellow.push('Og‘riq 6–7/10');
  if (segs.some((s) => Number(s.dur) >= 3)) yellow.push('Bir haftadan ortiq davom etmoqda');
  if (p.chronic && String(p.chronic).trim()) yellow.push('Surunkali kasallik bor');
  if (p.age != null && p.age >= 65) yellow.push('65 yoshdan katta');
  if (Number(input.temperature) >= 38.5) yellow.push('Harorat 38,5 °C yoki yuqori');
  if (yellow.length) return { severity: 'YELLOW', reasons: yellow };
  return { severity: 'GREEN', reasons: ['Xavfli belgi topilmadi'] };
}

/**
 * Medication safety check. items: [{med, doseMg, timesPerDay}], med = medicine row with
 * {name, mg, maxDaily, minAge, preg, contraKeys, allergyKeys}. patient: {age, pregnant, allergies, chronic}
 * Returns [{issues: [..], block: bool}] in the same order.
 */
export function safetyCheck(items, patient) {
  const al = String((patient && patient.allergies) || '').toLowerCase();
  const ch = String((patient && patient.chronic) || '').toLowerCase();
  const age = patient && patient.age != null ? patient.age : null;
  return items.map((it) => {
    const m = it.med;
    if (!m) return { issues: ['Dori ro‘yxatda yo‘q'], block: true };
    const issues = [];
    let block = false;
    const hitA = (m.allergyKeys || []).find((a) => a && al.includes(a));
    if (hitA) { issues.push('Allergiya: “' + hitA + '”'); block = true; }
    if (age !== null && age < m.minAge) { issues.push(m.minAge + ' yoshdan kichiklarga mumkin emas'); block = true; }
    if (patient && patient.pregnant && !m.preg) issues.push('Homiladorlikda tavsiya etilmaydi');
    const hitC = (m.contraKeys || []).find((k) => k && ch.includes(k));
    if (hitC) issues.push('Surunkali kasallik bilan zid: “' + hitC + '”');
    if (m.mg && m.maxDaily && it.doseMg && it.timesPerDay) {
      const daily = Number(it.doseMg) * Number(it.timesPerDay);
      if (daily > m.maxDaily) { issues.push('Sutkalik doza ' + daily + ' mg > maksimal ' + m.maxDaily + ' mg'); block = true; }
    }
    return { issues, block };
  });
}

export function interactions(codes) {
  const s = new Set(codes), out = [];
  if (s.has('IBUPROFEN_200') && s.has('DICLOFENAC_GEL')) out.push('Ibuprofen va diklofenak gel — ikkalasi ham NYaQ, oshqozonga yuk ortadi');
  if (s.has('CETIRIZINE_10') && s.has('LORATADINE_10')) out.push('Ikki antigistamin birga — biri yetarli');
  return out;
}

/** Rule-based draft, used when no AI provider is configured or the AI call fails. Returns medicine codes. */
export function ruleDraft(segments, symptoms) {
  const has = (...k) => segments.some((s) => k.includes(s.code));
  const sym = new Set(symptoms || []);
  let dx = ['M79.1', 0.4], diff = [], meds = [], advice = ['Yetarli dam oling va suyuqlik iching'];
  if (has('throat')) { dx = sym.has('fever') ? ['J06.9', 0.62] : ['J02.9', 0.6]; diff = [['J02.9', 0.25], ['J00', 0.15]]; meds = [['PARACETAMOL_500', 500, 3, 3, 'Harorat 38 °C dan oshsa yoki og‘riqda'], ['CHLORHEXIDINE_RINSE', null, 4, 5, 'Ovqatdan keyin chayish']]; advice = ['Ko‘p iliq suyuqlik iching', 'Ovozni asrang, chekmang', 'Xonani shamollating']; }
  else if (has('head', 'occ')) { dx = ['G44.2', 0.55]; diff = [['G43.9', 0.2], ['R51', 0.2]]; meds = [['PARACETAMOL_500', 500, 3, 3, 'Og‘riq paytida']]; advice = ['Uyqu rejimini tiklang', 'Ekran vaqtini kamaytiring', 'Bo‘yin uchun yengil mashqlar']; }
  else if (has('epi')) { dx = ['K30', 0.5]; diff = [['K21.9', 0.25], ['K29.7', 0.2]]; meds = [['OMEPRAZOLE_20', 20, 1, 14, 'Nonushtadan 30 daqiqa oldin']]; advice = ['Kam-kamdan, tez-tez ovqatlaning', 'Achchiq va yog‘lini cheklang', 'Ovqatdan keyin 2 soat yotmang']; }
  else if (has('abdR', 'abdL', 'pelvis')) { dx = ['R10.4', 0.35]; diff = [['A09', 0.25], ['N39.0', 0.15]]; advice = ['Yengil parhez', 'Suyuqlikni yetarli iching']; }
  else if (has('lowL', 'lowR', 'sacrum', 'midback')) { dx = ['M54.5', 0.6]; diff = [['M79.1', 0.2]]; meds = [['IBUPROFEN_200', 200, 3, 5, 'Ovqatdan keyin'], ['DICLOFENAC_GEL', null, 3, 7, 'Bel sohasiga']]; advice = ['Uzoq o‘tirmang, har soatda yuring', 'Og‘ir ko‘tarmang', 'Iliq kompress']; }
  else if (has('neckB')) { dx = ['M54.2', 0.55]; meds = [['IBUPROFEN_200', 200, 3, 5, 'Ovqatdan keyin']]; advice = ['Yostiq balandligini tekshiring', 'Yengil bo‘yin mashqlari']; }
  else if (has('kneeR', 'kneeL', 'poplL', 'poplR')) { dx = ['M25.56', 0.5]; diff = [['S93.4', 0.1]]; meds = [['DICLOFENAC_GEL', null, 3, 7, 'Tizzaga'], ['PARACETAMOL_500', 500, 3, 3, 'Og‘riqda']]; advice = ['Tizzaga dam bering', 'Birinchi 48 soat sovuq kompress']; }
  return {
    diagnosis: { icd10: dx[0], title: icdTitle(dx[0]), confidence: dx[1] },
    differential: diff.map((d) => ({ icd10: d[0], title: icdTitle(d[0]), confidence: d[1] })),
    reasoning: 'Belgilangan joylar: ' + segments.map((s) => SEGMENT_NAMES[s.code] + ' ' + s.pain + '/10').join(', ') + (sym.size ? '; belgilar: ' + [...sym].map((k) => SYMPTOMS[k]).join(', ') : '') + '.',
    advice,
    medicines: meds.map((m) => ({ medicineCode: m[0], dosageMg: m[1], timesPerDay: m[2], durationDays: m[3], note: m[4] })),
    redFlags: ['Harorat 3 kundan ortiq tushmasa', 'Nafas qisilsa yoki og‘riq keskin kuchaysa', 'Hushdan ketish yoki qon ketish bo‘lsa'],
    questionsForDoctor: []
  };
}
