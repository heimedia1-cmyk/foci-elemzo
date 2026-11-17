// Helyettesítő pixel art – kódból rajzolt grafika, amíg a végleges sprite-ok meg nem érkeznek.
// Minden függvény egy <canvas>-t ad vissza. A Phaser textúraként tölti be őket (art/registerArt.js).
import { MEXIS } from '../data/mexis.js';

export const T = 16; // csempeméret

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

// ---------- Színsegédek ----------
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function shade(hex, f) { const [r, g, b] = hexToRgb(hex); return f >= 0 ? rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f) : rgbToHex(r * (1 + f), g * (1 + f), b * (1 + f)); }
export function hueShift(hex, deg) {
  let [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) { const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  h = (h + deg / 360) % 1; if (h < 0) h += 1;
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
}

function P(ctx) {
  return {
    px(x, y, c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); },
    rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
    circle(cx, cy, r, c) { ctx.fillStyle = c; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) ctx.fillRect(cx + x, cy + y, 1, 1); },
    ellipse(cx, cy, rx, ry, c) { ctx.fillStyle = c; for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.05) ctx.fillRect(cx + x, cy + y, 1, 1); },
    tri(x1, y1, x2, y2, x3, y3, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill(); },
  };
}

/** Körvonal: minden átlátszó pixel, amely mellett nem átlátszó van, sötét lesz. */
function outline(c, color = '#1a1420') {
  const ctx = c.getContext('2d', { willReadFrequently: true }); const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data; const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  ctx.fillStyle = color;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ctx.fillRect(x, y, 1, 1);
  return c;
}

// ======================= CSEMPÉK =======================
export const TILE_FRAMES = ['grass0', 'grass1', 'grass2', 'grass3', 'tall0', 'tall1', 'path', 'water0', 'water1', 'sand', 'flower0', 'flower1', 'tree', 'bush', 'rock', 'fence', 'sign', 'hbush', 'passage', 'treetop', 'dark', 'floor', 'ledge'];

export function drawTiles() {
  const c = cv(T * TILE_FRAMES.length, T); const ctx = c.getContext('2d'); const p = P(ctx);
  TILE_FRAMES.forEach((name, i) => {
    ctx.save(); ctx.translate(i * T, 0);
    const grass = (v) => { p.rect(0, 0, T, T, '#6cc04a'); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const r = hash(x, y, v + 3); if (r < 0.08) p.px(x, y, '#58a83c'); else if (r > 0.96) p.px(x, y, '#8ad860'); } };
    switch (name) {
      case 'grass0': case 'grass1': case 'grass2': case 'grass3': grass(+name.slice(-1)); if (name === 'grass3') { p.px(4, 5, '#4f9a36'); p.px(5, 4, '#4f9a36'); p.px(11, 10, '#4f9a36'); p.px(12, 9, '#4f9a36'); } break;
      case 'tall0': case 'tall1': {
        p.rect(0, 0, T, T, '#3f9a36'); const sw = name === 'tall1' ? 1 : 0;
        for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) { const bx = k * 4 + 1, by = j * 4 + 3; p.rect(bx + sw, by - 3, 1, 3, '#2f7a2a'); p.rect(bx + 2 - sw, by - 2, 1, 2, '#58b848'); p.px(bx + 1, by - 3, '#7ad860'); }
        break; }
      case 'path': p.rect(0, 0, T, T, '#d8b878'); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const r = hash(x, y, 9); if (r < 0.07) p.px(x, y, '#c0a060'); else if (r > 0.95) p.px(x, y, '#ecd29a'); } break;
      case 'water0': case 'water1': { p.rect(0, 0, T, T, '#3a84d8'); const o = name === 'water1' ? 4 : 0; for (let y = 2; y < T; y += 5) { p.rect((o + y) % 12, y, 4, 1, '#7ab8f0'); p.rect((o + y + 8) % 14, y + 2, 3, 1, '#5aa0e8'); } break; }
      case 'sand': p.rect(0, 0, T, T, '#ecd89a'); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (hash(x, y, 5) < 0.08) p.px(x, y, '#d4bc78'); break;
      case 'flower0': case 'flower1': { grass(1); const cols = name === 'flower0' ? ['#f05a7a', '#fff07a'] : ['#7aa8ff', '#ffffff']; [[3, 3], [11, 5], [6, 11], [13, 13]].forEach(([x, y], k) => { const cc = cols[k % 2]; p.px(x, y - 1, cc); p.px(x - 1, y, cc); p.px(x + 1, y, cc); p.px(x, y + 1, cc); p.px(x, y, '#f0c030'); }); break; }
      case 'tree': case 'treetop': {
        grass(2);
        if (name === 'tree') { p.rect(6, 11, 4, 5, '#7a4a2a'); p.px(6, 15, '#5a3418'); }
        p.circle(8, 7, 7, '#2f8a3a'); p.circle(7, 6, 5, '#3fa848'); p.circle(6, 4, 2, '#5ac860');
        for (let k = 0; k < 6; k++) p.px(Math.floor(hash(k, 1, 7) * 12) + 2, Math.floor(hash(k, 2, 7) * 10) + 2, '#257030');
        break; }
      case 'bush': case 'hbush': grass(0); p.circle(8, 9, 6, name === 'hbush' ? '#3a9a40' : '#38a040'); p.circle(6, 7, 3, '#5ac860'); p.px(10, 11, '#2a7a30'); p.px(4, 10, '#2a7a30'); if (name === 'hbush') { p.px(12, 6, '#2a6a30'); p.px(3, 12, '#5a3a20'); } break;
      case 'rock': grass(3); p.ellipse(8, 10, 6, 4, '#8a8a92'); p.ellipse(7, 9, 4, 2, '#aaaab2'); p.px(5, 8, '#cacad2'); break;
      case 'fence': grass(1); p.rect(0, 6, T, 2, '#c08a50'); p.rect(0, 10, T, 2, '#c08a50'); p.rect(2, 4, 3, 10, '#a87038'); p.rect(11, 4, 3, 10, '#a87038'); p.px(2, 4, '#d8a060'); p.px(11, 4, '#d8a060'); break;
      case 'sign': grass(0); p.rect(7, 9, 2, 6, '#7a4a2a'); p.rect(2, 3, 12, 7, '#c08a50'); p.rect(3, 4, 10, 5, '#d8a868'); p.rect(4, 5, 8, 1, '#7a4a2a'); p.rect(4, 7, 6, 1, '#7a4a2a'); break;
      case 'passage': p.rect(0, 0, T, T, '#b89a60'); for (let k = 0; k < 8; k++) p.px(Math.floor(hash(k, 3, 2) * 16), Math.floor(hash(k, 4, 2) * 16), '#5aa040'); break;
      case 'dark': p.rect(0, 0, T, T, '#1d3a24'); break;
      case 'floor': p.rect(0, 0, T, T, '#c89a68'); p.rect(0, 7, T, 1, '#a87a48'); p.rect(0, 15, T, 1, '#a87a48'); break;
      case 'ledge': grass(0); p.rect(0, 11, T, 3, '#4a8a30'); p.rect(0, 14, T, 2, '#356a22'); break;
    }
    ctx.restore();
  });
  return c;
}

// ======================= ÉPÜLETEK =======================
export const BUILDINGS = {
  lab:   { w: 7, h: 4, roof: '#7a8ab8', wall: '#ecebe2', label: 'lab' },
  heal:  { w: 6, h: 4, roof: '#e05050', wall: '#fff4ec', label: 'heal' },
  shop:  { w: 6, h: 4, roof: '#4aa860', wall: '#f4ecd8', label: 'shop' },
  home:  { w: 6, h: 4, roof: '#c86a3a', wall: '#f4e4c8', label: 'home' },
  house: { w: 5, h: 4, roof: '#5a7ac8', wall: '#f0e2c8', label: 'house' },
  house2:{ w: 5, h: 4, roof: '#a85ab0', wall: '#f0e2c8', label: 'house' },
};

export function drawBuilding(key) {
  const b = BUILDINGS[key]; const W = b.w * T, H = b.h * T; const c = cv(W, H); const ctx = c.getContext('2d'); const p = P(ctx);
  const roofH = Math.floor(H * 0.48);
  // tető
  p.rect(0, 2, W, roofH, b.roof);
  for (let y = 4; y < roofH; y += 4) p.rect(1, y, W - 2, 1, shade(b.roof, -0.2));
  p.rect(0, 1, W, 2, shade(b.roof, 0.25));
  p.rect(0, roofH + 1, W, 2, shade(b.roof, -0.35));
  // fal
  p.rect(2, roofH + 3, W - 4, H - roofH - 3, b.wall);
  p.rect(2, H - 2, W - 4, 2, shade(b.wall, -0.25));
  // ablakok
  const winY = roofH + 7;
  for (let x = 6; x < W - 10; x += 22) { if (Math.abs(x + 4 - W / 2) < 12) continue; p.rect(x, winY, 9, 8, '#5a4a3a'); p.rect(x + 1, winY + 1, 7, 6, '#9ad0f0'); p.rect(x + 1, winY + 1, 3, 2, '#d8f0ff'); p.rect(x + 4, winY + 1, 1, 6, '#5a4a3a'); }
  // ajtó (alul középen)
  const dx = Math.floor(b.w / 2) * T + 3;
  p.rect(dx, H - 14, 10, 14, '#6a4028'); p.rect(dx + 1, H - 13, 8, 13, '#8a5a34'); p.px(dx + 7, H - 7, '#f0c040');
  // címer
  const ex = Math.floor(W / 2), ey = Math.floor(roofH / 2) + 2;
  if (b.label === 'heal') { p.circle(ex, ey, 6, '#ffffff'); p.rect(ex - 1, ey - 4, 3, 9, '#e04040'); p.rect(ex - 4, ey - 1, 9, 3, '#e04040'); }
  if (b.label === 'shop') { p.circle(ex, ey, 5, '#d8f040'); p.rect(ex - 5, ey, 11, 1, '#ffffff'); }
  if (b.label === 'lab') { p.rect(ex - 2, ey - 5, 4, 4, '#ffffff'); p.tri(ex - 5, ey + 5, ex + 5, ey + 5, ex, ey - 2, '#ffffff'); p.rect(ex - 3, ey + 2, 6, 2, '#5ad0f0'); }
  if (b.label === 'home') { p.rect(ex - 3, ey - 3, 6, 6, '#f8e8a0'); p.px(ex - 1, ey - 1, '#c86a3a'); p.px(ex + 1, ey - 1, '#c86a3a'); }
  // kémény
  p.rect(W - 14, 0, 5, 6, '#8a5a4a');
  return c;
}

// ======================= EMBEREK (16×16, 4 irány × 3 fázis) =======================
export const PEOPLE = {
  fiu:       { skin: '#f4c8a0', hair: '#5a3a1a', shirt: '#e04848', pants: '#3a5aa8', hat: '#e04848' },
  lany:      { skin: '#f4c8a0', hair: '#c8602a', shirt: '#f070a8', pants: '#5a4aa8', hat: '#ffffff', long: true },
  professzor:{ skin: '#f0c8a0', hair: '#d0d0d0', shirt: '#ffffff', pants: '#6a6a7a', coat: true },
  apolo:     { skin: '#f4c8a0', hair: '#f08aa8', shirt: '#ffb0c8', pants: '#ffffff', long: true },
  boltos:    { skin: '#e0a878', hair: '#2a2a2a', shirt: '#4aa860', pants: '#5a4a3a' },
  anya:      { skin: '#f4c8a0', hair: '#8a4a2a', shirt: '#f0c050', pants: '#8a5ab0', long: true },
  bacsi:     { skin: '#f0c8a0', hair: '#e8e8e8', shirt: '#8a6a4a', pants: '#5a5a5a' },
  kisfiu:    { skin: '#f4c8a0', hair: '#e0b040', shirt: '#5ab0f0', pants: '#3a3a5a' },
  edzo1:     { skin: '#f4c8a0', hair: '#2a2a3a', shirt: '#f0a030', pants: '#3a4a5a', hat: '#3a7ad8' },
  edzo2:     { skin: '#e8b890', hair: '#3a2a5a', shirt: '#a05ad0', pants: '#2a2a3a', long: true },
  gyujto:    { skin: '#f4c8a0', hair: '#6a4a2a', shirt: '#7a9a4a', pants: '#6a5a3a', hat: '#c8a050' },
};
const DIRS = ['down', 'left', 'right', 'up'];

export function drawPerson(key) {
  const s = PEOPLE[key]; const c = cv(T * 3, T * 4); const ctx = c.getContext('2d'); const p = P(ctx);
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < 3; f++) {
      ctx.save(); ctx.translate(f * T, row * T);
      const step = f === 1 ? -1 : f === 2 ? 1 : 0; const bob = f === 0 ? 0 : 1;
      // lábak
      if (dir === 'left' || dir === 'right') { p.rect(6 + step, 12, 2, 3, s.pants); p.rect(8 - step, 12, 2, 3, shade(s.pants, -0.2)); }
      else { p.rect(5, 12, 2, 3 + (step < 0 ? -1 : 0), s.pants); p.rect(9, 12, 2, 3 + (step > 0 ? -1 : 0), s.pants); }
      p.rect(5, 15 - (step < 0 && dir !== 'left' && dir !== 'right' ? 1 : 0), 2, 1, '#3a2a2a'); p.rect(9, 15, 2, 1, '#3a2a2a');
      // test
      p.rect(4, 8 - bob + 1, 8, 5, s.shirt); if (s.coat) { p.rect(4, 9 - bob, 8, 6, '#ffffff'); p.rect(7, 9 - bob, 2, 4, '#5a8ad0'); }
      p.rect(3, 9 - bob, 1, 3, s.skin); p.rect(12, 9 - bob, 1, 3, s.skin);
      // fej
      const hy = 1 - bob + 1;
      p.rect(4, hy, 8, 7, s.skin);
      if (dir === 'up') p.rect(4, hy, 8, 7, s.hair);
      else {
        p.rect(4, hy, 8, 3, s.hair);
        if (dir === 'down') { p.px(6, hy + 4, '#1a1a2a'); p.px(9, hy + 4, '#1a1a2a'); p.rect(3, hy + 1, 1, s.long ? 6 : 3, s.hair); p.rect(12, hy + 1, 1, s.long ? 6 : 3, s.hair); }
        if (dir === 'left') { p.px(5, hy + 4, '#1a1a2a'); p.rect(9, hy, 3, 6, s.hair); }
        if (dir === 'right') { p.px(10, hy + 4, '#1a1a2a'); p.rect(4, hy, 3, 6, s.hair); }
      }
      if (s.long && dir === 'up') p.rect(4, hy + 6, 8, 3, s.hair);
      if (s.hat) { p.rect(4, hy - 1, 8, 2, s.hat); if (dir === 'down') p.rect(4, hy + 1, 8, 1, shade(s.hat, -0.3)); if (dir === 'left') p.rect(2, hy + 1, 3, 1, s.hat); if (dir === 'right') p.rect(11, hy + 1, 3, 1, s.hat); }
      ctx.restore();
    }
  });
  return outline(c);
}

// ======================= MEXI – térképsprite (16×16, 4 irány × 3 fázis) =======================
function mexiColors(species, shiny) {
  const a = MEXIS[species].art; let body = a.body, tan = a.tan;
  if (shiny) { body = hueShift(body, 150); tan = hueShift(tan, 40); }
  return { body, tan, acc: a.acc };
}

export function drawMexiMap(species, shiny = false) {
  const { body, tan, acc } = mexiColors(species, shiny); const c = cv(T * 3, T * 4); const ctx = c.getContext('2d'); const p = P(ctx);
  const accColor = { frog: '#4fc84a', bee: '#1a1a1a', flame: '#ffb020', duck: '#ff9a20', ninja: '#7a3ad0', cyber: '#40e0ff', miner: '#f0d030', ice: '#d0f4ff', wizard: '#5a3ad0', ghost: '#ffffff', dragon: '#f0c040', frogking: '#f0c040', queen: '#f0c040', ninjamaster: '#d040f0' }[acc];
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < 3; f++) {
      ctx.save(); ctx.translate(f * T, row * T); const st = f === 0 ? 0 : f === 1 ? 1 : -1;
      if (acc === 'ghost') ctx.globalAlpha = 0.8;
      if (dir === 'down' || dir === 'up') {
        p.ellipse(8, 11, 4, 3, body);
        p.rect(5, 13 + (st > 0 ? 0 : 1), 2, 2, tan); p.rect(9, 13 + (st < 0 ? 0 : 1), 2, 2, tan);
        p.circle(8, 6, 4, dir === 'up' ? body : tan);
        p.tri(4, 4, 6, 0, 7, 4, tan); p.tri(9, 4, 10, 0, 12, 4, tan);
        if (dir === 'down') { p.px(6, 6, '#111'); p.px(10, 6, '#111'); p.px(8, 8, '#111'); }
        else p.rect(7, 13, 2, 2, body);
      } else {
        const fl = dir === 'left' ? -1 : 1; const X = (x) => (fl > 0 ? x : 15 - x);
        p.ellipse(8, 10, 5, 3, body);
        p.rect(X(4) - (fl < 0 ? 1 : 0), 12 + (st > 0 ? 0 : 1), 2, 3, tan); p.rect(X(10) - (fl < 0 ? 1 : 0), 12 + (st < 0 ? 0 : 1), 2, 3, tan);
        p.circle(X(11), 6, 4, tan); p.tri(X(9), 3, X(10), -1, X(12), 3, tan);
        p.px(X(13), 6, '#111'); p.px(X(15), 7, '#111');
        p.rect(X(2) - (fl < 0 ? 1 : 0), 6, 2, 3, body);
      }
      if (accColor) { if (acc === 'bee') { p.rect(5, 10, 6, 1, '#1a1a1a'); } else p.rect(6, 2, 4, 2, accColor); }
      ctx.restore();
    }
  });
  return outline(c);
}

// ======================= MEXI – harci sprite (48×48 elöl / hátul) =======================
export function drawMexiBattle(species, shiny = false, back = false) {
  const S = 48; const { body, tan, acc } = mexiColors(species, shiny); const big = MEXIS[species].art.big;
  const c = cv(S, S); const ctx = c.getContext('2d'); const p = P(ctx);
  const dark = shade(body, -0.35), light = shade(body, 0.25), tanD = shade(tan, -0.25);
  if (acc === 'ghost') ctx.globalAlpha = 0.85;

  // hátsó elemek (szárny, köpeny, kard)
  if (acc === 'bee' || acc === 'queen') { const wc = 'rgba(220,240,255,0.85)'; p.ellipse(10, 24, 7, 5, wc); p.ellipse(38, 24, 7, 5, wc); if (acc === 'queen') { p.ellipse(8, 30, 6, 4, wc); p.ellipse(40, 30, 6, 4, wc); } }
  if (acc === 'dragon') { p.tri(4, 16, 14, 30, 16, 22, '#8a1a1a'); p.tri(44, 16, 34, 30, 32, 22, '#8a1a1a'); }
  if (acc === 'wizard' || acc === 'ninjamaster' || acc === 'frogking') p.tri(10, 26, 38, 26, 24, 46, acc === 'wizard' ? '#3a2a90' : acc === 'frogking' ? '#2a6a3a' : '#2a1a3a');
  if (acc === 'ninja' || acc === 'ninjamaster') { ctx.save(); ctx.translate(36, 14); ctx.rotate(0.6); p.rect(0, 0, 2, 18, '#c8c8d8'); p.rect(-2, 14, 6, 2, '#5a3a1a'); ctx.restore(); }
  if (acc === 'ninjamaster') { ctx.save(); ctx.translate(12, 14); ctx.rotate(-0.6); p.rect(0, 0, 2, 18, '#c8c8d8'); ctx.restore(); }
  if (acc === 'miner' && !back) { p.rect(39, 20, 2, 16, '#7a4a2a'); p.tri(34, 20, 46, 20, 40, 17, '#9a9aa8'); }

  // farok
  if (acc === 'flame') { p.tri(36, 30, 44, 14, 40, 32, '#ff8a20'); p.tri(38, 30, 43, 18, 40, 31, '#ffe060'); }
  else if (acc === 'dragon') p.tri(34, 36, 46, 30, 36, 40, body);
  else if (back) p.ellipse(24, 30, 3, 6, body);
  else { p.ellipse(37, 29, 3, 5, body); p.px(37, 25, light); }

  // test
  p.ellipse(24, 35, 13, 9, body);
  p.ellipse(24, 32, 10, 4, light);
  if (!back) p.ellipse(24, 38, 7, 5, tan);
  if (acc === 'ghost') { p.ellipse(24, 42, 12, 4, shade(body, 0.4)); }
  else { for (const lx of [14, 20, 28, 34]) { p.rect(lx - 2, 40, 5, 6, tan); p.rect(lx - 2, 45, 5, 1, tanD); } }
  if (acc === 'bee' || acc === 'queen') { p.rect(12, 33, 24, 2, '#1a1a1a'); p.rect(13, 38, 22, 2, '#1a1a1a'); }
  if (acc === 'cyber') { p.rect(16, 30, 16, 5, '#a8b8c8'); p.rect(16, 32, 16, 1, '#40e0ff'); p.rect(11, 36, 3, 6, '#a8b8c8'); }
  if (acc === 'ice') { p.tri(16, 28, 19, 20, 22, 28, '#d8f6ff'); p.tri(24, 28, 27, 19, 30, 28, '#d8f6ff'); p.rect(14, 28, 20, 3, '#3a7ad8'); }
  if (acc === 'duck') { p.ellipse(11, 33, 3, 5, '#ffe060'); p.ellipse(37, 33, 3, 5, '#ffe060'); }
  if (acc === 'dragon') for (let k = 0; k < 6; k++) p.rect(15 + k * 3, 30 + (k % 2) * 3, 2, 2, '#f0c040');

  // fej
  const hy = 18, hr = big ? 12 : 11;
  p.circle(24, hy, hr, back ? body : tan);
  if (!back) { p.circle(24, hy - 5, 7, shade(body, 0.1)); p.ellipse(24, hy - 4, 8, 3, body); }
  // fülek
  p.tri(13, hy - 6, 15, hy - 17, 20, hy - 9, back ? body : tan); p.tri(35, hy - 6, 33, hy - 17, 28, hy - 9, back ? body : tan);
  p.tri(15, hy - 8, 16, hy - 14, 19, hy - 9, '#f0a0a0'); p.tri(33, hy - 8, 32, hy - 14, 29, hy - 9, '#f0a0a0');
  if (back) p.ellipse(24, hy + 6, 9, 5, dark);

  // arc
  if (!back) {
    const eye = (x) => { p.rect(x, hy, 3, 3, '#141018'); p.px(x, hy, '#ffffff'); };
    if (acc === 'ghost') { p.rect(18, hy, 3, 3, '#a0fff0'); p.rect(27, hy, 3, 3, '#a0fff0'); }
    else { eye(18); eye(27); }
    p.ellipse(24, hy + 6, 5, 3, shade(tan, 0.25));
    p.rect(22, hy + 4, 4, 2, '#141018');
    p.px(23, hy + 8, '#c04050'); p.px(24, hy + 8, '#c04050');
    p.px(16, hy + 4, '#f0a0a0'); p.px(31, hy + 4, '#f0a0a0');
  }

  // fej-kiegészítők
  switch (acc) {
    case 'frog': case 'frogking':
      p.ellipse(24, hy - 6, 12, 6, '#4fc84a'); p.circle(16, hy - 11, 4, '#4fc84a'); p.circle(32, hy - 11, 4, '#4fc84a');
      p.circle(16, hy - 11, 2, '#ffffff'); p.circle(32, hy - 11, 2, '#ffffff'); p.px(16, hy - 11, '#111'); p.px(32, hy - 11, '#111');
      if (acc === 'frogking') { p.rect(18, hy - 18, 12, 3, '#f0c040'); for (const x of [18, 23, 28]) p.tri(x, hy - 18, x + 1, hy - 23, x + 2, hy - 18, '#f0c040'); }
      break;
    case 'bee': case 'queen':
      p.rect(19, hy - 15, 1, 6, '#1a1a1a'); p.rect(29, hy - 15, 1, 6, '#1a1a1a'); p.circle(19, hy - 16, 1, '#1a1a1a'); p.circle(29, hy - 16, 1, '#1a1a1a');
      if (acc === 'queen') { p.rect(18, hy - 13, 12, 3, '#f0c040'); for (const x of [18, 23, 28]) p.tri(x, hy - 13, x + 1, hy - 18, x + 2, hy - 13, '#f0c040'); }
      break;
    case 'flame': p.tri(12, hy - 8, 15, hy - 20, 18, hy - 8, '#ff8a20'); p.tri(30, hy - 8, 33, hy - 20, 36, hy - 8, '#ff8a20'); p.tri(14, hy - 9, 15, hy - 16, 17, hy - 9, '#ffe060'); p.tri(31, hy - 9, 33, hy - 16, 35, hy - 9, '#ffe060'); break;
    case 'duck': p.ellipse(24, hy - 8, 11, 5, '#ffe060'); p.ellipse(24, hy - 3, 7, 2, '#ff9a20'); break;
    case 'ninja': case 'ninjamaster':
      p.rect(13, hy - 4, 22, 3, '#7a3ad0'); p.tri(35, hy - 4, 44, hy - 8, 42, hy - 1, '#7a3ad0');
      if (!back) { p.rect(17, hy + 3, 14, 6, '#2a1a3a'); }
      break;
    case 'cyber': if (!back) p.rect(15, hy - 1, 18, 5, '#40e0ff'); p.rect(15, hy - 1, 18, 1, '#a8f4ff'); p.rect(12, hy - 10, 3, 6, '#a8b8c8'); p.rect(33, hy - 10, 3, 6, '#a8b8c8'); break;
    case 'miner': p.ellipse(24, hy - 8, 12, 6, '#f0d030'); p.rect(12, hy - 4, 24, 2, '#c8a020'); if (!back) { p.circle(24, hy - 9, 3, '#ffffff'); p.circle(24, hy - 9, 2, '#fff8a0'); } break;
    case 'ice': p.tri(14, hy - 8, 17, hy - 18, 20, hy - 8, '#d8f6ff'); p.tri(28, hy - 8, 31, hy - 18, 34, hy - 8, '#d8f6ff'); p.tri(21, hy - 9, 24, hy - 20, 27, hy - 9, '#ffffff'); break;
    case 'wizard': p.tri(12, hy - 6, 36, hy - 6, 28, hy - 26, '#4a3ab0'); p.rect(10, hy - 7, 28, 3, '#3a2a90'); p.px(24, hy - 14, '#fff07a'); p.px(28, hy - 19, '#fff07a'); p.px(20, hy - 10, '#fff07a'); if (!back) { p.rect(40, 24, 2, 18, '#7a4a2a'); p.circle(41, 22, 2, '#fff07a'); } break;
    case 'dragon': p.tri(15, hy - 8, 12, hy - 18, 19, hy - 9, '#f0e0b0'); p.tri(33, hy - 8, 36, hy - 18, 29, hy - 9, '#f0e0b0'); break;
  }
  return outline(c);
}

// ======================= Teniszlabda (12×12) =======================
export function drawBall(color) {
  const c = cv(12, 12); const p = P(c.getContext('2d'));
  p.circle(6, 6, 5, color); p.circle(5, 5, 2, shade(color, 0.35));
  const ctx = c.getContext('2d'); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(-1, 6, 5, -0.9, 0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(13, 6, 5, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
  return outline(c);
}

/** Kis Mexi-portré ikon a menükhöz (48×48 vászonból). */
export function mexiIconDataURL(species, shiny = false) {
  return drawMexiBattle(species, shiny, false).toDataURL();
}
