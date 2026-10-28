// Small SVG charts (no library). Bars grow and lines draw in via CSS; every chart has a text alternative.
import { esc, t, locale } from './core.js';

const ticks = (max) => { const step = Math.max(1, Math.ceil(max / 4)); const out = []; for (let v = step; v <= max; v += step) out.push(v); if (out[out.length - 1] !== max) out.push(max); return [...new Set(out)]; };
const shortDay = (k) => { const d = new Date(k + 'T00:00'); return d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0'); };

/** Grouped/stacked bars. series: [{label, color, values:[n]}], labels: day keys. */
export function barChart({ labels, series, height = 180, stacked = false, label = '' }) {
  const n = labels.length; if (!n) return '';
  const totals = labels.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const max = Math.max(1, ...(stacked ? totals : series.flatMap((s) => s.values)));
  const W = 960, H = height, pad = 22, bw = (W - 8) / n;
  const every = Math.ceil(n / 10);
  let bars = '';
  labels.forEach((k, i) => {
    let y0 = H - pad;
    series.forEach((s, j) => {
      const v = s.values[i] || 0; const h = (H - pad - 8) * v / max;
      const w = stacked ? bw * 0.62 : (bw * 0.7) / series.length;
      const x = 4 + i * bw + (stacked ? bw * 0.19 : bw * 0.15 + j * w);
      const y = stacked ? y0 - h : H - pad - h;
      if (v) bars += '<rect class="bar-r" style="--d:' + i + ';fill:' + s.color + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(2, w - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"><title>' + esc(shortDay(k) + ' · ' + t(s.label) + ': ' + v) + '</title></rect>';
      if (stacked) y0 -= h;
    });
    if (i % every === 0) bars += '<text x="' + (4 + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + shortDay(k) + '</text>';
  });
  const grid = ticks(max).map((v) => { const y = (H - pad - (H - pad - 8) * v / max).toFixed(1); return '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="gy" x="2" y="' + (y - 3) + '">' + v + '</text>'; }).join('');
  const legend = series.length > 1 ? '<div class="legend">' + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + esc(t(s.label)) + '</span>').join('') + '</div>' : '';
  const sum = series.map((s) => t(s.label) + ': ' + s.values.reduce((a, b) => a + b, 0)).join(', ');
  return '<figure class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label + ' — ' + sum) + '"><g class="grid">' + grid + '</g>' + bars + '</svg>' + legend + '</figure>';
}

/** Line chart with soft area fill. series: [{label, color, values}] */
export function lineChart({ labels, series, height = 180, label = '' }) {
  const n = labels.length; if (n < 2) return barChart({ labels, series, height, label });
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const W = 960, H = height, pad = 22;
  const X = (i) => 6 + (W - 12) * i / (n - 1), Y = (v) => H - pad - (H - pad - 10) * v / max;
  const every = Math.ceil(n / 10);
  const lines = series.map((s, j) => {
    const pts = s.values.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1));
    return '<path class="area" style="fill:' + s.color + '" d="M' + X(0) + ',' + (H - pad) + ' L' + pts.join(' L') + ' L' + X(n - 1) + ',' + (H - pad) + 'Z"/>' +
      '<polyline class="line" style="stroke:' + s.color + ';--d:' + j + '" points="' + pts.join(' ') + '"/>' +
      s.values.map((v, i) => (v ? '<circle class="dot" style="fill:' + s.color + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3"><title>' + esc(shortDay(labels[i]) + ' · ' + t(s.label) + ': ' + v) + '</title></circle>' : '')).join('');
  }).join('');
  const xs = labels.map((k, i) => (i % every === 0 ? '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + shortDay(k) + '</text>' : '')).join('');
  const grid = ticks(max).map((v) => { const y = Y(v).toFixed(1); return '<line x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/><text class="gy" x="2" y="' + (y - 3) + '">' + v + '</text>'; }).join('');
  const legend = '<div class="legend">' + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + esc(t(s.label)) + '</span>').join('') + '</div>';
  return '<figure class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '"><g class="grid">' + grid + '</g>' + lines + xs + '</svg>' + legend + '</figure>';
}

/** Donut. parts: [[label, value, color]] */
export function donut(parts, { size = 150, center = '', sub = '' } = {}) {
  const total = parts.reduce((a, p) => a + p[1], 0);
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = total ? parts.filter((p) => p[1]).map(([l, v, c], i) => { const len = C * v / total; const s = '<circle class="arc" style="--d:' + i + ';stroke:' + c + '" r="' + R + '" cx="70" cy="70" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '"><title>' + esc(t(l) + ': ' + v) + '</title></circle>'; off += len; return s; }).join('') : '';
  return '<div class="donut-wrap"><svg class="donut" viewBox="0 0 140 140" width="' + size + '" height="' + size + '" role="img" aria-label="' + esc(parts.map((p) => t(p[0]) + ': ' + p[1]).join(', ')) + '"><circle r="' + R + '" cx="70" cy="70" class="track"/>' + arcs +
    '<text x="70" y="' + (sub ? 68 : 76) + '" text-anchor="middle" class="dc">' + esc(center === '' ? total : center) + '</text>' + (sub ? '<text x="70" y="88" text-anchor="middle" class="ds">' + esc(sub) + '</text>' : '') + '</svg>' +
    '<div class="col g6">' + parts.map(([l, v, c]) => '<div class="row between sm nw" style="gap:14px"><span class="row nw" style="gap:8px"><i class="sw" style="background:' + c + '"></i>' + esc(t(l)) + '</span><b>' + v + (total ? ' <span class="faint xs">' + Math.round(100 * v / total) + '%</span>' : '') + '</b></div>').join('') + '</div></div>';
}

/** Big number tile with a count-up animation (data-count is animated after render). */
export const kpi = (value, label, ic = '', tone = '', sub = '', href = '') => '<' + (href ? 'a href="' + href + '"' : 'div') + ' class="glass stat ' + tone + (href ? ' linkable' : '') + '">' + (ic ? '<span class="stat-ic">' + ic + '</span>' : '') + '<b' + (typeof value === 'number' ? ' data-count="' + value + '"' : '') + '>' + esc(typeof value === 'number' ? value.toLocaleString(locale()) : value) + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + (href ? '</a>' : '</div>');

/** Count-up for [data-count] — called after each render, animates each element once. */
// Re-renders rebuild the DOM, so remember which (label, value) pairs already animated: polling must not replay it.
const counted = new Set();
export function animateCounts(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = Number(el.dataset.count);
    const key = location.hash + '|' + (el.nextElementSibling ? el.nextElementSibling.textContent : '') + '|' + to;
    if (counted.has(key) || !(to > 0)) return;
    counted.add(key);
    const t0 = performance.now(), dur = 700;
    const step = (now) => { const k = Math.min(1, (now - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString(locale()); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
