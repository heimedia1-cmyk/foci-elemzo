// Séta mód (GO) – tiszta logika, DOM nélkül (Node-ban is tesztelhető).
// A Mexik és Mancs-pontok helye a földrajzi rács + idő alapján determinisztikus:
// két játékos ugyanott ugyanazt látja, a szervernek nem kell tudnia senki helyzetét.
import { MEXIS } from '../data/mexis.js';
import { captureValue, shakeChance } from '../systems/capture.js';

export const GO = {
  spawnCellLat: 0.0005, spawnCellLng: 0.0007,   // ~55 m-es cellák
  spawnChance: 0.13,                             // ennyi cellában van éppen Mexi
  slotMs: 15 * 60 * 1000,                        // 15 percenként új Mexik
  stopCellLat: 0.0022, stopCellLng: 0.0031,      // ~250 m-es cellák
  stopChance: 0.6,
  viewRadius: 320,          // ennyi méteren belül látszanak
  catchRadius: 70,          // ennyire kell megközelíteni
  stopRadius: 45,           // Mancs-pont pörgetése
  stopCooldownMs: 5 * 60 * 1000,
  buddyKm: 1,               // ennyi km után talál csontot a sétatárs
  maxSpeed: 7,              // m/s fölött (≈25 km/h) nem számít a séta
  goCatchBonus: 1.6,
};

const SPAWN_DAY = [['alap', 22], ['beka', 14], ['mehecske', 13], ['kacsa', 11], ['banyasz', 9], ['lang', 7], ['nindzsa', 6], ['jeg', 5], ['kiber', 4], ['magus', 3], ['szellem', 2], ['hosmexi', 0.8], ['sarkany', 0.15]];
const SPAWN_NIGHT = [['szellem', 16], ['nindzsa', 14], ['alap', 14], ['beka', 10], ['magus', 8], ['jeg', 8], ['kacsa', 7], ['banyasz', 7], ['kiber', 6], ['mehecske', 4], ['lang', 4], ['kisertet', 1], ['sarkany', 0.15]];
const STOP_NAMES = ['Csontkút', 'Labdás pad', 'Mancsszobor', 'Öreg tölgy', 'Kutyaitató', 'Szaglászó sarok', 'Teniszfal', 'Napos pad', 'Virágos kapu', 'Mexi-emlékkő', 'Kerti csap', 'Farokcsóváló tér', 'Csont-oszlop', 'Postaláda', 'Pihenő kő', 'Kis szökőkút'];

/** 32 bites hash → [0,1) véletlen generátor (mulberry32). */
export function seeded(...parts) {
  let h = 2166136261;
  for (const p of parts) { const s = String(p); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= 124; }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Távolság méterben (haversine). */
export function dist(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
/** Elmozdulás méterben (kelet/észak). */
export function offset(p, eastM, northM) {
  return { lat: p.lat + northM / 111320, lng: p.lng + eastM / (111320 * Math.cos(p.lat * Math.PI / 180)) };
}

function pick(rng, table) {
  const tot = table.reduce((a, [, w]) => a + w, 0); let r = rng() * tot;
  for (const [k, w] of table) if ((r -= w) < 0) return k;
  return table[0][0];
}

export const slotOf = (now) => Math.floor(now / GO.slotMs);
export const isNight = (now) => { const h = new Date(now).getHours(); return h >= 20 || h < 6; };

/** A közelben lévő Mexik (determinisztikus). topLevel: a játékos legerősebb Mexijének szintje. */
export function spawnsNear(pos, now, topLevel = 5) {
  const slot = slotOf(now); const out = [];
  const night = isNight(now);
  const cy0 = Math.floor(pos.lat / GO.spawnCellLat), cx0 = Math.floor(pos.lng / GO.spawnCellLng);
  const R = Math.ceil(GO.viewRadius / 50) + 1;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const cy = cy0 + dy, cx = cx0 + dx;
    const rng = seeded('sp', cy, cx, slot);
    if (rng() > GO.spawnChance) continue;
    const p = { lat: (cy + 0.1 + rng() * 0.8) * GO.spawnCellLat, lng: (cx + 0.1 + rng() * 0.8) * GO.spawnCellLng };
    const d = dist(pos, p); if (d > GO.viewRadius) continue;
    const species = pick(rng, night ? SPAWN_NIGHT : SPAWN_DAY);
    const lo = Math.max(2, Math.min(30, topLevel - 9)), hi = Math.max(lo + 2, Math.min(35, topLevel + 1));
    const level = lo + Math.floor(rng() * (hi - lo + 1));
    const shiny = rng() < 1 / 400;
    // a lejárati idő a cellán belül eltolva, hogy ne egyszerre tűnjön el minden
    const expires = (slot + 1) * GO.slotMs;
    out.push({ id: `${cy}_${cx}_${slot}`, species, level, shiny, ...p, d, expires, seed: `${cy}_${cx}_${slot}` });
  }
  return out.sort((a, b) => a.d - b.d);
}

/** A közelben lévő Mancs-pontok (helyük állandó). */
export function stopsNear(pos, radius = 600) {
  const out = [];
  const cy0 = Math.floor(pos.lat / GO.stopCellLat), cx0 = Math.floor(pos.lng / GO.stopCellLng);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const cy = cy0 + dy, cx = cx0 + dx; const rng = seeded('st', cy, cx);
    const n = rng() < GO.stopChance ? (rng() < 0.35 ? 2 : 1) : 0;
    for (let i = 0; i < n; i++) {
      const p = { lat: (cy + 0.12 + rng() * 0.76) * GO.stopCellLat, lng: (cx + 0.12 + rng() * 0.76) * GO.stopCellLng };
      const d = dist(pos, p); if (d > radius) continue;
      out.push({ id: `s${cy}_${cx}_${i}`, name: STOP_NAMES[Math.floor(rng() * STOP_NAMES.length)], ...p, d });
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/** Mancs-pont jutalma (pörgetésenként más). */
export function stopRewards(stopId, spinNo, topLevel) {
  const rng = seeded('rw', stopId, spinNo);
  const r = { sima_labda: 2 + Math.floor(rng() * 3) };
  if (topLevel >= 8 && rng() < 0.45) r.profi_labda = 1 + Math.floor(rng() * 2);
  if (rng() < 0.4) r.kis_ital = 1;
  if (topLevel >= 15 && rng() < 0.2) r.nagy_ital = 1;
  if (rng() < 0.08) r.ebreszto = 1;
  if (rng() < 0.03) r.arany_labda = 1;
  return r;
}

/** Dobás minősége a célkör méretéből (1 = legnagyobb, 0 = legkisebb). */
export function throwQuality(ring) {
  if (ring < 0.4) return { name: 'Kiváló!', mult: 2 };
  if (ring < 0.65) return { name: 'Remek!', mult: 1.6 };
  if (ring < 0.9) return { name: 'Szép!', mult: 1.3 };
  return { name: '', mult: 1 };
}

/** GO-elkapás: teljes HP-n, a dobás minőségével és labdával. Visszaad: { shakes, caught }. */
export function goThrow(target, ballId, qualityMult, rng = Math.random) {
  const a = Math.min(255, captureValue(target, ballId) * GO.goCatchBonus * qualityMult);
  const p = shakeChance(a); let shakes = 0;
  for (let i = 0; i < 4; i++) { if (rng() < p) shakes++; else break; }
  return { shakes: Math.min(3, shakes), caught: shakes === 4, chance: p ** 4 };
}
export function goCatchChance(target, ballId, qualityMult = 1) {
  return shakeChance(Math.min(255, captureValue(target, ballId) * GO.goCatchBonus * qualityMult)) ** 4;
}
/** Elfutás esélye egy sikertelen dobás után. */
export function fleeChance(species) {
  return { gyakori: 0.06, nemgyak: 0.1, ritka: 0.16, epikus: 0.22, legendas: 0.3, titkos: 0.3 }[MEXIS[species].rarity] ?? 0.12;
}
