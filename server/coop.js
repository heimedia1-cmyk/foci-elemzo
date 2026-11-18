// Közös játék szerver: party-k, egymás látása a térképen, közös 2v2 harc.
// A harc a szerveren fut (CoopBattle), így mindkét játékos ugyanazt látja, és nem lehet csalni vele.
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { CoopBattle, coopLevelCap } from '../public/src/systems/coopBattle.js';
import { createMexi, randInt, rand } from '../public/src/systems/mexi.js';
import { MEXIS } from '../public/src/data/mexis.js';
import { sanitizeCoopParty, sanitizeInventory, sanitizeAction, serverEncounterTable } from './validate.js';
import { verifyToken, readSave } from './auth.js';

const TURN_MS = 45000;
export const RECONNECT_MS = 30000;
const clients = new Map();   // sid (titkos) -> { ws, sid, pid (nyilvános), name, gender, partyCode, pos, busy, user }
const byPid = (pid) => [...clients.values()].find(c => c.pid === pid);
const parties = new Map();   // code -> { code, members: [sid], battle }

const send = (c, msg) => { try { if (c?.ws?.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch {} };
const code5 = () => { let c; do { c = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randInt(0, 31)]).join(''); } while (parties.has(c)); return c; };

function partyState(p) {
  return {
    t: 'party_state', code: p.code,
    members: p.members.map(sid => { const c = clients.get(sid); return { pid: c?.pid, name: c?.name || '?', gender: c?.gender, pos: c?.pos || null, online: !!c?.ws && c.ws.readyState === 1, inBattle: !!p.battle }; }),
  };
}
function broadcast(p, msg) { for (const sid of p.members) send(clients.get(sid), msg); }
function leave(c) {
  const p = parties.get(c.partyCode);
  c.partyCode = null;
  if (!p) return;
  p.members = p.members.filter(s => s !== c.sid);
  if (p.battle) endBattle(p, 'run', 'A társad kilépett a partiból.');
  if (!p.members.length) parties.delete(p.code); else broadcast(p, partyState(p));
}

// Budapesti idő szerinti óra (napszak a vad Mexikhez)
const budapestHour = () => +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Budapest' }).format(new Date());

/** Vendég (nincs felhős mentés) ennél többet nem hozhat a közös harcba. */
const GUEST_INV_CAP = { sima_labda: 10, profi_labda: 3, arany_labda: 0, hos_labda: 0, kis_ital: 3, nagy_ital: 1, ebreszto: 1 };
/** Tárgyak: legfeljebb annyi, amennyi a (szerver által ellenőrzött) felhős mentésben van – eltérés-tűrés nélkül. */
export function safeInv(inv, cloud) {
  const out = sanitizeInventory(inv);
  for (const k of Object.keys(out)) out[k] = Math.min(out[k], cloud ? (cloud.inventory?.[k] || 0) : (GUEST_INV_CAP[k] ?? 0));
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

function startBattle(p, initiator, data) {
  const [aSid, bSid] = [initiator.sid, p.members.find(s => s !== initiator.sid)];
  const A = clients.get(aSid), B = clients.get(bSid);
  // a vad Mexik táblázata és szintje a szerver saját térképadataiból jön (a kliens nem választhat)
  const enc = serverEncounterTable(data.map, data.x | 0, data.y | 0, budapestHour());
  if (!enc) return false;
  const [lmin, lmax] = enc.levels;
  const guestMax = lmax + 8; // vendégnél (nincs felhős mentés) ennél erősebb Mexit nem fogadunk el
  const partyA = sanitizeCoopParty(data.party, A.cloud, guestMax), partyB = sanitizeCoopParty(B.pendingParty, B.cloud, guestMax);
  if (!partyA.some(m => m.hp > 0) || !partyB.some(m => m.hp > 0)) return false;
  const leadA = partyA.find(m => m.hp > 0), leadB = partyB.find(m => m.hp > 0);
  const cap = coopLevelCap(leadA.level, leadB.level, lmax);
  const eff = (Math.min(leadA.level, cap) + Math.min(leadB.level, cap)) / 2;
  const table = enc.table.filter(([sp]) => MEXIS[sp]);
  const pick = () => { const tot = table.reduce((s, [, w]) => s + w, 0); let r = rand() * tot; for (const [sp, w] of table) if ((r -= w) < 0) return sp; return table[0][0]; };
  const foes = [0, 1].map(() => createMexi(pick(), Math.max(lmin, Math.min(100, Math.round(eff) + randInt(1, 2)))));
  p.battle = new CoopBattle({
    players: [{ id: A.pid, name: A.name, party: partyA, inventory: safeInv(data.inventory, A.cloud) }, { id: B.pid, name: B.name, party: partyB, inventory: safeInv(B.pendingInventory, B.cloud) }],
    foes, cap,
  });
  p.battle.bg = ['route', 'route_night', 'village', 'forest', 'forest_night', 'crystal'].includes(data.bg) ? data.bg : 'route';
  A.busy = B.busy = true;
  broadcast(p, { t: 'coop_begin', state: p.battle.snapshot(), bg: p.battle.bg, you: null });
  armTimer(p);
  return true;
}

function armTimer(p) {
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    if (!p.battle || p.battle.over) return;
    try { afterEvents(p, p.battle.forceResolve()); } catch (e) { console.error('coop időtúllépés-hiba', e?.message); endBattle(p, 'run', 'Hiba történt, a harc véget ért.'); }
  }, TURN_MS);
}

function afterEvents(p, ev) {
  broadcast(p, { t: 'coop_events', events: ev, state: p.battle.snapshot() });
  if (p.battle.over) endBattle(p);
  else { armTimer(p); broadcast(p, { t: 'coop_wait', waiting: p.battle.waitingFor() }); }
}

function endBattle(p, forced = null, note = null) {
  clearTimeout(p.timer);
  const b = p.battle; if (!b) return;
  if (forced && !b.over) b.finish([], forced);
  for (const sid of p.members) {
    const c = clients.get(sid);
    if (!c) continue;
    c.busy = false;
    const msg = { t: 'coop_end', note, ...b.resultFor(c.pid) };
    if (c.ws?.readyState === 1) send(c, msg); else c.pendingEnd = msg; // újracsatlakozáskor megkapja
    clearTimeout(c.dropTimer);
  }
  p.battle = null;
}

export function attachCoop(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
  wss.on('connection', (ws) => {
    let c = null; let bucket = 40, last = Date.now();
    ws.on('message', async (raw) => {
      // egyszerű sebességkorlát: kb. 20 üzenet/mp, löketben 40
      const now = Date.now(); bucket = Math.min(40, bucket + (now - last) / 50); last = now;
      if (bucket < 1) return; bucket--;
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      try { await handle(msg); } catch (e) { console.error('coop üzenethiba', msg?.t, e?.message); }
    });
    async function handle(msg) {
      if (msg.t === 'hello') {
        // a sid titkos (csak a saját eszköz ismeri); másoknak csak a nyilvános pid látszik
        const sid = /^[a-f0-9]{32}$/.test(msg.sid || '') ? msg.sid : crypto.randomBytes(16).toString('hex');
        c = clients.get(sid) || { sid, pid: crypto.randomBytes(6).toString('hex') };
        if (c.ws && c.ws !== ws) { try { c.ws.close(); } catch {} }
        const user = await verifyToken(msg.token);
        if (c.user && user && c.user !== user) { c = { sid: crypto.randomBytes(16).toString('hex'), pid: crypto.randomBytes(6).toString('hex') }; }
        Object.assign(c, { ws, user: user || null, name: String(user || msg.name || 'Kalandor').slice(0, 16), gender: msg.gender === 'lany' ? 'lany' : 'fiu' });
        c.cloud = user ? readSave(user) : null;
        clients.set(c.sid, c);
        send(c, { t: 'welcome', sid: c.sid, pid: c.pid });
        clearTimeout(c.dropTimer); c.dropTimer = null;
        if (c.pendingEnd) { send(c, c.pendingEnd); c.pendingEnd = null; }
        const pp = parties.get(c.partyCode);
        if (pp?.battle && !pp.battle.over) { // újracsatlakozás harc közben: aktuális állapot
          send(c, { t: 'coop_resync', state: pp.battle.snapshot(), waiting: pp.battle.waitingFor() });
          for (const sid of pp.members) if (sid !== c.sid) send(clients.get(sid), { t: 'toast', text: `${c.name} visszacsatlakozott.` });
        }
        const p = parties.get(c.partyCode);
        if (p) broadcast(p, partyState(p)); else c.partyCode = null;
        return;
      }
      if (!c) return;
      const p = parties.get(c.partyCode);
      switch (msg.t) {
        case 'party_create': {
          if (p) leave(c);
          const np = { code: code5(), members: [c.sid], battle: null };
          parties.set(np.code, np); c.partyCode = np.code;
          send(c, partyState(np)); break;
        }
        case 'party_join': {
          const target = parties.get(String(msg.code || '').toUpperCase().trim());
          if (!target) { send(c, { t: 'error', text: 'Nincs ilyen party-kód.' }); break; }
          if (target.members.length >= 2 && !target.members.includes(c.sid)) { send(c, { t: 'error', text: 'Ez a party már tele van (2 fő).' }); break; }
          if (p && p !== target) leave(c);
          if (!target.members.includes(c.sid)) target.members.push(c.sid);
          c.partyCode = target.code;
          broadcast(target, partyState(target));
          broadcast(target, { t: 'toast', text: `${c.name} csatlakozott a partihoz!` });
          break;
        }
        case 'party_leave': if (p) leave(c); send(c, { t: 'party_state', code: null, members: [] }); break;
        case 'pos': {
          c.pos = { map: String(msg.map).slice(0, 30), x: msg.x | 0, y: msg.y | 0, dir: ['up', 'down', 'left', 'right'].includes(msg.dir) ? msg.dir : 'down', lead: typeof msg.lead === 'object' && msg.lead && MEXIS[msg.lead.species] ? { species: msg.lead.species, shiny: !!msg.lead.shiny } : null };
          if (p) for (const sid of p.members) if (sid !== c.sid) send(clients.get(sid), { t: 'partner_pos', pid: c.pid, name: c.name, gender: c.gender, pos: c.pos });
          break;
        }
        case 'coop_encounter': {
          // a kezdeményező a magas fűbe lépett; megkérdezzük a társát, ráér-e
          if (!p || p.battle || p.members.length < 2) { send(c, { t: 'coop_declined' }); break; }
          const other = clients.get(p.members.find(s => s !== c.sid));
          if (!other?.ws || other.ws.readyState !== 1 || other.busy) { send(c, { t: 'coop_declined' }); break; }
          p.pendingEncounter = { from: c.sid, data: msg, at: Date.now() };
          send(other, { t: 'coop_request', from: c.name, map: msg.map });
          // ha a társ 4 mp-en belül nem válaszol, a kezdeményező egyedül harcol
          clearTimeout(p.reqTimer);
          p.reqTimer = setTimeout(() => { if (p.pendingEncounter?.from === c.sid) { p.pendingEncounter = null; send(c, { t: 'coop_declined' }); } }, 4000);
          break;
        }
        case 'coop_party': {
          // a társ válasza: a csapata, vagy elutasítás (pl. menüben van)
          if (!p?.pendingEncounter) break;
          clearTimeout(p.reqTimer);
          const init = clients.get(p.pendingEncounter.from); const data = p.pendingEncounter.data; p.pendingEncounter = null;
          if (!msg.ok) { send(init, { t: 'coop_declined' }); break; }
          c.pendingParty = msg.party; c.pendingInventory = msg.inventory;
          if (init?.user) init.cloud = readSave(init.user); if (c.user) c.cloud = readSave(c.user); // friss felhős mentés
          if (!startBattle(p, init, data)) send(init, { t: 'coop_declined' });
          break;
        }
        case 'coop_action': {
          if (!p?.battle) break;
          if (Number.isInteger(msg.turn) && msg.turn !== p.battle.turn) break; // elavult (pl. kapcsolatszakadás alatt küldött) lépés
          const act = sanitizeAction(p.battle, c.pid, msg.action);
          if (!act) { send(c, { t: 'error', text: 'Érvénytelen lépés.' }); break; }
          let ev;
          try { ev = p.battle.submit(c.pid, act); }
          catch (e) { console.error('coop harchiba', e?.message); endBattle(p, 'run', 'Hiba történt, a harc véget ért.'); break; }
          if (ev) afterEvents(p, ev);
          else broadcast(p, { t: 'coop_wait', waiting: p.battle.waitingFor() });
          break;
        }
      }
    }
    ws.on('close', () => {
      if (!c || c.ws !== ws) return; // egy régi, már lecserélt kapcsolat zárult le – az új munkamenetet nem érinti
      const p = parties.get(c.partyCode);
      if (p) {
        if (p.battle) {
          // 30 mp türelmi idő: ha visszajön, folytatódik a harc; ha nem, lezárjuk
          for (const sid of p.members) if (sid !== c.sid) send(clients.get(sid), { t: 'toast', text: `${c.name} kapcsolata megszakadt – várunk rá (30 mp)...` });
          clearTimeout(c.dropTimer);
          c.dropTimer = setTimeout(() => { if (c.ws === ws && p.battle) endBattle(p, 'run', 'A társad kapcsolata megszakadt.'); }, RECONNECT_MS);
        }
        broadcast(p, partyState(p));
      }
      // 10 perc után végleg kilép a partiból, ha nem tér vissza
      setTimeout(() => { if (c.ws === ws && c.partyCode) leave(c); }, 600000);
    });
  });
  return wss;
}
