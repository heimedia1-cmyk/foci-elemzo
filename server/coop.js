// Közös játék szerver: party-k, egymás látása a térképen, közös 2v2 harc.
// A harc a szerveren fut (CoopBattle), így mindkét játékos ugyanazt látja, és nem lehet csalni vele.
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { CoopBattle, coopLevelCap } from '../public/src/systems/coopBattle.js';
import { createMexi, randInt, rand } from '../public/src/systems/mexi.js';
import { MEXIS } from '../public/src/data/mexis.js';

const TURN_MS = 45000;
const clients = new Map();   // sid -> { ws, sid, name, gender, partyCode, pos, busy }
const parties = new Map();   // code -> { code, members: [sid], battle }

const send = (c, msg) => { try { if (c?.ws?.readyState === 1) c.ws.send(JSON.stringify(msg)); } catch {} };
const code5 = () => { let c; do { c = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randInt(0, 31)]).join(''); } while (parties.has(c)); return c; };

function partyState(p) {
  return {
    t: 'party_state', code: p.code,
    members: p.members.map(sid => { const c = clients.get(sid); return { sid, name: c?.name || '?', gender: c?.gender, pos: c?.pos || null, online: !!c?.ws && c.ws.readyState === 1, inBattle: !!p.battle }; }),
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

// ---- Mexi-adatok ellenőrzése (ne lehessen kliensből lehetetlen Mexit küldeni) ----
function sanitizeParty(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 6).filter(m => m && MEXIS[m.species] && Number.isInteger(m.level) && m.level >= 1 && m.level <= 100 && m.stats && m.moves?.length)
    .map(m => ({ ...m, hp: Math.max(0, Math.min(m.hp, m.stats.hp)) }));
}

function startBattle(p, initiator, data) {
  const [aSid, bSid] = [initiator.sid, p.members.find(s => s !== initiator.sid)];
  const A = clients.get(aSid), B = clients.get(bSid);
  const partyA = sanitizeParty(data.party), partyB = sanitizeParty(B.pendingParty);
  if (!partyA.some(m => m.hp > 0) || !partyB.some(m => m.hp > 0)) return false;
  const leadA = partyA.find(m => m.hp > 0), leadB = partyB.find(m => m.hp > 0);
  const [lmin, lmax] = Array.isArray(data.levels) ? data.levels : [2, 5];
  const cap = coopLevelCap(leadA.level, leadB.level, lmax);
  const eff = (Math.min(leadA.level, cap) + Math.min(leadB.level, cap)) / 2;
  // vad Mexik: a táblázatból, a csapat szintjénél 1–2-vel erősebbek (de legalább a terület szintje)
  const table = Array.isArray(data.table) && data.table.length ? data.table.filter(([sp]) => MEXIS[sp]) : [['alap', 1]];
  const pick = () => { const tot = table.reduce((s, [, w]) => s + w, 0); let r = rand() * tot; for (const [sp, w] of table) if ((r -= w) < 0) return sp; return table[0][0]; };
  const foes = [0, 1].map(() => createMexi(pick(), Math.max(lmin, Math.min(100, Math.round(eff) + randInt(1, 2)))));
  p.battle = new CoopBattle({
    players: [{ id: aSid, name: A.name, party: partyA, inventory: data.inventory || {} }, { id: bSid, name: B.name, party: partyB, inventory: B.pendingInventory || {} }],
    foes, cap,
  });
  p.battle.bg = data.bg || 'route';
  A.busy = B.busy = true;
  broadcast(p, { t: 'coop_begin', state: p.battle.snapshot(), bg: p.battle.bg, you: null });
  armTimer(p);
  return true;
}

function armTimer(p) {
  clearTimeout(p.timer);
  p.timer = setTimeout(() => {
    if (!p.battle || p.battle.over) return;
    const ev = p.battle.forceResolve();
    afterEvents(p, ev);
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
    if (c) { c.busy = false; send(c, { t: 'coop_end', note, ...b.resultFor(sid) }); }
  }
  p.battle = null;
}

export function attachCoop(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    let c = null;
    ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.t === 'hello') {
        const sid = /^[a-f0-9]{24}$/.test(msg.sid || '') ? msg.sid : crypto.randomBytes(12).toString('hex');
        c = clients.get(sid) || { sid };
        if (c.ws && c.ws !== ws) { try { c.ws.close(); } catch {} }
        Object.assign(c, { ws, name: String(msg.name || 'Kalandor').slice(0, 16), gender: msg.gender === 'lany' ? 'lany' : 'fiu' });
        clients.set(sid, c);
        send(c, { t: 'welcome', sid });
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
          c.pos = { map: String(msg.map), x: msg.x | 0, y: msg.y | 0, dir: msg.dir, lead: msg.lead || null };
          if (p) for (const sid of p.members) if (sid !== c.sid) send(clients.get(sid), { t: 'partner_pos', sid: c.sid, name: c.name, gender: c.gender, pos: c.pos });
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
          if (!startBattle(p, init, data)) send(init, { t: 'coop_declined' });
          break;
        }
        case 'coop_action': {
          if (!p?.battle) break;
          const ev = p.battle.submit(c.sid, msg.action);
          if (ev) afterEvents(p, ev);
          else broadcast(p, { t: 'coop_wait', waiting: p.battle.waitingFor() });
          break;
        }
      }
    });
    ws.on('close', () => {
      if (!c) return;
      const p = parties.get(c.partyCode);
      if (p) {
        if (p.battle) endBattle(p, 'run', 'A társad kapcsolata megszakadt.');
        broadcast(p, partyState(p));
      }
      // 10 perc után végleg kilép a partiból, ha nem tér vissza
      setTimeout(() => { if (c.ws === ws && c.partyCode) leave(c); }, 600000);
    });
  });
  return wss;
}
