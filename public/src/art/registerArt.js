// Textúrák regisztrálása a Phaserben.
// A végleges grafikák a public/assets mappából jönnek (feldarabolt ChatGPT-s sprite-lapok).
// Ahol még nincs kép (pl. fejlődési alakok), ott a meglévőből készül változat, vagy a kódból rajzolt helyettesítő.
import { drawMexiBattle, drawBall, hueShift } from './placeholders.js';
import { TILE_INDEX, BUILDING_INFO, PROP_INFO, ITILE_INDEX, FURNITURE_INFO } from './assetIndex.js';
import { MEXIS } from '../data/mexis.js';
import { ITEMS } from '../data/items.js';

export const TS = 32; // a világ csempemérete
export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };

// A sprite-lapok sorrendje
export const ART_SPECIES = ['alap', 'beka', 'mehecske', 'lang', 'kacsa', 'nindzsa', 'kiber', 'banyasz', 'jeg', 'magus', 'szellem', 'sarkany'];
const EVO_BASE = { mocsarkiraly: ['beka', -30, '#f0c040'], mehkiralyno: ['mehecske', 25, '#f0c040'], arnyekmester: ['nindzsa', 40, '#d040f0'] };
export const NPC_ROWS = ['apolo', 'boltos', 'professzor', 'anya', 'bacsi', 'kisfiu', 'edzo1', 'gyujto'];

const urlCache = {};
export function getArtURL(species, shiny) { return urlCache[species + (shiny ? '_s' : '')] || null; }

export function preloadArt(scene) {
  const L = scene.load;
  L.image('src_tiles', 'assets/tiles.png');
  L.image('src_fringe', 'assets/fringe.png');
  L.image('src_player', 'assets/player.png');
  L.image('src_npcs', 'assets/npcs.png');
  L.image('src_front', 'assets/mexi_front.png');
  L.image('src_back', 'assets/mexi_back.png');
  L.image('src_map', 'assets/mexi_map.png');
  L.image('src_evo', 'assets/mexi_evo.png');
  L.image('title_bg', 'assets/title.jpg');
  for (const k of Object.keys(BUILDING_INFO)) L.image('b_' + k, `assets/b_${k}.png`);
  for (const k of Object.keys(PROP_INFO)) L.image('pr_' + k, `assets/p_${k}.png`);
  L.image('src_itiles', 'assets/itiles.png');
  for (const k of Object.keys(FURNITURE_INFO)) L.image('fu_' + k, `assets/f_${k}.png`);
}

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function crop(img, x, y, w, h) { const c = cv(w, h); c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h); return c; }

/** Színárnyalat-eltolás képpontonként (a shiny / fejlődött térkép-sprite-okhoz). */
function hueCanvas(src, deg, sat = 1) {
  const c = cv(src.width, src.height); const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height); const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 10) continue;
    let r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) { const dd = max - min; s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
      h = max === r ? (g - b) / dd + (g < b ? 6 : 0) : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h /= 6; }
    h = (h + deg / 360 + 1) % 1; s = Math.min(1, s * sat);
    const f = (pp, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return pp + (q - pp) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return pp + (q - pp) * (2 / 3 - t) * 6; return pp; };
    if (s === 0) { r = g = b = l; } else { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - q; r = f(pp, q, h + 1 / 3); g = f(pp, q, h); b = f(pp, q, h - 1 / 3); }
    p[i] = r * 255; p[i + 1] = g * 255; p[i + 2] = b * 255;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function addSheet(scene, key, canvas, fw, fh) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas);
  const cols = Math.floor(canvas.width / fw), rows = Math.floor(canvas.height / fh);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
  return tex;
}
function addCanvas(scene, key, canvas) { if (scene.textures.exists(key)) scene.textures.remove(key); scene.textures.addCanvas(key, canvas); }
const img = (scene, key) => scene.textures.get(key).getSourceImage();

/** Korona a fejlődött alakokra, amíg nincs saját képük. */
function crowned(src, color) {
  const c = cv(src.width, src.height); const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const w = src.width, s = w / 96;
  ctx.fillStyle = color; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  const x0 = 34 * s, y0 = 12 * s, cw = 28 * s, ch = 12 * s;
  ctx.moveTo(x0, y0 + ch); ctx.lineTo(x0, y0 + 2 * s); ctx.lineTo(x0 + cw * 0.25, y0 + ch * 0.55); ctx.lineTo(x0 + cw * 0.5, y0 - 2 * s);
  ctx.lineTo(x0 + cw * 0.75, y0 + ch * 0.55); ctx.lineTo(x0 + cw, y0 + 2 * s); ctx.lineTo(x0 + cw, y0 + ch); ctx.closePath(); ctx.fill(); ctx.stroke();
  return c;
}

export function registerArt(scene) {
  // ---- csempék névvel
  const tilesImg = img(scene, 'src_tiles');
  const tex = scene.textures.addCanvas('tiles', crop(tilesImg, 0, 0, tilesImg.width, tilesImg.height));
  for (const [name, i] of Object.entries(TILE_INDEX)) tex.add(name, 0, i * TS, 0, TS, TS);
  const it = img(scene, 'src_itiles');
  const itex = scene.textures.addCanvas('itiles', crop(it, 0, 0, it.width, it.height));
  for (const [name, i] of Object.entries(ITILE_INDEX)) itex.add(name, 0, i * TS, 0, TS, TS);
  addSheet(scene, 'fringe', crop(img(scene, 'src_fringe'), 0, 0, 128, 32), TS, TS);

  // ---- játékos (6 oszlop: fiú 0-2, lány 3-5; 4 sor irányonként), 32×44
  const pl = img(scene, 'src_player');
  for (const [key, off] of [['fiu', 0], ['lany', 3]]) {
    const c = cv(32 * 3, 44 * 4); const ctx = c.getContext('2d');
    for (let r = 0; r < 4; r++) for (let f = 0; f < 3; f++) ctx.drawImage(pl, (off + f) * 32, r * 44, 32, 44, f * 32, r * 44, 32, 44);
    addSheet(scene, 'p_' + key, c, 32, 44);
  }
  // Lili (edző lány): a lány-sprite lila változata
  addSheet(scene, 'p_edzo2', hueCanvas(scene.textures.get('p_lany').getSourceImage(), 140, 1.1), 32, 44);

  // ---- NPC-k: soronként 4 irány, egy-egy képkocka → 3 egyforma fázis
  const np = img(scene, 'src_npcs');
  NPC_ROWS.forEach((key, row) => {
    const c = cv(32 * 3, 44 * 4); const ctx = c.getContext('2d');
    for (let d = 0; d < 4; d++) for (let f = 0; f < 3; f++) ctx.drawImage(np, d * 32, row * 44, 32, 44, f * 32, d * 44, 32, 44);
    addSheet(scene, 'p_' + key, c, 32, 44);
  });

  // ---- Mexik: térkép (32×32, 4 irány × 3 fázis), harc elöl/hátul (96×96)
  const mp = img(scene, 'src_map'), fr = img(scene, 'src_front'), bk = img(scene, 'src_back');
  ART_SPECIES.forEach((sp, row) => {
    const order = row === 0 ? [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11]] : [[0, 1, 0], [2, 3, 2], [4, 5, 4], [6, 7, 6]];
    const c = cv(96, 128); const ctx = c.getContext('2d');
    order.forEach((frames, d) => frames.forEach((src, f) => ctx.drawImage(mp, src * 32, row * 32, 32, 32, f * 32, d * 32, 32, 32)));
    addSheet(scene, 'mm_' + sp, c, 32, 32);
    addSheet(scene, 'mm_' + sp + '_s', hueCanvas(c, 150), 32, 32);
    const B = 192;
    const f = crop(fr, (row % 6) * B, Math.floor(row / 6) * B, B, B);
    const fs = crop(fr, (row % 6) * B, (2 + Math.floor(row / 6)) * B, B, B);
    const b = crop(bk, (row % 4) * B, Math.floor(row / 4) * B, B, B);
    addCanvas(scene, 'mf_' + sp, f); addCanvas(scene, 'mf_' + sp + '_s', fs);
    addCanvas(scene, 'mb_' + sp, b); addCanvas(scene, 'mb_' + sp + '_s', hueCanvas(b, 150));
    urlCache[sp] = f.toDataURL(); urlCache[sp + '_s'] = fs.toDataURL();
  });
  // fejlődési alakok: saját harci képek (elöl, hátul, shiny elöl); a térképen az alapfaj színváltozata
  const ev = img(scene, 'src_evo');
  Object.entries(EVO_BASE).forEach(([evo, [base, deg]], col) => {
    const f = crop(ev, col * 192, 0, 192, 192), b = crop(ev, col * 192, 192, 192, 192), fs = crop(ev, col * 192, 384, 192, 192);
    addCanvas(scene, 'mf_' + evo, f); addCanvas(scene, 'mf_' + evo + '_s', fs);
    addCanvas(scene, 'mb_' + evo, b); addCanvas(scene, 'mb_' + evo + '_s', hueCanvas(b, 150));
    urlCache[evo] = f.toDataURL(); urlCache[evo + '_s'] = fs.toDataURL();
    for (const s of ['', '_s']) addSheet(scene, 'mm_' + evo + s, hueCanvas(scene.textures.get('mm_' + base + s).getSourceImage(), deg, 1.15), 32, 32);
  });
  // biztonsági tartalék: ha valamelyik fajnak nincs képe, a kódból rajzolt változat (2× nagyítva)
  for (const sp of Object.keys(MEXIS)) for (const s of [false, true]) {
    const k = 'mf_' + sp + (s ? '_s' : '');
    if (scene.textures.exists(k)) continue;
    const small = drawMexiBattle(sp, s, false); const big = cv(192, 192); const g = big.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, 192, 192);
    addCanvas(scene, k, big);
  }

  for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'ball') addCanvas(scene, 'ball_' + id, drawBall(it.color));
  const px = cv(4, 4); const c = px.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4);
  addCanvas(scene, 'px', px);
}

export { BUILDING_INFO, PROP_INFO, FURNITURE_INFO, hueShift };
