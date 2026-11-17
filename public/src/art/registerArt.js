// Textúrák regisztrálása a Phaserben.
// Most minden a kódból rajzolt helyettesítő grafikából jön (placeholders.js).
// Amikor megérkeznek a végleges sprite-lapok (assets/), itt lesznek feldarabolva és felülírják ezeket.
import { drawTiles, TILE_FRAMES, T, BUILDINGS, drawBuilding, PEOPLE, drawPerson, drawMexiMap, drawMexiBattle, drawBall } from './placeholders.js';
import { MEXIS } from '../data/mexis.js';
import { ITEMS } from '../data/items.js';

const urlCache = {};
export function getArtURL(species, shiny) { return urlCache[species + (shiny ? '_s' : '')] || null; }

function addSheet(scene, key, canvas, fw, fh) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas);
  const cols = Math.floor(canvas.width / fw), rows = Math.floor(canvas.height / fh);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(r * cols + c, 0, c * fw, r * fh, fw, fh);
  return tex;
}

export function registerArt(scene) {
  const tiles = drawTiles();
  const tex = scene.textures.addCanvas('tiles', tiles);
  TILE_FRAMES.forEach((name, i) => tex.add(name, 0, i * T, 0, T, T));

  for (const k of Object.keys(BUILDINGS)) scene.textures.addCanvas('b_' + k, drawBuilding(k));
  for (const k of Object.keys(PEOPLE)) addSheet(scene, 'p_' + k, drawPerson(k), T, T);

  for (const sp of Object.keys(MEXIS)) {
    for (const shiny of [false, true]) {
      const s = shiny ? '_s' : '';
      addSheet(scene, 'mm_' + sp + s, drawMexiMap(sp, shiny), T, T);
      scene.textures.addCanvas('mf_' + sp + s, drawMexiBattle(sp, shiny, false));
      scene.textures.addCanvas('mb_' + sp + s, drawMexiBattle(sp, shiny, true));
    }
  }
  for (const [id, it] of Object.entries(ITEMS)) if (it.kind === 'ball') scene.textures.addCanvas('ball_' + id, drawBall(it.color));

  // 1×1 fehér pixel effektekhez
  const px = document.createElement('canvas'); px.width = px.height = 4; const c = px.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4);
  scene.textures.addCanvas('px', px);
}

export const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 };
