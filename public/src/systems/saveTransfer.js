// Mentések átvitele és biztonsági másolatai (új Android app, eszközváltás, vendégmentés).
// Szabály: mentést SOHA nem törlünk úgy, hogy előtte ne készülne róla helyi biztonsági másolat.
import { G, keyFor, GUEST_KEY } from './state.js';
import { apiUrl } from './api.js';
import { Account } from './account.js';

const LB_KEY = 'mexiverse_local_backups';
const MAX_LOCAL = 5;

export function localBackups() { try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; } }
/** Helyi biztonsági másolat a megadott (vagy a jelenlegi) mentésről. */
export function addLocalBackup(reason, raw = null) {
  try {
    raw = raw ?? localStorage.getItem(keyFor()) ?? localStorage.getItem(GUEST_KEY);
    if (!raw) return false;
    const list = localBackups();
    if (list[0]?.data === raw) return true; // ugyanez már megvan
    list.unshift({ at: Date.now(), reason, data: raw });
    while (list.length) {
      try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, MAX_LOCAL))); return true; }
      catch { if (list.length <= 1) return false; list.pop(); } // ha betelt a tárhely, a legrégebbit dobjuk
    }
  } catch { return false; }
  return false;
}
export function summarize(s) {
  if (!s) return '';
  return `${s.player?.name || '?'} • ${(s.party || []).length} Mexi a csapatban • ${Object.keys(s.dex?.caught || {}).length} faj • ${s.money ?? 0} 🪙`;
}
/** Alapvető ellenőrzés: tényleg MexiVerse-mentés-e. */
export function looksLikeSave(s) {
  return s && typeof s === 'object' && Array.isArray(s.party) && Array.isArray(s.storage) && typeof s.money === 'number' && s.player;
}
/** Mentés beírása a helyi tárba (előtte biztonsági másolat a régiről). */
export function writeLocalSave(s, reason = 'import') {
  addLocalBackup('Felülírás előtt (' + reason + ')');
  s.savedAt = Date.now();
  localStorage.setItem(keyFor(), JSON.stringify(s));
  if (Account.loggedIn) Account.pushSave(s, true, true);
}

// ---- átviteli kód (a szerveren 48 óráig) ----
export async function makeTransferCode(state = G.state) {
  const r = await fetch(apiUrl('/api/transfer'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ save: state }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nem sikerült kódot készíteni.');
  return d.code;
}
export async function fetchTransferCode(code) {
  let r;
  try { r = await fetch(apiUrl('/api/transfer/' + encodeURIComponent(code.trim().toUpperCase()))); }
  catch { throw new Error('Nincs internetkapcsolat – a kódos betöltéshez internet kell.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !looksLikeSave(d.save)) throw new Error(d.error || 'Hibás kód.');
  return d.save;
}

// ---- mentés-szöveg (internet nélkül is: vágólap / fájl) ----
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));
export async function saveToText(state = G.state) {
  const json = new TextEncoder().encode(JSON.stringify(state));
  if (window.CompressionStream) {
    const gz = new Uint8Array(await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    return 'MEXI1:' + b64(gz);
  }
  return 'MEXI0:' + b64(json);
}
export async function textToSave(text) {
  const t = String(text || '').trim();
  let s;
  try {
    if (t.startsWith('{')) s = JSON.parse(t);
    else if (t.startsWith('MEXI1:')) s = JSON.parse(await new Response(new Blob([unb64(t.slice(6))]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
    else if (t.startsWith('MEXI0:')) s = JSON.parse(new TextDecoder().decode(unb64(t.slice(6))));
  } catch { /* lent kezeljük */ }
  if (!looksLikeSave(s)) throw new Error('Ez nem MexiVerse-mentés (vagy hiányos a bemásolt szöveg).');
  return s;
}
export function downloadSave(state = G.state) {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mexiverse-mentes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
