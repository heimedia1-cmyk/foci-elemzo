// Játékállapot + SaveManager (verziózott helyi mentés).
import { CONFIG } from '../data/config.js';
import { calcStats } from './mexi.js';
import { Account } from './account.js';

// Vendég: egy helyi mentés. Belépve: a fiókhoz tartozó helyi másolat + felhős mentés.
const keyFor = () => Account.loggedIn ? 'mexiverse_save_u_' + Account.current.username.toLowerCase() : 'mexiverse_save';
export const GUEST_KEY = 'mexiverse_save';

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
    pos: { x: 6, y: 20, dir: 'down' },
    lastHeal: { map: 'int_heal', x: 5, y: 3 },
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
  try { return !!localStorage.getItem(keyFor()); } catch { return false; }
}

export function save() {
  if (!G.state) return false;
  try {
    G.state.savedAt = Date.now();
    localStorage.setItem(keyFor(), JSON.stringify(G.state));
    Account.pushSave(G.state);
    return true;
  } catch (e) { console.warn('Mentés sikertelen', e); return false; }
}

function migrate(s) {
  // Későbbi verzióváltásoknál ide jönnek az átalakítások.
  if (!s.version) s.version = 1;
  s.stats ??= { caught: 0, shinyCaught: 0, battles: 0, wins: 0, steps: 0 };
  s.foundItems ??= [];
  s.defeatedTrainers ??= [];
  if (!s.lastHeal || s.lastHeal.map === 'mancsfalva') s.lastHeal = { map: 'int_heal', x: 5, y: 3 };
  for (const m of [...s.party, ...s.storage]) m.stats = calcStats(m);
  return s;
}

export function load() {
  try {
    const raw = localStorage.getItem(keyFor());
    if (!raw) return null;
    G.state = migrate(JSON.parse(raw));
    return G.state;
  } catch (e) { console.warn('Betöltés sikertelen', e); return null; }
}

export function deleteSave() { try { localStorage.removeItem(keyFor()); } catch {} }

/** Belépés után: a felhős és a helyi mentés közül az újabb marad. Visszaadja: 'cloud' | 'local' | 'none' | 'offline'. */
export async function syncFromCloud() {
  if (!Account.loggedIn) return 'none';
  const cloud = await Account.fetchSave();
  if (cloud === 'auth') { Account.current = null; return 'auth'; }
  if (cloud === 'offline') return 'offline';
  let local = null; try { local = JSON.parse(localStorage.getItem(keyFor()) || 'null'); } catch {}
  if (cloud && (!local || (cloud.savedAt || 0) >= (local.savedAt || 0))) { localStorage.setItem(keyFor(), JSON.stringify(cloud)); return 'cloud'; }
  if (local) { Account.pushSave(local, true); return 'local'; }
  return 'none';
}

/** A vendégként elkezdett játék áthozása a fiókba. */
export function adoptGuestSave() {
  const raw = localStorage.getItem(GUEST_KEY);
  if (!raw) return false;
  localStorage.setItem(keyFor(), raw);
  Account.pushSave(JSON.parse(raw), true);
  return true;
}
export function guestSaveExists() { try { return !!localStorage.getItem(GUEST_KEY); } catch { return false; } }

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
