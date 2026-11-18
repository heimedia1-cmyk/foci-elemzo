// Szerveroldali ellenőrzés: a klienstől érkező Mexiket, tárgyakat, mentéseket és harci lépéseket
// soha nem fogadjuk el vakon. A statisztikákat a szerver mindig maga számolja újra.
import { MEXIS, NATURES } from '../public/src/data/mexis.js';
import { MOVES, STATUS } from '../public/src/data/moves.js';
import { ITEMS } from '../public/src/data/items.js';
import { CONFIG } from '../public/src/data/config.js';
import { MAPS, TRAINERS } from '../public/src/data/maps.js';
import { calcStats, xpForLevel, createMexi } from '../public/src/systems/mexi.js';

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const int = (v, lo, hi, def = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.trunc(+v))) : def);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

/** Egy Mexi megtisztítása. Lehetetlen adat esetén null. A statokat a szerver számolja. */
export function sanitizeMexi(m, { maxLevel = CONFIG.maxLevel } = {}) {
  if (!m || typeof m !== 'object' || !MEXIS[m.species]) return null;
  const level = int(m.level, 1, maxLevel, 1);
  const ivs = {}; for (const k of STAT_KEYS) ivs[k] = int(m.ivs?.[k], 0, 15, 0);
  const seen = new Set(); const moves = [];
  for (const mv of Array.isArray(m.moves) ? m.moves : []) {
    const d = MOVES[mv?.id]; if (!d || seen.has(mv.id) || moves.length >= 4) continue;
    seen.add(mv.id); moves.push({ id: mv.id, pp: int(mv.pp, 0, d.pp, d.pp) });
  }
  const clean = {
    uid: str(m.uid, 40) || Math.random().toString(36).slice(2, 12),
    species: m.species, nickname: str(m.nickname, 16) || null, level,
    xp: int(m.xp, xpForLevel(level), Math.max(xpForLevel(level), xpForLevel(level + 1) - 1), xpForLevel(level)),
    ivs, nature: int(m.nature, 0, NATURES.length - 1, 0), shiny: m.shiny === true,
    moves: moves.length ? moves : createMexi(m.species, level).moves,
    status: STATUS[m.status] ? m.status : null,
    caughtAt: Number.isFinite(m.caughtAt) ? m.caughtAt : null, caughtWhere: str(m.caughtWhere, 40),
    locked: m.locked === true,
    friendship: int(m.friendship, 0, 255, 0),
  };
  clean.stats = calcStats(clean);
  clean.hp = int(m.hp, 0, clean.stats.hp, clean.stats.hp);
  return clean;
}

/** Tárgyak: csak létező tárgy, egész szám, 0–999 darab. */
export function sanitizeInventory(inv) {
  const out = {};
  if (inv && typeof inv === 'object') for (const [k, v] of Object.entries(inv)) if (ITEMS[k]) { const n = int(v, 0, 999, 0); if (n > 0) out[k] = n; }
  return out;
}

const familyRoot = (sp) => { for (const [k, d] of Object.entries(MEXIS)) if (d.evolve?.to === sp) return familyRoot(k); return sp; };

/**
 * Teljes mentés ellenőrzése. prev: az előző (már elfogadott) mentés, ha van – ehhez képest nézzük az ugrásokat.
 * Visszaad: { save } vagy { error }.
 */
export function sanitizeSave(s, prev = null) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.party) || !Array.isArray(s.storage)) return { error: 'Hibás mentés.' };
  if (s.party.length > 6 || s.storage.length > 3000) return { error: 'Hibás mentés.' };
  const party = s.party.map(m => sanitizeMexi(m)).filter(Boolean);
  const storage = s.storage.map(m => sanitizeMexi(m)).filter(Boolean);
  if (!party.length && !storage.length && prev && (prev.party?.length || prev.storage?.length)) return { error: 'A mentés üres – nem írjuk felül a régit.' };
  // uid ismétlődés (másolt Mexik) kiszűrése
  const uids = new Set(); const dedupe = (list) => list.filter(m => (uids.has(m.uid) ? false : uids.add(m.uid)));
  const out = { ...s, party: dedupe(party), storage: dedupe(storage) };
  // pénz: egész, 0 – 9 999 999, és nem nőhet irreálisan gyorsan két mentés között
  let money = int(s.money, 0, 9999999, 0);
  if (prev && Number.isFinite(prev.money)) {
    const minutes = Math.max(1, ((Date.now() - (prev.serverSavedAt || Date.now())) / 60000));
    const maxGain = 5000 + minutes * 3000;
    if (money - prev.money > maxGain) money = prev.money + maxGain;
  }
  out.money = money;
  out.inventory = sanitizeInventory(s.inventory);
  out.bones = {};
  for (const [k, v] of Object.entries(s.bones || {})) if (MEXIS[k] && familyRoot(k) === k) out.bones[k] = int(v, 0, 99999, 0);
  const dex = { seen: {}, caught: {}, shiny: {} };
  for (const t of ['seen', 'caught', 'shiny']) for (const k of Object.keys(s.dex?.[t] || {})) if (MEXIS[k] && s.dex[t][k]) dex[t][k] = true;
  out.dex = dex;
  out.defeatedTrainers = (Array.isArray(s.defeatedTrainers) ? s.defeatedTrainers : []).filter(t => TRAINERS[t]).slice(0, 200);
  out.foundItems = (Array.isArray(s.foundItems) ? s.foundItems : []).filter(x => typeof x === 'string').slice(0, 2000).map(x => x.slice(0, 40));
  if (out.map && !MAPS[out.map]) { out.map = 'mancsfalva'; out.pos = { x: 6, y: 20, dir: 'down' }; }
  out.pos = { x: int(s.pos?.x, 0, 200, 6), y: int(s.pos?.y, 0, 200, 20), dir: ['up', 'down', 'left', 'right'].includes(s.pos?.dir) ? s.pos.dir : 'down' };
  return { save: out };
}

/** Közös harcba küldött csapat: megtisztítva, és ha van felhős mentés, csak az ott is meglévő Mexik, legfeljebb az ott rögzített szinten. */
export function sanitizeCoopParty(arr, cloudSave, guestMaxLevel) {
  if (!Array.isArray(arr)) return [];
  let list = arr.slice(0, 6).map(m => sanitizeMexi(m)).filter(Boolean);
  if (cloudSave) {
    const known = new Map([...(cloudSave.party || []), ...(cloudSave.storage || [])].map(m => [m.uid, m]));
    list = list.filter(m => known.has(m.uid) && known.get(m.uid).species === m.species).map(m => {
      const k = known.get(m.uid); // a felhős mentés kicsit késhet: 2 szint eltérést engedünk
      if (m.level > k.level + 2) { m.level = k.level; m.xp = xpForLevel(m.level); m.stats = calcStats(m); m.hp = Math.min(m.hp, m.stats.hp); }
      return m;
    });
  } else {
    list = list.map(m => { if (m.level > guestMaxLevel) { m.level = guestMaxLevel; m.xp = xpForLevel(m.level); m.stats = calcStats(m); m.hp = Math.min(m.hp, m.stats.hp); } return m; });
  }
  return list;
}

/** Harci lépés ellenőrzése a harc aktuális állapota alapján. Érvénytelen lépés → null. */
export function sanitizeAction(battle, playerId, a) {
  if (!a || typeof a !== 'object') return null;
  const ally = battle.allies.find(x => x.id === playerId); if (!ally) return null;
  const foeOk = (t) => Number.isInteger(t) && t >= 0 && t < battle.foes.length;
  switch (a.type) {
    case 'move': {
      const mon = ally.party[ally.active];
      if (!Number.isInteger(a.index) || a.index < 0 || a.index >= (mon?.moves.length || 0)) return null;
      return { type: 'move', index: a.index, target: foeOk(a.target) ? a.target : 0 };
    }
    case 'switch': return Number.isInteger(a.index) && a.index >= 0 && a.index < ally.party.length && ally.party[a.index].hp > 0 && a.index !== ally.active ? { type: 'switch', index: a.index } : null;
    case 'item': return ITEMS[a.itemId] && ITEMS[a.itemId].kind !== 'ball' && (ally.inventory[a.itemId] || 0) > 0 ? { type: 'item', itemId: a.itemId, target: int(a.target, 0, ally.party.length - 1, 0) } : null;
    case 'ball': return ITEMS[a.itemId]?.kind === 'ball' && (ally.inventory[a.itemId] || 0) > 0 ? { type: 'ball', itemId: a.itemId, target: foeOk(a.target) ? a.target : 0 } : null;
    case 'run': return { type: 'run' };
    default: return null;
  }
}

/** A vad Mexik táblázata a szerver saját térképadataiból (a kliens nem választhat). */
export function serverEncounterTable(mapKey, x, y, hour) {
  const enc = MAPS[mapKey]?.encounters; if (!enc) return null;
  const row = MAPS[mapKey].tiles?.[y]; const ch = row?.[x];
  if (ch !== '"' && !(MAPS[mapKey].cave && ch === ':')) return null;
  const night = hour >= 20 || hour < 6;
  const zone = (enc.zones || []).find(z => x >= z.rect[0] && y >= z.rect[1] && x < z.rect[0] + z.rect[2] && y < z.rect[1] + z.rect[3]);
  const src = zone || enc.default;
  return { table: (night ? src.night : src.day) || src.day, levels: src.levels || enc.default.levels };
}
