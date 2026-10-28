/*!
 * <body-map> — MedAssist interaktiv tana xaritasi (web komponent)
 * Old / orqa tomon (teri, 50+ soha, jarohatlar) va 18 ta ichki a’zo.
 * Hech qanday kutubxonaga bog‘liq emas. Har qanday sayt, React, Vue, Angular yoki WebView’da ishlaydi.
 *
 * Ulanish:   <script type="module" src="body-map.js"></script>
 *            <body-map id="map"></body-map>
 * Qiymat:    map.value = [{ code: 'kidneyL', pain: 7, kind: 'sharp', dur: 0 }, ...]
 * Hodisa:    map.addEventListener('change', (e) => console.log(e.detail.value))
 * Atributlar: view="front|back|organs"  readonly  no-list  no-controls  callouts="auto|on|off"  theme="light|dark"
 */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ======================= MA’LUMOTLAR ======================= */
const SEGMENT_NAMES = {
  head: 'Bosh', throat: 'Tomoq', shR: 'O‘ng yelka', shL: 'Chap yelka', chestR: 'Ko‘krak, o‘ng', chestL: 'Ko‘krak, chap',
  uarmR: 'O‘ng qo‘l, yuqori', uarmL: 'Chap qo‘l, yuqori', farmR: 'O‘ng bilak', farmL: 'Chap bilak', handR: 'O‘ng panja', handL: 'Chap panja',
  epi: 'Qorin, yuqori', abdR: 'Qorin, o‘ng', abdL: 'Qorin, chap', pelvis: 'Qorin, pastki', thighR: 'O‘ng son', thighL: 'Chap son',
  kneeR: 'O‘ng tizza', kneeL: 'Chap tizza', shinR: 'O‘ng boldir', shinL: 'Chap boldir', footR: 'O‘ng oyoq panjasi', footL: 'Chap oyoq panjasi',
  occ: 'Ensa', neckB: 'Bo‘yin, orqa', scapL: 'Kurak, chap', scapR: 'Kurak, o‘ng', midback: 'Orqa, o‘rta', lowL: 'Bel, chap', lowR: 'Bel, o‘ng',
  sacrum: 'Dumg‘aza', hamL: 'Son orqasi, chap', hamR: 'Son orqasi, o‘ng', poplL: 'Tizza osti, chap', poplR: 'Tizza osti, o‘ng',
  calfL: 'Boldir mushagi, chap', calfR: 'Boldir mushagi, o‘ng', heelL: 'Tovon, chap', heelR: 'Tovon, o‘ng',
  earR: 'O‘ng quloq', earL: 'Chap quloq',
  // internal organs
  brain: 'Miya', eyes: 'Ko‘zlar', mouth: 'Og‘iz va tishlar', thyroid: 'Qalqonsimon bez', lungR: 'O‘ng o‘pka', lungL: 'Chap o‘pka', heart: 'Yurak',
  liver: 'Jigar', gallbladder: 'O‘t pufagi', stomach: 'Oshqozon', spleen: 'Taloq', pancreas: 'Oshqozon osti bezi', kidneyR: 'O‘ng buyrak', kidneyL: 'Chap buyrak',
  smallInt: 'Ingichka ichak', colon: 'Yo‘g‘on ichak', appendix: 'Ko‘richak', bladder: 'Qovuq (siydik pufagi)'
};

// Front-view SVG paths (viewBox 0 0 200 432). The back view reuses the shapes mirrored via BACK_MAP.
const SEGMENT_PATHS = {
  head: 'M100 10C82 10 74 24 74 40C74 58 86 70 100 70C114 70 126 58 126 40C126 24 118 10 100 10Z', throat: 'M90 68L110 68L112 84L88 84Z',
  shR: 'M62 88C50 90 42 98 40 112L56 116L62 100Z', shL: 'M138 88C150 90 158 98 160 112L144 116L138 100Z',
  chestR: 'M62 88L100 86L100 136L66 136C62 120 60 104 62 88Z', chestL: 'M138 88L100 86L100 136L134 136C138 120 140 104 138 88Z',
  uarmR: 'M40 112L56 116L52 170L36 168Z', uarmL: 'M160 112L144 116L148 170L164 168Z', farmR: 'M36 168L52 170L46 226L30 224Z', farmL: 'M164 168L148 170L154 226L170 224Z',
  handR: 'M30 224L46 226L46 252C40 258 30 256 28 248Z', handL: 'M170 224L154 226L154 252C160 258 170 256 172 248Z',
  epi: 'M66 136L134 136L132 168L68 168Z', abdR: 'M68 168L100 168L100 206L70 206Z', abdL: 'M132 168L100 168L100 206L130 206Z', pelvis: 'M70 206L130 206L128 232L72 232Z',
  thighR: 'M72 232L100 232L98 316L74 316Z', thighL: 'M128 232L100 232L102 316L126 316Z', kneeR: 'M74 316L98 316L97 340L75 340Z', kneeL: 'M126 316L102 316L103 340L125 340Z',
  shinR: 'M75 340L97 340L94 404L78 404Z', shinL: 'M125 340L103 340L106 404L122 404Z', footR: 'M78 404L94 404L96 424L70 424C70 414 74 408 78 404Z', footL: 'M122 404L106 404L104 424L130 424C130 414 126 408 122 404Z',
  earR: 'M75 33C68 32 66 44 70 50C72 53 76 51 76 48Z', earL: 'M125 33C132 32 134 44 130 50C128 53 124 51 124 48Z'
};
const BACK_MAP = {
  head: 'occ', throat: 'neckB', shR: 'shL', shL: 'shR', chestR: 'scapL', chestL: 'scapR', uarmR: 'uarmL', uarmL: 'uarmR', farmR: 'farmL', farmL: 'farmR',
  handR: 'handL', handL: 'handR', epi: 'midback', abdR: 'lowL', abdL: 'lowR', pelvis: 'sacrum', thighR: 'hamL', thighL: 'hamR', kneeR: 'poplL', kneeL: 'poplR',
  shinR: 'calfL', shinL: 'calfR', footR: 'heelL', footL: 'heelR', earR: 'earL', earL: 'earR'
};

// Internal organs, drawn in this order (later = on top). Same 200×432 coordinate system as the skin map.
// line: true → drawn as a thick tube (stroke is the clickable area).
const ORGANS = {
  brain: { d: 'M100 14C86 14 78 22 78 32C78 40 84 46 92 46C96 46 98 44 100 44C102 44 104 46 108 46C116 46 122 40 122 32C122 22 114 14 100 14Z', fill: '#E7A3B6' },
  eyes: { d: 'M86 51C88 47 94 47 96 51C94 54 88 54 86 51ZM104 51C106 47 112 47 114 51C112 54 106 54 104 51Z', fill: '#F4F1EA' },
  mouth: { d: 'M92 60C96 57 104 57 108 60C105 64 95 64 92 60Z', fill: '#C8545E' },
  thyroid: { d: 'M100 75C97 71 91 71 91 76C91 81 97 81 100 79C103 81 109 81 109 76C109 71 103 71 100 75Z', fill: '#D9826B' },
  lungR: { d: 'M96 92C88 90 76 94 72 106C68 118 68 130 70 138C78 140 90 138 96 134Z', fill: '#EFA3A3' },
  lungL: { d: 'M104 92C112 90 124 94 128 106C132 118 132 130 130 138C124 140 116 139 110 136C112 128 108 122 104 120Z', fill: '#EFA3A3' },
  heart: { d: 'M104 108C99 104 93 108 94 115C95 123 104 130 110 134C116 128 122 120 121 113C120 106 113 104 109 109C108 108 106 107 104 108Z', fill: '#C93C47' },
  liver: { d: 'M70 140C80 135 98 135 112 139C108 147 100 153 90 157C82 159 74 157 70 151Z', fill: '#9E4A45' },
  spleen: { d: 'M128 140C135 140 137 149 135 156C133 161 128 159 128 152Z', fill: '#874062' },
  stomach: { d: 'M112 140C120 136 130 140 130 150C130 160 122 168 112 168C104 168 100 165 102 160C110 160 116 156 116 150C116 146 114 144 112 140Z', fill: '#E3958D' },
  gallbladder: { d: 'M86 152C83 156 85 163 90 163C94 163 95 157 92 152Z', fill: '#7FA65A' },
  pancreas: { d: 'M92 162C100 160 112 162 124 160C126 163 124 166 120 166C110 167 100 167 92 166Z', fill: '#E7BE73' },
  smallInt: { d: 'M86 180C94 176 106 176 114 180C118 188 118 200 114 206C106 210 94 210 86 206C82 198 82 188 86 180Z', fill: '#EDB39C' },
  colon: { d: 'M80 206C76 196 76 182 78 173C90 168 110 168 122 173C124 184 124 198 122 210C118 216 110 214 104 216', fill: '#D98C74', line: 7 },
  appendix: { d: 'M76 207C73 211 74 218 78 219C81 218 81 212 80 208Z', fill: '#C97A63' },
  kidneyR: { d: 'M78 158C72 158 70 166 71 172C72 178 76 182 81 181C84 180 84 176 82 173C80 170 80 166 83 164C85 161 83 158 78 158Z', fill: '#943A3F' },
  kidneyL: { d: 'M122 158C128 158 130 166 129 172C128 178 124 182 119 181C116 180 116 176 118 173C120 170 120 166 117 164C115 161 117 158 122 158Z', fill: '#943A3F' },
  bladder: { d: 'M92 216C92 210 108 210 108 216C108 224 104 228 100 228C96 228 92 224 92 216Z', fill: '#E3C566' }
};
const isOrgan = (code) => !!ORGANS[code];
const BACK_ONLY = new Set(Object.values(BACK_MAP).filter((v) => !SEGMENT_PATHS[v]));
const SHARED = new Set(Object.values(BACK_MAP).filter((v) => SEGMENT_PATHS[v]));
const segmentSide = (code) => (ORGANS[code] ? 'organ' : BACK_ONLY.has(code) ? 'back' : SHARED.has(code) ? 'both' : 'front');

const PAIN_KINDS = { sharp: 'O‘tkir, sanchiqli', dull: 'Simillovchi', burn: 'Achishuvchi', press: 'Siquvchi', pulse: 'Lo‘qillovchi', numb: 'Uvishish' };
// Skin / injury types — only for outer body areas, not for internal organs.
const INJURY_KINDS = { cut: 'Kesilgan', abrasion: 'Shilingan', thermal: 'Kuygan', bruise: 'Ko‘kargan', swelling: 'Shishgan', rash: 'Toshma, qichishish', bite: 'Tishlagan yoki chaqqan', fracture: 'Sinish gumoni' };
if (Object.keys(INJURY_KINDS).some((k) => PAIN_KINDS[k])) throw new Error('PAIN_KINDS and INJURY_KINDS keys must not overlap');
const kindLabel = (k) => PAIN_KINDS[k] || INJURY_KINDS[k] || k;
const DURATIONS = ['Bugun', '1–3 kun', '4–7 kun', '1 haftadan ko‘p'];

const painColor = (p) => (p >= 8 ? '#EF4444' : p >= 5 ? '#F97316' : p >= 3 ? '#F59E0B' : p >= 1 ? '#EAB308' : '#94A3B8');
const painWord = (p) => (p === 0 ? 'Yo‘q' : p <= 3 ? 'Yengil' : p <= 6 ? 'O‘rtacha' : p <= 8 ? 'Kuchli' : 'Chidab bo‘lmas');
/* ======================= CHIZISH (SVG) ======================= */
const fx = (n) => Math.round(n * 10) / 10;
function smooth(pts) {
  const n = pts.length; let d = 'M' + pts[0].join(' ');
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += 'C' + fx(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + fx(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + fx(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + fx(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ' ' + p2[1];
  }
  return d + 'Z';
}
const HALF = [[90, 64], [89, 78], [84, 83], [72, 86], [60, 89], [50, 94], [43, 103], [39, 116], [37, 132], [36, 150], [35, 166], [33, 184], [31, 204], [30, 222], [28, 232], [26, 246], [28, 256], [34, 260], [40, 258], [44, 252], [46, 240], [47, 226], [49, 206], [51, 188], [53, 170], [55, 152], [57, 138], [61, 130], [64, 138], [66, 156], [68, 176], [68, 192], [69, 206], [71, 220], [72, 236], [72, 256], [73, 276], [74, 298], [75, 316], [76, 330], [76, 342], [74, 356], [75, 372], [77, 390], [78, 402], [74, 410], [68, 418], [68, 424], [80, 426], [95, 425], [96, 416], [94, 404], [95, 386], [97, 366], [97, 346], [97, 330], [98, 312], [99, 286], [99, 262], [100, 246]];
const SILHOUETTE = smooth(HALF.concat(HALF.slice(0, -1).reverse().map(([x, y]) => [200 - x, y])));
const nums = (d) => (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
const mirror = (d) => { let i = 0; return d.replace(/-?\d+(\.\d+)?/g, (m) => (i++ % 2 === 0 ? String(fx(200 - Number(m))) : m)); };
const both = (arr) => arr.concat(arr.map(mirror));
// Anatomical muscle groups (écorché style). Drawn for the viewer-left half and mirrored.
const MUSCLES = {
  front: both([
    'M91 66C92 72 96 80 99 85L96 86C93 79 90 72 89 67Z',                                                     // sternocleidomastoid
    'M89 74C84 80 76 84 66 87L72 88C80 87 86 84 90 80Z',                                                     // upper trapezius
    'M66 87C56 88 46 94 42 104C40 112 40 120 41 126C45 120 50 112 54 108C58 104 62 100 66 98C70 96 72 92 70 88Z', // deltoid
    'M99 88C90 87 78 88 70 90C64 96 60 108 60 118C64 126 76 130 88 130C94 130 98 128 99 126Z',               // pectoralis major
    'M44 120C40 132 39 148 41 162C45 168 51 166 53 158C55 146 55 132 52 122C49 118 46 118 44 120Z',           // biceps
    'M40 168C36 182 33 200 31 218C34 224 42 224 46 220C48 204 50 186 52 172C48 166 43 165 40 168Z',           // forearm flexors
    'M64 132C66 134 70 136 73 135L72 131C69 132 66 131 64 132ZM65 139C67 141 71 143 74 142L73 138C70 139 67 138 65 139ZM66 146C68 148 72 150 75 149L74 145C71 146 68 145 66 146Z', // serratus
    'M66 150C65 164 67 180 70 194C74 202 80 208 86 212C86 196 86 170 86 152C80 148 72 147 66 150Z',          // external oblique
    'M87 132C91 131 96 131 99 132L99 148C95 149 91 149 87 148Z',                                              // rectus abdominis 1
    'M87 151C91 150 96 150 99 151L99 166C95 167 91 167 87 166Z',                                              // 2
    'M87 169C91 168 96 168 99 169L99 184C95 185 91 185 87 184Z',                                              // 3
    'M87 187C91 186 96 186 99 187L99 228C95 222 90 214 87 206Z',                                              // lower rectus
    'M70 214C72 222 74 232 76 242C80 236 84 228 86 218C80 214 74 212 70 214Z',                                // tensor / iliopsoas
    'M73 244C72 266 73 292 76 312C80 314 82 310 82 304C82 284 80 262 78 246Z',                                // vastus lateralis
    'M80 238C78 260 80 290 84 312C88 314 92 312 92 306C92 284 90 258 86 240Z',                                // rectus femoris
    'M92 280C90 294 90 306 94 316C98 316 99 308 99 300C99 290 97 282 94 276Z',                                // vastus medialis
    'M95 248C93 262 93 274 95 282C98 274 99 262 99 250Z',                                                     // adductors
    'M76 346C74 360 76 378 78 396L81 396C81 378 80 360 80 346Z',                                              // peroneus
    'M81 344C79 364 80 384 83 400L89 400C89 384 89 362 87 344Z',                                              // tibialis anterior
    'M89 344C94 352 96 366 95 380C93 386 90 382 89 374C88 362 88 352 89 344Z'                                 // gastrocnemius (medial)
  ]),
  back: ['M100 70C96 78 88 84 66 88C74 96 86 104 92 120C96 140 98 158 100 170C102 158 104 140 108 120C114 104 126 96 134 88C112 84 104 78 100 70Z'].concat(both([ // trapezius
    'M66 87C56 88 46 94 42 104C40 112 40 120 41 126C45 120 50 112 54 108C58 104 62 100 66 98C70 96 72 92 70 88Z', // deltoid
    'M70 100C66 110 66 120 70 126C78 128 86 124 90 118C88 110 82 102 76 98Z',                                 // infraspinatus / teres
    'M66 128C64 146 66 166 72 186C80 194 90 198 98 200C96 184 94 166 92 148C86 136 76 129 66 128Z',           // latissimus dorsi
    'M93 140C92 162 93 186 96 212L99.4 214L99.4 140Z',                                                        // erector spinae
    'M42 120C38 134 38 150 41 164C46 168 52 166 54 156C55 142 54 128 50 120C47 116 44 116 42 120Z',           // triceps
    'M40 168C36 182 33 200 31 218C34 224 42 224 46 220C48 204 50 186 52 172C48 166 43 165 40 168Z',           // forearm extensors
    'M70 204C70 210 72 214 76 214C84 210 92 210 98 214C94 206 84 200 74 200Z',                                // gluteus medius
    'M72 216C68 228 70 240 78 248C86 252 96 250 99.4 244L99.4 224C92 216 82 212 72 216Z',                     // gluteus maximus
    'M74 256C73 276 75 296 80 314C84 316 86 312 86 306C86 284 84 266 80 254Z',                                // biceps femoris
    'M86 254C86 276 88 296 92 316C96 316 98 310 98 302C98 284 96 266 92 254Z',                                // semitendinosus
    'M76 344C72 356 73 374 78 384C82 382 86 372 86 360C86 352 82 344 76 344Z',                                // gastrocnemius lateral
    'M88 344C94 350 98 362 96 376C94 386 88 386 86 378C85 366 85 354 88 344Z',                                // gastrocnemius medial
    'M80 384C80 392 82 398 84 402L90 402C92 396 92 390 92 384Z'                                               // achilles / soleus
  ]))
};
const TENDON = { front: ['M99 88L101 88L101 228L99 228Z'], back: [] };                                       // linea alba
const SKIN_PARTS = {
  front: both(['M30 222C27 230 25 244 27 254C30 260 39 261 43 255C46 246 47 234 46 224C41 226 34 226 30 222Z', 'M78 400C74 410 68 418 68 424C76 427 90 427 95 425C96 418 95 410 94 400Z']),
  back: both(['M30 222C27 230 25 244 27 254C30 260 39 261 43 255C46 246 47 234 46 224C41 226 34 226 30 222Z', 'M78 400C76 410 74 418 76 424C82 427 92 427 94 424C95 416 94 408 93 400Z'])
};
// Hair is drawn after the body-wide highlight overlay (see render order below) so it stays crisp, not washed out.
const HAIR_COLOR = '#3A2A1F';
const HAIR = '<path d="M76 34C73 18 85 9 100 9C115 9 127 18 124 34C120 25 111 21 100 21C89 21 80 25 76 34Z" fill="' + HAIR_COLOR + '"/>' +
  '<path d="M81 27C85 19 95 15 103 16C97 15.5 88 18 83 27Z" fill="#6B4A36" opacity=".55"/>' +
  both(['M76 32C74 37 74 42 77 46L80.5 45C78.5 41 77.5 36 78.5 32Z']).map((d) => '<path d="' + d + '" fill="' + HAIR_COLOR + '"/>').join('');
const FACE = both(['M85 37Q91 33.5 96.5 37']).map((d) => '<path d="' + d + '" fill="none" stroke="#4A2E22" stroke-width="1.8" stroke-linecap="round"/>').join('') +
  both(['M85.3 42.8C87.8 39.6 94.7 39.6 97.2 42.8C94.7 46 87.8 46 85.3 42.8Z']).map((d) => '<path d="' + d + '" fill="#FAF5EE" stroke="#7A4A3E" stroke-width=".5"/>').join('') +
  '<circle cx="91.2" cy="42.8" r="2.1" fill="#3B2A26"/><circle cx="108.8" cy="42.8" r="2.1" fill="#3B2A26"/>' +
  '<circle cx="90.5" cy="42" r=".6" fill="#fff" opacity=".9"/><circle cx="108.1" cy="42" r=".6" fill="#fff" opacity=".9"/>' +
  '<path d="M100 44C99 49 97 52 96.5 54C97.5 56.5 102.5 56.5 103.5 54C103 52 101 49 100 44" fill="none" stroke="#9A5A4C" stroke-width="1.1" stroke-linecap="round"/>' +
  '<path d="M93 60.5C96 58.5 104 58.5 107 60.5C104 63 96 63 93 60.5Z" fill="#B65A54"/><path d="M93 60.5Q100 61.6 107 60.5" stroke="#7E3530" stroke-width=".6" fill="none"/>' +
  both(['M78 44C79 54 84 62 92 67']).map((d) => '<path d="' + d + '" fill="none" stroke="#B9755F" stroke-opacity=".5" stroke-width="1.4"/>').join('');
const HAIR_BACK = '<path d="M75 36C72 18 85 9 100 9C115 9 128 18 125 36C128 45 128 56 123 62C118 51 110 47 100 47C90 47 82 51 77 62C72 56 72 45 75 36Z" fill="' + HAIR_COLOR + '"/>' +
  '<path d="M82 24C88 15 100 12 108 14C100 13 90 16 85 25Z" fill="#6B4A36" opacity=".45"/>';
const BACK_HEAD = '<path d="M100 84L100 226" stroke="#6E2A26" stroke-width="1.6" stroke-dasharray="1.6 3" stroke-linecap="round"/>';
const KNEECAP = '<ellipse cx="86" cy="328" rx="6.5" ry="8" fill="#E9C2A8" stroke="#A35A4E" stroke-width=".6"/><ellipse cx="114" cy="328" rx="6.5" ry="8" fill="#E9C2A8" stroke="#A35A4E" stroke-width=".6"/>';
// skeleton for the organ view
const BONES = both([0, 1, 2, 3, 4, 5].map((i) => 'M98.5 ' + (96 + i * 8) + 'C88 ' + (93 + i * 8) + ' 74 ' + (98 + i * 8) + ' 68 ' + (112 + i * 9)))
  .concat(both(['M99 86C90 84 76 85 64 90']))
  .concat(['M100 88L100 138', 'M70 206C66 218 72 230 84 232C90 234 96 232 100 236C104 232 110 234 116 232C128 230 134 218 130 206C124 214 112 214 100 222C88 214 76 214 70 206Z']);
const TRACHEA = '<path d="M100 66L100 98M100 98C96 100 92 104 88 110M100 98C104 100 108 104 112 110M88 110L84 118M88 110L90 120M112 110L116 118M112 110L110 120" stroke="#E8D9CC" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".9"/>';
// decorative detail drawn on top of each organ (not clickable)
const ORGAN_DETAIL = {
  brain: 'M100 16L100 44M84 24C88 22 90 26 94 24M82 32C86 30 88 34 92 32C94 34 96 30 98 32M106 24C110 22 112 26 116 24M102 32C106 30 108 34 112 32C114 34 116 30 118 32M84 39C88 37 92 41 96 39M104 39C108 37 112 41 116 39',
  lungR: 'M94 104C86 110 80 116 72 118M94 120C86 124 78 128 70 132', lungL: 'M106 104C114 110 120 116 128 118',
  heart: 'M106 108C106 100 112 96 116 98M110 107C110 102 104 98 98 100M99 113C104 117 112 118 118 114',
  liver: 'M96 138C96 144 94 150 90 156', stomach: 'M108 152C114 150 120 148 126 146M106 158C114 157 120 155 126 152',
  smallInt: 'M88 184C92 180 96 188 100 184C104 180 108 188 112 184M86 192C90 188 94 196 98 192C102 188 106 196 110 192C112 190 114 192 115 193M86 200C90 196 94 204 98 200C102 196 106 204 110 200C112 198 114 200 114 202',
  kidneyR: 'M80 168C78 170 78 174 80 176M82 172L94 214', kidneyL: 'M120 168C122 170 122 174 120 176M118 172L106 214',
  pancreas: 'M96 164C104 163 112 164 120 163'
};
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))))); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); };
const GLYPH = {
  cut: '<path d="M-3 3L3 -3" stroke="#B91C1C" stroke-width="1.6" stroke-linecap="round"/>',
  abrasion: '<path d="M-3 -1L1 -3M-3 1.2L3 -1.8M-1 3L3 0.6" stroke="#C2410C" stroke-width="1.1" stroke-linecap="round"/>',
  thermal: '<path d="M0 -3.6C2 -1 3 .5 3 1.6C3 3.2 1.6 4 0 4C-1.6 4 -3 3.2 -3 1.6C-3 0 -1 -1 0 -3.6Z" fill="#EA580C"/>',
  bruise: '<circle r="2.8" fill="#7C3AED"/>',
  swelling: '<circle r="1.6" fill="#DB2777"/><circle r="3.3" fill="none" stroke="#DB2777" stroke-width="1"/>',
  rash: '<circle cx="-1.8" cy="-1.4" r="1.1" fill="#DC2626"/><circle cx="1.8" cy="-.6" r="1.1" fill="#DC2626"/><circle cx="-.4" cy="2" r="1.1" fill="#DC2626"/>',
  bite: '<path d="M-3 -1Q0 -4 3 -1M-3 1Q0 4 3 1" stroke="#9F1239" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
  fracture: '<path d="M-3.6 0L-1.6 -2.2L.4 2.2L2.4 -2.2L3.6 0" stroke="#1D4ED8" stroke-width="1.3" fill="none" stroke-linejoin="round"/>'
};
// Shared with the plain-SVG bodyMap() in ui.js, so a doctor reviewing a case sees the same cut/abrasion/fracture marks the patient drew.
export const INJURY_GLYPH = GLYPH;
function centroid(d) { const n = nums(d); let x = 0, y = 0, k = 0; for (let i = 0; i + 1 < n.length; i += 2) { x += n[i]; y += n[i + 1]; k++; } return [x / k, y / k]; }
let mapSeq = 0;

// sel: { code: {pain, kind} } · view: front | back | organs · act: action for clickable areas · callouts: label boxes beside the body
function bodyMap({ view = 'front', sel = {}, open = null, act = null, width = 220, callouts = false }) {
  const id = 'bm' + (++mapSeq);
  const organs = view === 'organs';
  const shapes = organs ? Object.keys(ORGANS).map((code) => ({ code, d: ORGANS[code].d, organ: ORGANS[code] }))
    : Object.keys(SEGMENT_PATHS).map((k) => ({ code: view === 'front' ? k : BACK_MAP[k], d: SEGMENT_PATHS[k] }));
  const hitAttrs = (code, v) => act ? ' data-act="' + act + '" data-code="' + code + '" tabindex="0" role="button" aria-label="' + esc(SEGMENT_NAMES[code]) + (v ? ', ' + v.pain + ' dan 10' + (v.kind ? ', ' + esc(kindLabel(v.kind)) : '') : '') + '"' : '';
  const title = (code, v) => '<title>' + esc(SEGMENT_NAMES[code]) + (v ? ' — ' + v.pain + '/10' + (v.kind ? ', ' + esc(kindLabel(v.kind)) : '') : '') + '</title>';

  const G = (n) => 'url(#' + id + n + ')';
  let defs = '<defs>' +
    '<radialGradient id="' + id + 's" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#F6D3BF"/><stop offset=".6" stop-color="#E3A98F"/><stop offset="1" stop-color="#B9715F"/></radialGradient>' +
    '<linearGradient id="' + id + 'm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2A08F"/><stop offset=".45" stop-color="#D2675C"/><stop offset="1" stop-color="#9C3B36"/></linearGradient>' +
    '<linearGradient id="' + id + 'u" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7A2A27"/><stop offset=".5" stop-color="#9A3E38"/><stop offset="1" stop-color="#7A2A27"/></linearGradient>' +
    '<pattern id="' + id + 'f" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(12)"><path d="M0 0L0 2.4" stroke="#5E1C1A" stroke-opacity=".22" stroke-width=".55"/></pattern>' +
    '<radialGradient id="' + id + 'h" cx="32%" cy="28%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>' +
    '<filter id="' + id + 'g" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>' +
    '<filter id="' + id + 'd" x="-20%" y="-10%" width="140%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000" flood-opacity=".28"/></filter>' +
    '<clipPath id="' + id + 'c"><path d="' + SILHOUETTE + '"/><ellipse cx="100" cy="40" rx="25" ry="30"/><path d="' + SEGMENT_PATHS.earR + '"/><path d="' + SEGMENT_PATHS.earL + '"/></clipPath>' +
    '<filter id="' + id + 'b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>' +
    '</defs>';
  // body: deep under-layer (gaps between muscles read as crevices), muscles with fibre texture, skin on head/hands/feet
  const side = organs ? 'front' : view;
  const muscles = MUSCLES[side];
  let body = '<g style="pointer-events:none;opacity:' + (organs ? .32 : 1) + '" filter="' + G('d') + '">' +
    '<path d="' + SILHOUETTE + '" fill="' + G('u') + '" stroke="#6B2422" stroke-width=".8"/>' +
    muscles.map((d) => '<path d="' + d + '" fill="' + G('m') + '" stroke="#5E1E1C" stroke-width=".8"/>').join('') +
    '<g>' + muscles.map((d) => '<path d="' + d + '" fill="' + G('f') + '"/>').join('') + '</g>' +
    TENDON[side].map((d) => '<path d="' + d + '" fill="#EBD6C6" opacity=".85"/>').join('') +
    SKIN_PARTS[side].map((d) => '<path d="' + d + '" fill="' + G('s') + '" stroke="#A35A4E" stroke-width=".6"/>').join('') +
    '<ellipse cx="100" cy="40" rx="25" ry="30" fill="' + G('s') + '" stroke="#A35A4E" stroke-width=".8"/>' +
    '<path d="' + SILHOUETTE + '" fill="' + G('h') + '" opacity=".55"/>' +
    // Hair and face sit above the body-wide highlight so they stay crisp instead of being washed out by it.
    (side === 'front' ? HAIR + FACE + KNEECAP : HAIR_BACK + BACK_HEAD) +
    '</g>';
  if (organs) body += '<g style="pointer-events:none" fill="none" stroke="#F3E7D8" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round">' + BONES.map((d) => '<path d="' + d + '"' + (d.endsWith('Z') ? ' fill="#F3E7D8" fill-opacity=".35" stroke-width="1.4"' : '') + '/>').join('') + '</g>' + TRACHEA;
  // areas
  let areas = '', tint = '';
  for (const sh of shapes) {
    const v = sel[sh.code]; const on = open === sh.code; const col = v ? painColor(v.pain) : null;
    if (organs) {
      const o = sh.organ; const gid = id + 'o' + sh.code;
      defs = defs.replace('</defs>', '<radialGradient id="' + gid + '" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="' + shade(o.fill, .35) + '"/><stop offset=".55" stop-color="' + o.fill + '"/><stop offset="1" stop-color="' + shade(o.fill, -.35) + '"/></radialGradient></defs>');
      if (o.line) {
        if (v || on) areas += '<path d="' + sh.d + '" fill="none" stroke="' + (on ? 'var(--primary)' : col) + '" stroke-width="' + (o.line + 4) + '" stroke-linecap="round" style="pointer-events:none"/>';
        areas += '<path d="' + sh.d + '" fill="none" stroke="' + o.fill + '" stroke-width="' + o.line + '" stroke-linecap="round" class="' + (act ? 'hit tube' : '') + '" style="pointer-events:' + (act ? 'visibleStroke' : 'none') + '"' + hitAttrs(sh.code, v) + '>' + title(sh.code, v) + '</path>' +
          '<path d="' + sh.d + '" fill="none" stroke="' + shade(o.fill, -.3) + '" stroke-width="' + o.line + '" stroke-dasharray=".8 3.2" style="pointer-events:none"/>' +
          '<path d="' + sh.d + '" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" transform="translate(-.8 -.8)" style="pointer-events:none"/>';
      } else {
        areas += '<path d="' + sh.d + '" fill="url(#' + gid + ')" stroke="' + (on ? '#fff' : col || shade(o.fill, -.45)) + '" stroke-width="' + (on || v ? 1.8 : .7) + '"' + (on ? ' stroke-dasharray="3 2"' : '') + ' class="' + (act ? 'hit organ' : '') + '"' + hitAttrs(sh.code, v) + '>' + title(sh.code, v) + '</path>' +
          (ORGAN_DETAIL[sh.code] ? '<path d="' + ORGAN_DETAIL[sh.code] + '" fill="none" stroke="' + shade(o.fill, -.4) + '" stroke-opacity=".7" stroke-width=".7" stroke-linecap="round" style="pointer-events:none"/>' : '') +
          '<path d="' + sh.d + '" fill="' + G('h') + '" style="pointer-events:none"/>';
      }
    } else {
      // invisible hit areas on top of the realistic body; tinted only when selected
      // soft tint that follows the body contour (clipped + blurred), then an invisible hit area
      if (v) tint += '<path d="' + sh.d + '" fill="' + col + '" fill-opacity=".5" filter="' + G('b') + '"/>';
      if (on) tint += '<path d="' + sh.d + '" fill="none" stroke="#fff" stroke-width="1.4" stroke-dasharray="3 2.5"/>';
      areas += '<path d="' + sh.d + '" style="fill:#fff;fill-opacity:0;stroke:transparent;stroke-width:0" class="' + (act ? 'hit' : '') + '"' + hitAttrs(sh.code, v) + '>' + title(sh.code, v) + '</path>';
    }
  }
  if (tint) areas = '<g clip-path="' + G('c') + '" style="pointer-events:none">' + tint + '</g>' + areas;
  // hotspots + injury markers + callouts for visible selections
  const visible = shapes.filter((sh) => sel[sh.code]).map((sh) => ({ code: sh.code, v: sel[sh.code], c: centroid(sh.d) }));
  let fx1 = '<g style="pointer-events:none">';
  for (const it of visible) {
    const col = painColor(it.v.pain);
    fx1 += '<circle cx="' + fx(it.c[0]) + '" cy="' + fx(it.c[1]) + '" r="' + (6 + it.v.pain * 0.9) + '" fill="' + col + '" opacity=".75" filter="url(#' + id + 'g)"/>';
    if (GLYPH[it.v.kind]) fx1 += '<g transform="translate(' + fx(it.c[0]) + ' ' + fx(it.c[1]) + ')"><circle r="5.6" fill="#fff" stroke="' + col + '" stroke-width="1.4"/>' + GLYPH[it.v.kind] + '</g>';
    else fx1 += '<circle cx="' + fx(it.c[0]) + '" cy="' + fx(it.c[1]) + '" r="2.4" fill="#fff" opacity=".9"/>';
  }
  fx1 += '</g>';
  let labels = '';
  if (callouts && visible.length) {
    const place = (list, left) => {
      let next = 0;
      list.sort((a, b) => a.c[1] - b.c[1]).forEach((it) => {
        const col = painColor(it.v.pain);
        const l1 = SEGMENT_NAMES[it.code], l2 = it.v.pain + '/10' + (it.v.kind ? ' · ' + kindLabel(it.v.kind) : '');
        const w = Math.max(l1.length * 5.5, l2.length * 4.9) + 18;
        const y = Math.min(Math.max(it.c[1] - 14, next), organs ? 210 : 400); next = y + 32;
        const gap = organs ? 26 : 16; const x = left ? gap - w : 200 - gap; const ex = left ? gap : 200 - gap;
        labels += '<path d="M' + fx(it.c[0]) + ' ' + fx(it.c[1]) + 'L' + ex + ' ' + fx(y + 14) + '" stroke="' + col + '" stroke-width=".9" fill="none"/>' +
          '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(w) + '" height="28" rx="8" style="fill:var(--glass-strong);stroke:' + col + '" stroke-width="1"/>' +
          '<rect x="' + fx(left ? x + w - 4 : x) + '" y="' + fx(y + 6) + '" width="4" height="16" rx="2" fill="' + col + '"/>' +
          '<text x="' + fx(x + (left ? 8 : 10)) + '" y="' + fx(y + 12) + '" style="fill:var(--ink);font-size:9px;font-weight:800">' + esc(l1) + '</text>' +
          '<text x="' + fx(x + (left ? 8 : 10)) + '" y="' + fx(y + 23) + '" style="fill:var(--ink-2);font-size:8px;font-weight:600">' + esc(l2) + '</text>';
      });
    };
    labels = '<g style="pointer-events:none">';
    place(visible.filter((it) => it.c[0] < 100), true);
    place(visible.filter((it) => it.c[0] >= 100), false);
    labels += '</g>';
  }
  const vb = organs ? (callouts ? '-112 4 424 236' : '30 4 140 236') : (callouts ? '-114 -4 428 436' : '0 -4 200 436');
  const label = 'Tana xaritasi, ' + (organs ? 'ichki a’zolar' : view === 'front' ? 'old tomoni' : 'orqa tomoni');
  return '<svg class="body-svg" viewBox="' + vb + '" width="' + width + '" role="' + (act ? 'group' : 'img') + '" aria-label="' + label + '" style="font-family:inherit' + (organs ? ';overflow:hidden' : '') + '">' + defs + body + areas + fx1 + labels + '</svg>';
}
/* ======================= MATNLAR (tarjima uchun shu yerni o‘zgartiring) ======================= */
const TEXT = {
  front: 'Old', back: 'Orqa', organs: 'A’zolar', painLevel: 'Og‘riq darajasi', painNone: 'Og‘riq yo‘q', painMax: 'Chidab bo‘lmas',
  painKind: 'Og‘riq qanday?', injury: 'Yoki jarohat, teri muammosi', since: 'Qachondan beri?', remove: 'Olib tashlash', save: 'Saqlash',
  selected: 'Tanlangan joylar', none: 'Hali joy tanlanmadi. Tanadagi joyni bosing.', organ: 'ichki a’zo', sideFront: 'old', sideBack: 'orqa',
  organHint: 'Ichki a’zoni bosing yoki ro‘yxatdan tanlang', clear: 'Tozalash'
};

/* ======================= USLUBLAR ======================= */
const CSS = `
:host { --bm-primary: #2F5BFF; --bm-ink: #0B1530; --bm-ink-2: #4A5878; --bm-bg: rgba(255,255,255,.75); --bm-panel: #ffffff; --bm-fill: rgba(11,21,48,.05); --bm-line: rgba(11,21,48,.12);
  display: block; font-family: inherit; color: var(--bm-ink); --primary: var(--bm-primary); --ink: var(--bm-ink); --ink-2: var(--bm-ink-2); --glass-strong: var(--bm-bg); }
:host([theme="dark"]) { --bm-ink: #EEF2FF; --bm-ink-2: #A9B4D0; --bm-bg: rgba(22,31,60,.86); --bm-panel: #131c38; --bm-fill: rgba(255,255,255,.06); --bm-line: rgba(255,255,255,.14); --bm-primary: #5C80FF; }
@media (prefers-color-scheme: dark) { :host(:not([theme="light"])) { --bm-ink: #EEF2FF; --bm-ink-2: #A9B4D0; --bm-bg: rgba(22,31,60,.86); --bm-panel: #131c38; --bm-fill: rgba(255,255,255,.06); --bm-line: rgba(255,255,255,.14); --bm-primary: #5C80FF; } }
* { box-sizing: border-box; }
.wrap { display: flex; flex-direction: column; gap: 14px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.hint { font-size: 13px; color: var(--bm-ink-2); }
.seg { display: inline-flex; padding: 4px; border-radius: 14px; background: var(--bm-fill); gap: 2px; }
.seg button { min-height: 34px; padding: 0 14px; border: 0; border-radius: 10px; background: none; font: inherit; font-weight: 700; font-size: 13.5px; color: var(--bm-ink-2); cursor: pointer; }
.seg button[aria-pressed="true"] { background: var(--bm-panel); color: var(--bm-ink); box-shadow: 0 1px 3px rgba(0,0,0,.15); }
.stage { display: flex; justify-content: center; }
.body-svg { display: block; width: 100%; height: auto; overflow: visible; }
.body-svg path { transition: fill .15s, stroke .15s; }
.body-svg path.hit { cursor: pointer; outline: none; }
.body-svg path.hit:not(.tube):not(.organ):hover { fill-opacity: .16 !important; }
.body-svg path.hit.organ:hover, .body-svg path.hit.tube:hover { filter: brightness(1.15) saturate(1.2); }
.body-svg path.hit:focus-visible { stroke: var(--bm-primary) !important; stroke-width: 2.6 !important; }
.legend { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; font-size: 12px; color: var(--bm-ink-2); font-weight: 600; }
.legend span { display: inline-flex; align-items: center; gap: 6px; } .legend i { width: 9px; height: 9px; border-radius: 50%; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { min-height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--bm-line); background: var(--bm-bg); color: var(--bm-ink); font: inherit; font-weight: 650; font-size: 14px; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--bm-ink); color: var(--bm-panel); border-color: transparent; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--bm-fill); border: 0; width: 100%; text-align: left; font: inherit; color: var(--bm-ink); cursor: pointer; }
.row .bar { width: 5px; align-self: stretch; border-radius: 4px; }
.row .grow { flex: 1; min-width: 0; } .row small { color: var(--bm-ink-2); font-size: 13px; } .row b.p { font-size: 15px; }
.muted { color: var(--bm-ink-2); font-size: 14px; }
h4 { margin: 0; font-size: 14px; }
.overlay { position: fixed; inset: 0; background: rgba(6,10,22,.45); z-index: 1000; }
.sheet { position: fixed; z-index: 1001; left: 50%; bottom: 0; transform: translateX(-50%); width: min(560px, 100%); max-height: 90vh; overflow: auto; padding: 22px; border-radius: 28px 28px 0 0; background: var(--bm-panel); color: var(--bm-ink); box-shadow: 0 -20px 60px rgba(0,0,0,.3); display: flex; flex-direction: column; gap: 18px; }
@media (min-width: 720px) { .sheet { top: 50%; bottom: auto; transform: translate(-50%, -50%); border-radius: 28px; } }
.sheet h3 { margin: 0; font-size: 21px; }
.badge { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 999px; color: #fff; font-weight: 800; font-size: 13px; white-space: nowrap; }
.scale { display: grid; grid-template-columns: repeat(11, minmax(0,1fr)); gap: 5px; }
.scale button { min-height: 44px; border-radius: 11px; border: 1px solid var(--bm-line); background: var(--bm-bg); color: var(--bm-ink); font: inherit; font-weight: 800; cursor: pointer; padding: 0; }
.between { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.xs { font-size: 12px; color: var(--bm-ink-2); }
.btn { min-height: 46px; padding: 0 20px; border-radius: 14px; border: 0; font: inherit; font-weight: 700; cursor: pointer; }
.btn.primary { background: linear-gradient(135deg, #2F5BFF, #6A5BFF); color: #fff; box-shadow: 0 10px 24px -10px rgba(47,91,255,.7); }
.btn.danger { background: rgba(240,68,82,.12); color: #C81E33; }
:focus-visible { outline: 3px solid var(--bm-primary); outline-offset: 2px; }
`;

/* ======================= KOMPONENT ======================= */
const ORGAN_LIST = Object.keys(ORGANS);
const PAIN_LEGEND = '<div class="legend"><span><i style="background:#EAB308"></i>1–2</span><span><i style="background:#F59E0B"></i>3–4</span><span><i style="background:#F97316"></i>5–7</span><span><i style="background:#EF4444"></i>8–10</span></div>';
const VALID = (s) => s && SEGMENT_NAMES[s.code] && (PAIN_KINDS[s.kind] || (INJURY_KINDS[s.kind] && !isOrgan(s.code)));

class BodyMap extends HTMLElement {
  static get observedAttributes() { return ['view', 'readonly', 'no-list', 'no-controls', 'callouts', 'theme']; }
  constructor() {
    super();
    this._sel = {};
    this._open = null;
    this._wide = false;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.addEventListener('click', (e) => this._onClick(e));
    this.shadowRoot.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.act) { e.preventDefault(); this._onClick(e); }
      if (e.key === 'Escape' && this._open) { this._open = null; this._render(); }
    });
  }
  connectedCallback() {
    this._ro = new ResizeObserver(() => { const w = this.clientWidth >= 560; if (w !== this._wide) { this._wide = w; this._render(); } });
    this._ro.observe(this);
    this._render();
  }
  disconnectedCallback() { if (this._ro) this._ro.disconnect(); }
  attributeChangedCallback() { if (this.isConnected) this._render(); }

  /** Tanlangan joylar: [{code, pain 0–10, kind, dur 0–3}] */
  get value() { return Object.entries(this._sel).map(([code, v]) => ({ code, name: SEGMENT_NAMES[code], pain: v.pain, kind: v.kind, kindLabel: kindLabel(v.kind), dur: v.dur, durLabel: DURATIONS[v.dur] })); }
  set value(arr) { this._sel = {}; (Array.isArray(arr) ? arr : []).filter(VALID).forEach((s) => { this._sel[s.code] = { pain: Math.max(0, Math.min(10, Number(s.pain) || 0)), kind: s.kind, dur: Math.max(0, Math.min(3, Number(s.dur) || 0)) }; }); this._render(); }
  get view() { return this.getAttribute('view') || 'front'; }
  set view(v) { this.setAttribute('view', v); }
  clear() { this._sel = {}; this._open = null; this._render(); this._emit(); }
  /** Ma’lumotnoma: barcha soha va a’zo nomlari, og‘riq/jarohat turlari */
  static get catalog() { return { areas: SEGMENT_NAMES, organs: ORGAN_LIST, painKinds: PAIN_KINDS, injuryKinds: INJURY_KINDS, durations: DURATIONS }; }

  _emit() { this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value }, bubbles: true, composed: true })); }
  _onClick(e) {
    const el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    const ro = this.hasAttribute('readonly');
    const a = el.dataset.act, v = el.dataset.v, code = el.dataset.code;
    if (a === 'view') { this.setAttribute('view', v); return; }
    if (a === 'seg' || a === 'open') {
      if (ro) { this.dispatchEvent(new CustomEvent('area-click', { detail: { code, name: SEGMENT_NAMES[code] }, bubbles: true, composed: true })); return; }
      if (!this._sel[code]) { this._sel[code] = { pain: 3, kind: 'dull', dur: 0 }; this._emit(); }
      this._open = code;
      if (a === 'open') { const sd = segmentSide(code); if (sd === 'organ') this.setAttribute('view', 'organs'); else if (sd !== 'both') this.setAttribute('view', sd); }
      this._render(); return;
    }
    const cur = this._sel[this._open];
    if (a === 'close') { this._open = null; this._render(); return; }
    if (!cur) return;
    if (a === 'pain') cur.pain = Number(v);
    if (a === 'kind') cur.kind = v;
    if (a === 'dur') cur.dur = Number(v);
    if (a === 'remove') { delete this._sel[this._open]; this._open = null; }
    this._render(); this._emit();
  }
  _render() {
    const view = ['front', 'back', 'organs'].includes(this.view) ? this.view : 'front';
    const ro = this.hasAttribute('readonly');
    const co = this.getAttribute('callouts') || 'auto';
    const callouts = co === 'on' || (co === 'auto' && this._wide);
    const sel = this._sel; const ids = Object.keys(sel);
    let h = '<style>' + CSS + '</style><div class="wrap">';
    if (!this.hasAttribute('no-controls')) {
      h += '<div class="top"><span class="hint">' + (view === 'organs' ? TEXT.organHint : '') + '</span><div class="seg" role="group">' +
        ['front', 'back', 'organs'].map((k) => '<button data-act="view" data-v="' + k + '" aria-pressed="' + (view === k) + '">' + TEXT[k] + '</button>').join('') + '</div></div>';
    }
    h += '<div class="stage">' + bodyMap({ view, sel, open: this._open, act: 'seg', width: 300, callouts }) + '</div>' + PAIN_LEGEND;
    if (view === 'organs' && !ro) h += '<div class="chips">' + ORGAN_LIST.map((c) => '<button class="chip" data-act="seg" data-code="' + c + '" aria-pressed="' + !!sel[c] + '"' + (sel[c] ? ' style="background:' + painColor(sel[c].pain) + ';color:#fff"' : '') + '>' + esc(SEGMENT_NAMES[c]) + '</button>').join('') + '</div>';
    if (!this.hasAttribute('no-list')) {
      const side = (c) => ({ front: TEXT.sideFront, back: TEXT.sideBack, both: '', organ: TEXT.organ }[segmentSide(c)]);
      h += '<div class="list"><h4>' + TEXT.selected + ' · ' + ids.length + '</h4>' + (ids.length ? ids.map((c) => '<button class="row" data-act="open" data-code="' + c + '"><span class="bar" style="background:' + painColor(sel[c].pain) + '"></span><span class="grow"><b>' + esc(SEGMENT_NAMES[c]) + '</b> <small>' + side(c) + '</small><br><small>' + esc(kindLabel(sel[c].kind)) + ' · ' + DURATIONS[sel[c].dur] + '</small></span><b class="p" style="color:' + painColor(sel[c].pain) + '">' + sel[c].pain + '/10</b></button>').join('') : '<p class="muted">' + TEXT.none + '</p>') + '</div>';
    }
    h += '</div>';
    const cur = this._open && sel[this._open];
    if (cur && !ro) {
      const c = this._open;
      h += '<div class="overlay" data-act="close"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(SEGMENT_NAMES[c]) + '">' +
        '<div class="between"><div><h3>' + esc(SEGMENT_NAMES[c]) + '</h3>' + (isOrgan(c) ? '<span class="xs">' + TEXT.organ + '</span>' : '') + '</div><span class="badge" style="background:' + painColor(cur.pain) + '">' + cur.pain + '/10 · ' + painWord(cur.pain) + '</span></div>' +
        '<div><h4>' + TEXT.painLevel + '</h4><div class="scale" role="radiogroup" style="margin-top:8px">' + Array.from({ length: 11 }, (_, i) => '<button role="radio" aria-checked="' + (cur.pain === i) + '" data-act="pain" data-v="' + i + '"' + (cur.pain === i ? ' style="background:' + painColor(i) + ';color:#fff;border-color:transparent"' : '') + '>' + i + '</button>').join('') + '</div>' +
        '<div class="between xs" style="margin-top:4px"><span>' + TEXT.painNone + '</span><span>' + TEXT.painMax + '</span></div></div>' +
        '<div><h4>' + TEXT.painKind + '</h4><div class="chips" style="margin-top:8px">' + Object.entries(PAIN_KINDS).map(([k, l]) => '<button class="chip" data-act="kind" data-v="' + k + '" aria-pressed="' + (cur.kind === k) + '">' + l + '</button>').join('') + '</div></div>' +
        (isOrgan(c) ? '' : '<div><h4>' + TEXT.injury + '</h4><div class="chips" style="margin-top:8px">' + Object.entries(INJURY_KINDS).map(([k, l]) => '<button class="chip" data-act="kind" data-v="' + k + '" aria-pressed="' + (cur.kind === k) + '">' + l + '</button>').join('') + '</div></div>') +
        '<div><h4>' + TEXT.since + '</h4><div class="chips" style="margin-top:8px">' + DURATIONS.map((l, i) => '<button class="chip" data-act="dur" data-v="' + i + '" aria-pressed="' + (cur.dur === i) + '">' + l + '</button>').join('') + '</div></div>' +
        '<div class="between"><button class="btn danger" data-act="remove">' + TEXT.remove + '</button><button class="btn primary" data-act="close">' + TEXT.save + '</button></div></div>';
    }
    const focusCode = this.shadowRoot.activeElement && this.shadowRoot.activeElement.dataset ? this.shadowRoot.activeElement.dataset.code : null;
    this.shadowRoot.innerHTML = h;
    if (focusCode && !this._open) { const n = this.shadowRoot.querySelector('path[data-code="' + focusCode + '"]'); if (n) n.focus(); }
  }
}
if (!customElements.get('body-map')) customElements.define('body-map', BodyMap);
export { BodyMap, SEGMENT_NAMES, ORGANS, PAIN_KINDS, INJURY_KINDS, DURATIONS, painColor };
