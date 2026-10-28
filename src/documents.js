import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const QRCode = require('../vendor/qrcode/index.cjs');
const QRLevel = require('../vendor/qrcode/QRErrorCorrectLevel.cjs');
const { PDFDocument, StandardFonts, rgb, degrees } = require('../vendor/pdf-lib.min.cjs');

export function qrMatrix(text) {
  const q = new QRCode(-1, QRLevel.M);
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(q.isDark(r, c)); m.push(row); }
  return m;
}
export function qrSvg(text, label = 'Retsept QR kodi') {
  const m = qrMatrix(text); const n = m.length; const q = 4; let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (n + 2 * q) + ' ' + (n + 2 * q) + '" shape-rendering="crispEdges" role="img" aria-label="' + label.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) + '"><rect width="100%" height="100%" fill="#fff"/><path d="' + d + '" fill="#0B1530"/></svg>';
}

// Standard PDF fonts are WinAnsi: replace Uzbek typographic marks and drop anything else non-ASCII.
const ascii = (s) => String(s == null ? '' : s)
  .replace(/[‘’ʻʼ`]/g, "'").replace(/[“”«»„]/g, '"').replace(/[–—−]/g, '-').replace(/·/g, '-').replace(/№/g, 'No.').replace(/°/g, ' ')
  .replace(/[^\x20-\x7E\n]/g, '');
const fmtDay = (t) => { const d = new Date(t); return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear(); };

/** One character of `text` per circle point, rotated to follow the curve. side: 'top' reads left-to-right
 * over the top of the circle; 'bottom' reads left-to-right under the bottom (not upside down). */
function drawRingText(page, { text, font, size, cx, cy, radius, color }, side) {
  const chars = ascii(text).toUpperCase().split('');
  const gap = size * 0.3;
  const angles = chars.map((c) => (font.widthOfTextAtSize(c, size) + gap) / radius);
  const total = angles.reduce((a, b) => a + b, 0);
  let a = side === 'top' ? Math.PI / 2 + total / 2 : -Math.PI / 2 - total / 2;
  for (let i = 0; i < chars.length; i++) {
    a += side === 'top' ? -angles[i] / 2 : angles[i] / 2;
    const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
    const rot = side === 'top' ? a - Math.PI / 2 : a + Math.PI / 2;
    page.drawText(chars[i], { x, y, size, font, color, rotate: degrees(rot * 180 / Math.PI) });
    a += side === 'top' ? -angles[i] / 2 : angles[i] / 2;
  }
}
/** The doctor's round seal: specialty curved over the top, full name curved under the bottom, MedAssist mark in the middle. */
function drawSeal(page, { cx, cy, radius = 38, specialty, doctorName, bold, color }) {
  page.drawCircle({ x: cx, y: cy, size: radius, borderColor: color, borderWidth: 1.3, opacity: 0, borderOpacity: 0.85 });
  page.drawCircle({ x: cx, y: cy, size: radius - 9, borderColor: color, borderWidth: 0.5, opacity: 0, borderOpacity: 0.5 });
  drawRingText(page, { text: specialty, font: bold, size: 6.2, cx, cy, radius: radius - 4.5, color }, 'top');
  drawRingText(page, { text: doctorName, font: bold, size: 6.2, cx, cy, radius: radius - 4.5, color }, 'bottom');
  page.drawLine({ start: { x: cx, y: cy + 1 }, end: { x: cx, y: cy + 9 }, thickness: 1.6, color, opacity: 0.9 });
  page.drawLine({ start: { x: cx - 4, y: cy + 5 }, end: { x: cx + 4, y: cy + 5 }, thickness: 1.6, color, opacity: 0.9 });
  const w = bold.widthOfTextAtSize('MED', 8.5);
  page.drawText('MED', { x: cx - w / 2, y: cy - 6, size: 8.5, font: bold, color });
  const w2 = bold.widthOfTextAtSize('ASSIST', 8.5);
  page.drawText('ASSIST', { x: cx - w2 / 2, y: cy - 15, size: 8.5, font: bold, color });
}

/** A simple bordered table: header row + body rows, each cell word-wrapped to its column width.
 * columns: [{key, label, width}]. rows: [{key: text}]. Returns the y just below the table. */
function drawTable(page, { x, y, width: totalWidth, columns, rows, font, bold, ink, muted, line, headerFill, zebraFill }) {
  const padX = 5, padY = 4, size = 8.2, lead = 10;
  let cur = y;
  const headerH = size + padY * 2;
  page.drawRectangle({ x, y: cur - headerH, width: totalWidth, height: headerH, color: headerFill });
  let cx = x;
  columns.forEach((c) => { page.drawText(ascii(c.label), { x: cx + padX, y: cur - padY - size * 0.82, size, font: bold, color: muted }); cx += c.width; });
  cur -= headerH;
  page.drawLine({ start: { x, y: cur }, end: { x: x + totalWidth, y: cur }, thickness: 0.8, color: line });

  rows.forEach((row, ri) => {
    const cellLines = columns.map((c) => wrap(row[c.key] || '', c.bold ? bold : font, size, c.width - padX * 2));
    const nLines = Math.max(1, ...cellLines.map((l) => l.length));
    const rowH = nLines * lead + padY * 2;
    if (ri % 2 === 1) page.drawRectangle({ x, y: cur - rowH, width: totalWidth, height: rowH, color: zebraFill });
    let cx2 = x;
    columns.forEach((c, ci) => {
      cellLines[ci].forEach((ln, li) => page.drawText(ln, { x: cx2 + padX, y: cur - padY - size * 0.82 - li * lead, size, font: c.bold ? bold : font, color: ink }));
      cx2 += c.width;
    });
    cur -= rowH;
    page.drawLine({ start: { x, y: cur }, end: { x: x + totalWidth, y: cur }, thickness: 0.5, color: line });
  });
  page.drawRectangle({ x, y: cur, width: totalWidth, height: y - cur, borderColor: line, borderWidth: 0.8, opacity: 0, borderOpacity: 1 });
  let cx3 = x;
  columns.slice(0, -1).forEach((c) => { cx3 += c.width; page.drawLine({ start: { x: cx3, y }, end: { x: cx3, y: cur }, thickness: 0.5, color: line }); });
  return cur;
}

function wrap(text, font, size, width) {
  const words = ascii(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(t, size) > width && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

/** data: { number, code, issuedAt, validUntil, status, patientName, patientAge, patientPhoto:{bytes,mime}|null, doctorName, specialty, license, icd10, dxTitle, items:[{name,strength,form,dosage,timesPerDay,days,instructions}], verifyUrl } */
export async function prescriptionPdf(data) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Retsept ' + ascii(data.number)); pdf.setAuthor('MedAssist'); pdf.setCreator('MedAssist');
  const page = pdf.addPage([419.53, 595.28]); // A5 portrait, points
  const W = page.getWidth(), H = page.getHeight();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.04, 0.09, 0.19), muted = rgb(0.33, 0.39, 0.5), brand = rgb(0.18, 0.36, 0.95), line = rgb(0.85, 0.88, 0.93);
  const M = 28;

  page.drawRectangle({ x: 0, y: H - 58, width: W, height: 58, color: brand });
  page.drawText('MedAssist', { x: M, y: H - 36, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Elektron retsept', { x: W - M - font.widthOfTextAtSize('Elektron retsept', 10), y: H - 34, size: 10, font, color: rgb(1, 1, 1) });

  let y = H - 88;
  page.drawText(ascii('Retsept No. ' + data.number), { x: M, y, size: 14, font: bold, color: ink }); y -= 16;
  page.drawText(ascii('Berilgan: ' + fmtDay(data.issuedAt) + '    Amal qiladi: ' + fmtDay(data.validUntil)), { x: M, y, size: 9, font, color: muted }); y -= 22;

  const qrSize = 60, qx = W - M - qrSize, qy = H - 80 - qrSize;
  const m = qrMatrix(data.verifyUrl); const cell = qrSize / m.length;
  page.drawRectangle({ x: qx - 4, y: qy - 4, width: qrSize + 8, height: qrSize + 8, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 });
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m.length; c++) if (m[r][c]) page.drawRectangle({ x: qx + c * cell, y: qy + qrSize - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: ink });

  // Patient photo sits where the larger QR used to be, to the QR's left.
  const photoW = 58, photoH = 72, photoGap = 10;
  const px = qx - photoGap - photoW, py = H - 80 - photoH;
  let photoImg = null;
  if (data.patientPhoto) {
    try { photoImg = data.patientPhoto.mime === 'image/png' ? await pdf.embedPng(data.patientPhoto.bytes) : await pdf.embedJpg(data.patientPhoto.bytes); } catch { photoImg = null; }
  }
  if (photoImg) {
    page.drawRectangle({ x: px - 2, y: py - 2, width: photoW + 4, height: photoH + 4, color: rgb(1, 1, 1), borderColor: line, borderWidth: 0.8 });
    const scale = Math.min(photoW / photoImg.width, photoH / photoImg.height);
    const dw = photoImg.width * scale, dh = photoImg.height * scale;
    page.drawImage(photoImg, { x: px + (photoW - dw) / 2, y: py + (photoH - dh) / 2, width: dw, height: dh });
  }
  const rightReserve = photoImg ? photoW + photoGap + qrSize + 16 : qrSize + 16;
  const rightBottom = Math.min(qy, photoImg ? py : qy);

  const field = (k, v) => {
    page.drawText(ascii(k), { x: M, y, size: 9, font: bold, color: muted });
    const lines = wrap(v, font, 10, W - M - 70 - rightReserve);
    lines.forEach((ln, i) => page.drawText(ln, { x: M + 70, y: y - i * 13, size: 10, font, color: ink }));
    y -= 13 * lines.length + 5;
  };
  field('Bemor', data.patientName + (data.patientAge ? ', ' + data.patientAge + ' yosh' : ''));
  field('Shifokor', data.doctorName + ', ' + data.specialty);
  field('Litsenziya', data.license);
  field('Tashxis', data.icd10 + ' - ' + data.dxTitle);
  y = Math.min(y, rightBottom - 14);
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: line }); y -= 22;

  page.drawText('Rp.', { x: M, y, size: 13, font: bold, color: ink }); y -= 16;
  const tableW = W - 2 * M;
  const columns = [
    { key: 'num', label: '#', width: 16 },
    { key: 'name', label: 'DORI', width: tableW * 0.30, bold: true },
    { key: 'dose', label: 'QABUL QILISH', width: tableW * 0.26 },
    { key: 'days', label: 'MUDDAT', width: tableW * 0.12 },
    { key: 'note', label: 'IZOH', width: tableW - 16 - tableW * 0.30 - tableW * 0.26 - tableW * 0.12 }
  ];
  const rows = data.items.map((it, i) => ({
    num: String(i + 1), name: it.name + ' ' + it.strength + ' (' + it.form + ')',
    dose: it.dosage + ', kuniga ' + it.timesPerDay + ' marta', days: it.days + ' kun', note: it.instructions || '-'
  }));
  y = drawTable(page, { x: M, y, width: tableW, columns, rows, font, bold, ink, muted, line, headerFill: rgb(0.95, 0.96, 0.98), zebraFill: rgb(0.975, 0.98, 0.99) });
  y -= 14;

  const sealR = 34, sealReserve = sealR * 2 + 14;
  y -= 4; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: line }); y -= 20;
  page.drawText(ascii('Tekshirish kodi: ' + data.code), { x: M, y, size: 11, font: bold, color: ink }); y -= 15;
  wrap('Dorixona QR kodni skanerlaydi yoki ' + data.verifyUrl.replace(/#.*$/, '') + ' saytidagi "Retseptni tekshirish" bo\'limiga kodni kiritadi.', font, 8.5, W - 2 * M - sealReserve)
    .forEach((ln) => { page.drawText(ln, { x: M, y, size: 8.5, font, color: muted }); y -= 11; });
  y -= 14;
  drawSeal(page, { cx: W - M - sealR - 2, cy: y + sealR - 14, radius: sealR, specialty: data.specialty, doctorName: data.doctorName, bold, color: brand });
  page.drawText(ascii('Elektron imzo: ' + data.doctorName), { x: M, y, size: 9, font, color: ink });
  if (data.status === 'CANCELLED') {
    page.drawText('BEKOR QILINGAN', { x: 70, y: H / 2 - 40, size: 42, font: bold, color: rgb(0.9, 0.2, 0.2), opacity: 0.35, rotate: degrees(30) });
  }
  page.drawText(ascii('MedAssist - ' + fmtDay(Date.now())), { x: M, y: 18, size: 7.5, font, color: muted });
  return Buffer.from(await pdf.save());
}
