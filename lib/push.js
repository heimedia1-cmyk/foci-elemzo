// Telefonos értesítések (Web Push): élő lehetőségek a beállított feltételek szerint
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '.data'));
const KEYS = path.join(DIR, 'vapid.json'), SUBS = path.join(DIR, 'push.json');
fs.mkdirSync(DIR, { recursive: true });

let keys;
try { keys = JSON.parse(fs.readFileSync(KEYS, 'utf8')); } catch (e) { keys = webpush.generateVAPIDKeys(); fs.writeFileSync(KEYS, JSON.stringify(keys)); }
webpush.setVapidDetails('mailto:foci-elemzo@example.com', keys.publicKey, keys.privateKey);

const load = () => { try { return JSON.parse(fs.readFileSync(SUBS, 'utf8')); } catch (e) { return []; } };
const save = s => fs.writeFileSync(SUBS, JSON.stringify(s));

function subscribe(sub, prefs) {
  if (!sub || !sub.endpoint) throw new Error('Hibás feliratkozás.');
  const subs = load().filter(x => x.sub.endpoint !== sub.endpoint);
  subs.push({ sub, prefs: { minP: Math.min(0.9, Math.max(0.3, +prefs.minP || 0.55)), minOdds: Math.min(5, Math.max(1.1, +prefs.minOdds || 1.5)), types: Array.isArray(prefs.types) && prefs.types.length ? prefs.types : ['ht', 'more', 'team'], onlyHot: !!prefs.onlyHot }, sent: {} });
  save(subs);
}
function unsubscribe(endpoint) { save(load().filter(x => x.sub.endpoint !== endpoint)); }
function count() { return load().length; }

async function send(s, payload) {
  try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 300 }); return true; }
  catch (e) { if (e.statusCode === 404 || e.statusCode === 410) return 'gone'; return false; }
}

async function test(endpoint) {
  const s = load().find(x => x.sub.endpoint === endpoint);
  if (!s) throw new Error('Nincs feliratkozás ezen az eszközön.');
  return send(s, { title: '⚽ Foci Elemző', body: 'Az értesítések működnek! Szólok, ha élő lehetőség jön.', url: '/?tab=L' });
}

// opps: live.opportunities(...) minden típusra, tág sávval; itt szűrünk feliratkozónként
async function notify(opps) {
  const subs = load(); if (!subs.length) return 0;
  let n = 0; const now = Date.now(); const keep = [];
  for (const s of subs) {
    const p = s.prefs;
    const mine = opps.filter(o => o.p >= p.minP && o.fair >= p.minOdds && p.types.includes(o.type) && (!p.onlyHot || o.hot));
    let gone = false;
    for (const o of mine.slice(0, 3)) {
      const key = `${o.id}|${o.label}`;
      if (s.sent[key] && now - s.sent[key] < 20 * 60 * 1000) continue;
      const r = await send(s, { title: `${o.hot ? '🔥 ' : '⚡ '}${o.match} ${o.score} (${o.clock})`, body: `${o.label}: ${Math.round(o.p * 100)}% · korrekt szorzó ${o.fair.toFixed(2)} · TippmixPro-n legalább ${o.need.toFixed(2)}-nél éri meg${o.stats ? ' · ' + o.stats : ''}`, url: '/?tab=L', tag: key });
      if (r === 'gone') { gone = true; break; }
      if (r) { s.sent[key] = now; n++; }
    }
    for (const k of Object.keys(s.sent)) if (now - s.sent[k] > 3 * 3600 * 1000) delete s.sent[k];
    if (!gone) keep.push(s);
  }
  save(keep);
  return n;
}

module.exports = { publicKey: () => keys.publicKey, subscribe, unsubscribe, notify, test, count };
