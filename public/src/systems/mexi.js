// Mexi-példányok létrehozása, statisztikák, XP és fejlődés.
import { MEXIS, NATURES } from '../data/mexis.js';
import { MOVES } from '../data/moves.js';
import { CONFIG } from '../data/config.js';

let rng = Math.random;
export function setRng(fn) { rng = fn; }
export const rand = () => rng();
export const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));

function uid() {
  return 'mx_' + Date.now().toString(36) + '_' + Math.floor(rng() * 1e9).toString(36);
}

// ---------- XP-görbe: az első szintek gyorsak, később lassul ----------
/** A teljes tanulható lista: az előző fejlődési alak(ok) támadásai is (a fejlődés szintjéig). */
export function fullLearnset(species) {
  for (const [k, d] of Object.entries(MEXIS)) if (d.evolve && d.evolve.to === species)
    return [...fullLearnset(k).filter(([l]) => l < d.evolve.level), ...MEXIS[species].learnset];
  return MEXIS[species].learnset;
}

export function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(0.8 * level ** 3 + 10 * level);
}

export function calcStats(m) {
  const sp = MEXIS[m.species];
  const nat = NATURES[m.nature];
  const s = {};
  for (const k of Object.keys(sp.base)) {
    const b = sp.base[k], iv = m.ivs[k];
    if (k === 'hp') s.hp = Math.floor(((2 * b + iv) * m.level) / 100) + m.level + 10;
    else {
      let v = Math.floor(((2 * b + iv) * m.level) / 100) + 5;
      if (nat.up === k) v = Math.floor(v * 1.1);
      if (nat.down === k) v = Math.floor(v * 0.9);
      s[k] = v;
    }
  }
  return s;
}

function movesAtLevel(species, level) {
  const ord = fullLearnset(species).filter(([l]) => l <= level).sort((a, b) => a[0] - b[0]).map(([, id]) => id);
  const list = ord.filter((id, i) => ord.lastIndexOf(id) === i); // ismétlődőknél a legkésőbbi számít
  const uniq = [...new Set(list)];
  return uniq.slice(-4).map(id => ({ id, pp: MOVES[id].pp }));
}

/** Új Mexi-példány: egyedi azonosító, egyedi adottságok (IV), természet, esetleges shiny. */
export function createMexi(species, level, opts = {}) {
  if (!MEXIS[species]) throw new Error('Ismeretlen Mexi: ' + species);
  const ivs = {};
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) ivs[k] = randInt(0, 15);
  const m = {
    uid: uid(),
    species,
    nickname: null,
    level,
    xp: xpForLevel(level),
    ivs,
    nature: randInt(0, NATURES.length - 1),
    shiny: opts.shiny ?? (rng() < CONFIG.shinyChance),
    moves: movesAtLevel(species, level),
    status: null,
    caughtAt: null,
    caughtWhere: null,
  };
  m.stats = calcStats(m);
  m.hp = m.stats.hp;
  return m;
}

export function displayName(m) { return m.nickname || MEXIS[m.species].name; }

export function ivPercent(m) {
  const sum = Object.values(m.ivs).reduce((a, b) => a + b, 0);
  return Math.round((sum / 90) * 100);
}

export function xpYield(defeated, isTrainer) {
  const base = MEXIS[defeated.species].xpYield;
  return Math.max(1, Math.floor((base * defeated.level) / 7 * (isTrainer ? 1.5 : 1)));
}

/**
 * XP hozzáadása. Visszaadja az eseményeket: szintlépés, új támadás (automatikus vagy felajánlott), fejlődés.
 */
export function gainXp(m, amount) {
  const events = [];
  if (m.level >= CONFIG.maxLevel) return events;
  m.xp += amount;
  while (m.level < CONFIG.maxLevel && m.xp >= xpForLevel(m.level + 1)) {
    const oldStats = m.stats;
    m.level++;
    m.stats = calcStats(m);
    m.hp = Math.min(m.stats.hp, m.hp + (m.stats.hp - oldStats.hp));
    events.push({ type: 'levelup', level: m.level });
    for (const [lvl, moveId] of MEXIS[m.species].learnset) {
      if (lvl !== m.level || m.moves.some(x => x.id === moveId)) continue;
      if (m.moves.length < 4) {
        m.moves.push({ id: moveId, pp: MOVES[moveId].pp });
        events.push({ type: 'learned', move: moveId });
      } else {
        events.push({ type: 'canLearn', move: moveId });
      }
    }
  }
  if (m.level >= CONFIG.maxLevel) m.xp = xpForLevel(CONFIG.maxLevel);
  return events;
}

/** Vad Mexi szintjének igazítása: ha a csapatod legerősebbje jóval a terület fölött jár, a vad Mexik is felzárkóznak (max +8). */
export function scaleWildLevel(base, zoneMax, party) {
  const top = Math.max(0, ...party.filter(m => m.hp > 0).map(m => m.level));
  const over = top - zoneMax - 3;
  return Math.min(CONFIG.maxLevel, base + (over > 0 ? Math.min(8, Math.ceil(over * 0.6)) : 0));
}

export function canEvolve(m) {
  const evo = MEXIS[m.species].evolve;
  if (evo && evo.level && m.level >= evo.level) return evo.to;
  return null;
}

export function evolve(m, to) {
  const hpLost = m.stats.hp - m.hp;
  m.species = to;
  m.stats = calcStats(m);
  m.hp = Math.max(1, m.stats.hp - hpLost);
  const pending = [];
  for (const [lvl, moveId] of MEXIS[to].learnset) {
    if (lvl > m.level || m.moves.some(x => x.id === moveId)) continue;
    if (m.moves.length < 4) m.moves.push({ id: moveId, pp: MOVES[moveId].pp });
    else if (lvl === m.level) pending.push(moveId);
  }
  return pending;
}

/** Elfelejtett / kihagyott támadások, amiket a Mexi újra megtanulhat (szint ≤ jelenlegi). */
export function relearnable(m) {
  const seen = new Set();
  return fullLearnset(m.species).filter(([lvl, id]) => lvl <= m.level && !m.moves.some(x => x.id === id) && !seen.has(id) && seen.add(id)).map(([, id]) => id);
}

export function healFull(m) {
  m.stats = calcStats(m);
  m.hp = m.stats.hp;
  m.status = null;
  for (const mv of m.moves) mv.pp = MOVES[mv.id].pp;
}
