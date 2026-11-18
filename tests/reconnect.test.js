// Közös harc: újracsatlakozás nem szakítja meg a harcot, régi kapcsolat zárása nem zár le új munkamenetet
import http from 'node:http';
import WebSocket from 'ws';
import { attachCoop } from '../server/coop.js';
import { MAPS } from '../public/src/data/maps.js';
import { createMexi } from '../public/src/systems/mexi.js';
const ok = (c, m) => { if (!c) throw new Error(m); };
const srv = http.createServer(); attachCoop(srv); await new Promise(r => srv.listen(0, r));
const url = `ws://127.0.0.1:${srv.address().port}/ws`;
function client(sid) {
  const ws = new WebSocket(url); const inbox = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d)));
  const until = async (t, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const i = inbox.findIndex(m => m.t === t); if (i >= 0) return inbox.splice(i, 1)[0]; await new Promise(r => setTimeout(r, 20)); } return null; };
  return { ws, inbox, until, open: new Promise(r => ws.on('open', r)), send: (m) => ws.send(JSON.stringify(m)), hello: () => ws.send(JSON.stringify({ t: 'hello', sid, name: 'T' })) };
}
let grass; MAPS.osveny.tiles.forEach((r, y) => r.forEach((ch, x) => { if (!grass && ch === '"') grass = { x, y }; }));
const party = [createMexi('alap', 6), createMexi('beka', 6)];
const A = client(null); await A.open; A.hello(); const wa = await A.until('welcome');
const B = client(null); await B.open; B.hello(); await B.until('welcome');
A.send({ t: 'party_create' }); const ps = await A.until('party_state');
B.send({ t: 'party_join', code: ps.code }); await B.until('party_state');
A.send({ t: 'coop_encounter', map: 'osveny', x: grass.x, y: grass.y, party, inventory: { sima_labda: 3 } });
ok(await B.until('coop_request'), 'nincs harckérés');
B.send({ t: 'coop_party', ok: true, party, inventory: {} });
const begin = await A.until('coop_begin'); ok(begin, 'nem indult a harc');
// 1) A új kapcsolattal jelentkezik (régi még nyitva) → a régi lezárása nem zárhatja le a harcot
const A2 = client(wa.sid); await A2.open; A2.hello(); await A2.until('welcome');
ok(await A2.until('coop_resync'), 'nincs újraszinkronizálás');
await new Promise(r => setTimeout(r, 300));
ok(!B.inbox.some(m => m.t === 'coop_end'), 'a régi kapcsolat zárása lezárta az új munkamenet harcát');
// 2) A2 megszakad, majd a türelmi időn belül visszajön → a harc folytatódik
A2.ws.terminate(); await new Promise(r => setTimeout(r, 200));
ok(!B.inbox.some(m => m.t === 'coop_end'), 'kapcsolatszakadáskor azonnal véget ért a harc');
const A3 = client(wa.sid); await A3.open; A3.hello(); await A3.until('welcome');
const rs = await A3.until('coop_resync'); ok(rs && rs.state.turn === 0, 'visszatéréskor nincs harci állapot');
// 3) elavult körszámú lépést a szerver figyelmen kívül hagy, a jót elfogadja
A3.send({ t: 'coop_action', action: { type: 'move', index: 0, target: 0 }, turn: 99 });
await new Promise(r => setTimeout(r, 200)); ok(!B.inbox.some(m => m.t === 'coop_wait'), 'elavult lépést elfogadott');
A3.send({ t: 'coop_action', action: { type: 'move', index: 0, target: 0 }, turn: 0 });
ok(await B.until('coop_wait'), 'érvényes lépés nem ment át');
console.log('✓ közös harc újracsatlakozás: régi kapcsolat nem zár le, türelmi idő, újraszinkron, elavult lépés kiszűrve');
for (const c of [A, B, A3]) c.ws.terminate(); srv.close(); process.exit(0);
