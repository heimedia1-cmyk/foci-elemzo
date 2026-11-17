// Játékállapot + SaveManager (verziózott helyi mentés).
import { CONFIG } from '../data/config.js';
import { calcStats } from './mexi.js';

const KEY = 'mexiverse_save';

export function newGameState(name = 'Kalandor', gender = 'fiu') {
  return {
    version: CONFIG.saveVersion,
    player: { name, gender },
    money: CONFIG.startMoney,
    inventory: { sima_labda: 0, kis_ital: 2 },
    party: [],
    storage: [],
    dex: { seen: {}, caught: {}, shiny: {} },
    flags: {},
    map: 'mancsfalva',
    pos: { x: 6, y: 16, dir: 'down' },
    lastHeal: { map: 'mancsfalva', x: 26, y: 7 },
    defeatedTrainers: [],
    foundItems: [],
    stats: { caught: 0, shinyCaught: 0, battles: 0, wins: 0, steps: 0 },
    playTimeSec: 0,
    createdAt: Date.now(),
    savedAt: null,
  };
}

export const G = { state: null };

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function save() {
  if (!G.state) return false;
  try {
    G.state.savedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(G.state));
    return true;
  } catch (e) { console.warn('Mentés sikertelen', e); return false; }
}

function migrate(s) {
  // Későbbi verzióváltásoknál ide jönnek az átalakítások.
  if (!s.version) s.version = 1;
  s.stats ??= { caught: 0, shinyCaught: 0, battles: 0, wins: 0, steps: 0 };
  s.foundItems ??= [];
  s.defeatedTrainers ??= [];
  for (const m of [...s.party, ...s.storage]) m.stats = calcStats(m);
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    G.state = migrate(JSON.parse(raw));
    return G.state;
  } catch (e) { console.warn('Betöltés sikertelen', e); return null; }
}

export function deleteSave() { try { localStorage.removeItem(KEY); } catch {} }

export function markSeen(species) { G.state.dex.seen[species] = true; }

/** Elkapott Mexi felvétele: csapatba, ha van hely, egyébként a tárolóba. */
export function addCaught(m, where) {
  const s = G.state;
  m.caughtAt = Date.now();
  m.caughtWhere = where;
  m.status = m.status || null;
  s.dex.seen[m.species] = true;
  s.dex.caught[m.species] = true;
  if (m.shiny) { s.dex.shiny[m.species] = true; s.stats.shinyCaught++; }
  s.stats.caught++;
  if (s.party.length < CONFIG.partySize) { s.party.push(m); return 'party'; }
  s.storage.push(m); return 'storage';
}
