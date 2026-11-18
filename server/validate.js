// Szerveroldali ellenőrzés: a klienstől érkező Mexiket, tárgyakat, mentéseket és harci lépéseket
// soha nem fogadjuk el vakon. A statisztikákat a szerver mindig maga számolja újra.
import { MEXIS, NATURES } from '../public/src/data/mexis.js';
import { MOVES, STATUS } from '../public/src/data/moves.js';
import { ITEMS } from '../public/src/data/items.js';
import { CONFIG } from '../public/src/data/config.js';
import { MAPS, TRAINERS } from '../public/src/data/maps.js';
import { calcStats, xpForLevel, createMexi } from '../public/src/systems/mexi.js';
import { safePosition } from '../public/src/data/mapNav.js';

/** Jelenleg szabályosan NEM megszerezhető fajok (később történeti eseményekhez kötve). */
export const UNOBTAINABLE = new Set(['sarkany', 'fonix', 'tengerur', 'aranymexi']);
/** Fejlődési lánc (az adott faj és összes előzménye). */
const chainOf = (sp) => { const out = [sp]; for (const [k, d] of Object.entries(MEXIS)) if (d.evolve?.to === sp) out.push(...chainOf(k)); return out; };
/** Szabályosan tanulható támadások az adott szinten (a lánc bármely tagjától, az aktuális szintig). */
export function legalMoves(species, level) {
  const set = new Set();
  for (const sp of chainOf(species)) for (const [l, id] of MEXIS[sp].learnset) if (l <= level) set.add(id);
  return set;
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const int = (v, lo, hi, def = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.trunc(+v))) : def);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);

/** Egy Mexi megtisztítása. Lehetetlen adat esetén null. A statokat a szerver számolja. */
export function sanitizeMexi(m, { maxLevel = CONFIG.maxLevel } = {}) {
  if (!m || typeof m !== 'object' || !MEXIS[m.species]) return null;
  const level = int(m.level, 1, maxLevel, 1);
  const ivs = {}; for (const k of STAT_KEYS) ivs[k] = int(m.ivs?.[k], 0, 15, 0);
  const seen = new Set(); const moves = [];
  const legal = legalMoves(m.species, level);
  for (const mv of Array.isArray(m.moves) ? m.moves : []) {
    const d = MOVES[mv?.id]; if (!d || !legal.has(mv.id) || seen.has(mv.id) || moves.length >= 4) continue;
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
const ITEM_RATE = { hos_labda: { first: 2, perHour: 0, perWeek: 1 }, arany_labda: { first: 3, perHour: 2 } };
export function sanitizeSave(s, prev = null, now = Date.now()) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.party) || !Array.isArray(s.storage)) return { error: 'Hibás mentés.' };
  if (s.party.length > 6 || s.storage.length > 3000) return { error: 'Hibás mentés.' };
  const minutes = prev ? Math.max(1, (now - (prev.serverSavedAt || now)) / 60000) : 0;
  const report = [];
  const quarantine = Array.isArray(prev?.quarantine) ? [...prev.quarantine] : [];
  const prevMons = new Map([...(prev?.party || []), ...(prev?.storage || [])].map(m => [m.uid, m]));
  const prevTop = Math.max(5, ...[...prevMons.values()].map(m => m.level || 1));
  let newCount = 0;
  const clean = (m) => {
    if (m && UNOBTAINABLE.has(m.species)) { if (!quarantine.some(q => q.mexi?.uid === m.uid)) quarantine.push({ at: now, reason: 'nem megszerezhető faj', mexi: m }); report.push('karantén: ' + m.species); return null; }
    const c = sanitizeMexi(m); if (!c) return null;
    const old = prevMons.get(c.uid);
    if (prev) {
      // szintugrás korlátja két mentés között (csontos erősítéssel együtt is bőven elég)
      const maxLv = old ? old.level + 5 + Math.floor(minutes * 3) : Math.max(25, prevTop + 3);
      if (c.level > maxLv) { c.level = Math.max(1, Math.min(CONFIG.maxLevel, maxLv)); c.xp = xpForLevel(c.level); c.stats = calcStats(c); c.hp = Math.min(c.hp, c.stats.hp); report.push('szint korlátozva'); }
      if (old) { // az elkapáskor sorsolt egyedi adottságok és a shiny nem változhat
        c.ivs = { ...c.ivs, ...Object.fromEntries(Object.entries(old.ivs || {}).map(([k, v]) => [k, int(v, 0, 15, 0)])) };
        c.shiny = old.shiny === true; c.nature = int(old.nature, 0, NATURES.length - 1, 0);
        // fajváltás csak szabályos fejlődéssel
        if (old.species !== c.species && !chainOf(c.species).includes(old.species)) { report.push('fajcsere elutasítva'); return sanitizeMexi(old); }
        c.stats = calcStats(c); c.hp = Math.min(c.hp, c.stats.hp);
      } else newCount++;
    }
    return c;
  };
  const party = s.party.map(clean).filter(Boolean);
  const storage = s.storage.map(clean).filter(Boolean);
  if (!party.length && !storage.length && prev && (prev.party?.length || prev.storage?.length)) return { error: 'A mentés üres – nem írjuk felül a régit.' };
  if (prev && newCount > 20 + minutes * 6) return { error: 'Túl sok új Mexi egyszerre – a mentést nem fogadjuk el.' };
  const uids = new Set(); const dedupe = (list) => list.filter(m => (uids.has(m.uid) ? false : uids.add(m.uid)));
  const out = { ...s, party: dedupe(party), storage: dedupe(storage) };
  if (!out.party.length && out.storage.length) out.party.push(out.storage.shift());
  // pénz
  let money = int(s.money, 0, 9999999, 0);
  if (prev && Number.isFinite(prev.money)) { const maxGain = 5000 + minutes * 3000; if (money - prev.money > maxGain) { money = prev.money + maxGain; report.push('pénz korlátozva'); } }
  out.money = money;
  // tárgyak: ritka labdák szigorúan, a többi időarányosan
  const inv = sanitizeInventory(s.inventory);
  const srv = { ...(prev?._srv || {}) };
  for (const [k, n] of Object.entries(inv)) {
    const before = prev ? (prev.inventory?.[k] || 0) : 0;
    const rate = ITEM_RATE[k];
    let max;
    if (!prev) max = rate ? rate.first : 99;
    else if (k === 'hos_labda') max = before + ((now - (srv.hosAt || 0)) >= 6 * 86400000 ? 1 : 0);
    else if (rate) max = before + rate.first + Math.floor(minutes / 60 * rate.perHour);
    else max = before + 40 + Math.floor(minutes * 10);
    if (n > max) { inv[k] = Math.max(0, max); report.push(k + ' korlátozva'); }
    if (k === 'hos_labda' && inv[k] > before) srv.hosAt = now;
  }
  out.inventory = inv;
  out.bones = {};
  for (const [k, v] of Object.entries(s.bones || {})) if (MEXIS[k] && familyRoot(k) === k) {
    let n = int(v, 0, 99999, 0);
    const before = prev?.bones?.[k] || 0;
    const max = prev ? before + 60 + Math.floor(minutes * 20) : 300;
    if (n > max) { n = max; report.push('csont korlátozva'); }
    out.bones[k] = n;
  }
  const dex = { seen: {}, caught: {}, shiny: {} };
  for (const t of ['seen', 'caught', 'shiny']) for (const k of Object.keys(s.dex?.[t] || {})) if (MEXIS[k] && s.dex[t][k] && !UNOBTAINABLE.has(k)) dex[t][k] = true;
  for (const m of [...out.party, ...out.storage]) { dex.seen[m.species] = dex.caught[m.species] = true; }
  out.dex = dex;
  out.defeatedTrainers = [...new Set((Array.isArray(s.defeatedTrainers) ? s.defeatedTrainers : []).filter(t => TRAINERS[t]))];
  out.foundItems = [...new Set((Array.isArray(s.foundItems) ? s.foundItems : []).filter(x => typeof x === 'string').map(x => x.slice(0, 40)))].slice(0, 2000);
  // pozíció: csak létező térkép és bejárható mező
  if (!MAPS[s.map]) { out.map = 'mancsfalva'; }
  const ps = safePosition(out.map, int(s.pos?.x, -1, 999, -1), int(s.pos?.y, -1, 999, -1));
  out.pos = { x: ps.x, y: ps.y, dir: ['up', 'down', 'left', 'right'].includes(s.pos?.dir) ? s.pos.dir : 'down' };
  if (ps.fixed) report.push('pozíció javítva');
  if (s.lastHeal && !MAPS[s.lastHeal.map]) out.lastHeal = { map: 'int_heal', x: 5, y: 3 };
  out.quarantine = quarantine.slice(-50);
  out._srv = srv;
  // komoly javítás (nem csak pozíció): a kliensnek át kell vennie a szerver változatát
  const serious = report.some(r => r !== 'pozíció javítva');
  return { save: out, report, serious };
}

/** Közös harcba küldött csapat: megtisztítva, és ha van felhős mentés, csak az ott is meglévő Mexik, legfeljebb az ott rögzített szinten. */
export function sanitizeCoopParty(arr, cloudSave, guestMaxLevel) {
  if (!Array.isArray(arr)) return [];
  let list = arr.slice(0, 6).filter(m => m && !UNOBTAINABLE.has(m.species)).map(m => sanitizeMexi(m)).filter(Boolean);
  if (cloudSave) {
    const known = new Map([...(cloudSave.party || []), ...(cloudSave.storage || [])].map(m => [m.uid, m]));
    // a felhőben tárolt (szerver által ellenőrzött) példányt használjuk; csak a HP-t és PP-t vesszük át a klienstől
    list = list.filter(m => known.has(m.uid) && known.get(m.uid).species === m.species).map(m => {
      const k = sanitizeMexi(known.get(m.uid));
      k.hp = Math.min(k.stats.hp, m.hp); k.status = m.status;
      for (const mv of k.moves) { const c = m.moves.find(x => x.id === mv.id); if (c) mv.pp = Math.min(mv.pp, c.pp); }
      return k;
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
  // a csak szintet megadó zónák a térkép alap-táblázatát használják
  const pickT = (z) => z && ((night ? z.night : z.day) || z.day);
  const table = pickT(zone) || pickT(enc.default);
  if (!table?.length) return null;
  return { table, levels: zone?.levels || enc.default.levels };
}
