// Offline üzenetsor és újracsatlakozás
globalThis.window = { MEXI_PREVIEW: true, addEventListener() {}, dispatchEvent() {} }; globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.document = { addEventListener() {}, createElement: () => ({}) };
const { enqueueOffline, MAX_QUEUE } = await import('../public/src/systems/net.js');
const ok = (c, m) => { if (!c) throw new Error(m); };
let q = [];
for (let i = 0; i < 500; i++) q = enqueueOffline(q, { t: 'pos', x: i });
ok(q.length === 1 && q[0].x === 499, 'a pozíciók nem vonódnak össze');
q = enqueueOffline(q, { t: 'coop_action', action: {} });
ok(!q.some(m => m.t === 'coop_action'), 'elavult harci lépés a sorban maradt');
for (let i = 0; i < 100; i++) q = enqueueOffline(q, { t: 'party_join', code: 'X' + i });
ok(q.length <= MAX_QUEUE && q.filter(m => m.t === 'party_join').length === 1, 'korlátlan sor');
console.log('✓ offline üzenetsor: összevont pozíció, eldobott elavult harci lépések, max ' + MAX_QUEUE + ' üzenet');
