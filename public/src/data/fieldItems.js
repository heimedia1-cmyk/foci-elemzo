// Látható tárgyak a térképeken (labdák, italok...). Rálépve felveheted őket.
// A helyük térképenként rögzített (a térkép nevéből számolt, mindig ugyanaz), a kliens és a szerver ugyanígy számolja.
import { MAPS } from './maps.js';
import { walkable } from './mapNav.js';

const POOLS = {
  early: [['sima_labda', 3], ['kis_ital', 2], ['sima_labda', 2], ['ebreszto', 1], ['profi_labda', 1]],
  mid: [['profi_labda', 2], ['nagy_ital', 1], ['kis_ital', 3], ['egeskenocs', 1], ['ellenmereg', 1], ['sima_labda', 5]],
  late: [['profi_labda', 3], ['nagy_ital', 2], ['csodabalzsam', 1], ['ebreszto', 2], ['jutalomfalat', 1]],
};
const COUNT = { mancsfalva: 1, osveny: 3, erdo: 3, barlang: 2 };

function seeded(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }
const cache = new Map();

/** A térkép látható tárgyai: [{ id, x, y, item, qty }]. */
export function fieldItems(mapKey) {
  if (cache.has(mapKey)) return cache.get(mapKey);
  const m = MAPS[mapKey]; let out = [];
  if (m && !m.interior) {
    const w = walkable(mapKey);
    const lvl = m.encounters?.default?.levels?.[1] ?? 8;
    const pool = lvl <= 12 ? POOLS.early : lvl <= 26 ? POOLS.mid : POOLS.late;
    const n = COUNT[mapKey] ?? (m.encounters ? 3 : 2);
    const bad = new Set();
    for (const wp of m.warps || []) for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) bad.add((wp.x + dx) + ',' + (wp.y + dy));
    for (const d of w?.doors || []) for (let dy = 0; dy <= 2; dy++) bad.add(d.x + ',' + (d.y + dy));
    for (const t of m.triggers || []) for (let i = -1; i <= t.w; i++) for (let j = -1; j <= t.h; j++) bad.add((t.x + i) + ',' + (t.y + j));
    for (const h of m.hidden || []) bad.add(h.x + ',' + h.y);
    for (const s of m.signs || []) bad.add(s.x + ',' + (s.y + 1));
    const cands = [...(w?.seen || [])].filter(k => {
      if (bad.has(k)) return false;
      const [x, y] = k.split(',').map(Number); const c = m.tiles[y][x];
      return c !== '=' && c !== 'c' && c !== 'B' && c !== 'V' && c !== 'p';
    }).sort();
    const rnd = seeded('mexi-items-' + mapKey);
    for (let tries = 0; out.length < n && tries < 400 && cands.length; tries++) {
      const k = cands[Math.floor(rnd() * cands.length)]; const [x, y] = k.split(',').map(Number);
      if (out.some(o => Math.abs(o.x - x) + Math.abs(o.y - y) < 7)) continue;
      const [item, qty] = pool[Math.floor(rnd() * pool.length)];
      out.push({ id: `fi_${mapKey}_${out.length}`, x, y, item, qty });
    }
  }
  cache.set(mapKey, out);
  return out;
}

/** Egy tárgy-azonosító (látható vagy elrejtett) adatai a szerver ellenőrzéséhez. */
export function findById(mapKey, id) {
  const m = MAPS[mapKey]; if (!m) return null;
  return fieldItems(mapKey).find(o => o.id === id) || (m.hidden || []).find(h => h.id === id) || null;
}
