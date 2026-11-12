// Élő tanulás: minden élő lehetőség archiválása (perc, állás, statok, esély), a meccs végén
// automatikus kiértékelés az ESPN végeredményéből, majd kategóriánkénti kalibráció és szűrés.
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '.data')), 'elo');
const MBANDS = [[0, 15], [15, 30], [30, 46], [46, 60], [60, 75], [75, 999]];
const MNAMES = ['0–15', '15–30', '30–45', '46–60', '60–75', '75+'];
const PBANDS = [[0, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
const MIN_CAL = 60, PRIOR = 150, MIN_FILTER = 40;

const mband = (min, ht) => ht ? 3 : MBANDS.findIndex(([a, b]) => min >= a && min < b);
const pband = p => PBANDS.findIndex(([a, b]) => p >= a && p < b);
const file = d => path.join(DIR, `${d}.json`);
const read = d => { try { return JSON.parse(fs.readFileSync(file(d), 'utf8')); } catch (e) { return { recs: [], events: {} }; } };
const write = (d, db) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(d) + '.tmp', JSON.stringify(db)); fs.renameSync(file(d) + '.tmp', file(d)); };
const today = () => new Date().toISOString().slice(0, 10);

// opp -> gépi leírás a kiértékeléshez
function spec(o, e) {
  const cur = e.hs + e.as;
  if (o.type === 'ht') return { k: 'ht' };
  if (o.type === 'more') return { k: 'tot', gt: cur };
  if (o.type === 'line') return { k: 'tot', gt: cur + 1 };
  if (o.type === 'btts') return { k: 'btts' };
  if (o.type === 'win') return { k: 'res', r: o.label === 'Döntetlen' ? 'D' : o.label.startsWith(e.home) ? 'H' : 'A' };
  if (o.label.startsWith('Következő gól')) return { k: 'next', t: o.label.endsWith(e.home) ? 'h' : 'a', n: cur };
  return { k: 'team', t: o.label.startsWith(e.home) ? 'h' : 'a', gt: o.label.startsWith(e.home) ? e.hs : e.as };
}

// 10 perces sávonként egyszer mentünk egy-egy lehetőséget (ne legyen túl sok, korrelált minta)
function record(list, opps) {
  const d = today(), db = read(d), seen = new Set(db.recs.map(r => `${r.id}|${r.label}|${r.slot}`));
  let n = 0;
  for (const o of opps) {
    const e = list.find(x => x.id === o.id); if (!e) continue;
    const slot = e.halftime ? 'HT' : `${e.period}-${Math.floor(e.minute / 10)}`;
    const key = `${o.id}|${o.label}|${slot}`;
    if (seen.has(key)) continue;
    seen.add(key); n++;
    db.recs.push({ id: o.id, date: e.date, label: o.label, type: o.type, slot, minute: e.minute, ht: !!e.halftime, period: e.period, hs: e.hs, as: e.as,
      p: +o.pRaw.toFixed(4), p0: +(o.p - o.boost).toFixed(4), hot: o.hot, stats: !!e.stats, src: e.pre.src, spec: spec(o, e), won: null });
    db.events[o.id] = db.events[o.id] || { home: e.home, away: e.away, done: false };
  }
  if (n) write(d, db);
  return n;
}

function outcome(s, fin) {
  const { hs, as, goals } = fin, tot = hs + as;
  if (s.k === 'ht') return goals.some(g => g.half === 1);
  if (s.k === 'tot') return tot > s.gt;
  if (s.k === 'btts') return hs > 0 && as > 0;
  if (s.k === 'res') return (hs > as ? 'H' : hs === as ? 'D' : 'A') === s.r;
  if (s.k === 'team') return (s.t === 'h' ? hs : as) > s.gt;
  if (s.k === 'next') { const g = goals[s.n]; return g ? g.team === s.t : false; }
  return null;
}

// befejezett meccsek kiértékelése az ESPN scoreboard alapján
function settle(events) {
  if (!fs.existsSync(DIR)) return 0;
  const fin = new Map(events.filter(e => e.state === 'post').map(e => [e.id, e]));
  let n = 0;
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json')).slice(-4)) {
    const d = f.slice(0, 10), db = read(d); let ch = false;
    for (const [id, ev] of Object.entries(db.events)) {
      if (ev.done || !fin.has(id)) continue;
      const e = fin.get(id);
      const goals = (e.goalsFull || []).slice().sort((a, b) => a.t - b.t);
      if (goals.length !== e.hs + e.as) continue; // hiányos gól-lista: nem értékeljük (pontatlan lenne)
      const fr = { hs: e.hs, as: e.as, goals };
      for (const r of db.recs) if (r.id === id && r.won == null) { r.won = outcome(r.spec, fr); n++; }
      ev.done = true; ev.final = `${e.hs}-${e.as}`; ch = true;
    }
    if (ch) write(d, db);
  }
  if (n) rebuild(true);
  return n;
}

let T = null, Tt = 0; // tanult táblák
const KEEP_DAYS = 120, USE_DAYS = 90;
function cleanup() {
  if (!fs.existsSync(DIR)) return;
  const lim = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  for (const f of fs.readdirSync(DIR)) if (f.endsWith('.json') && f.slice(0, 10) < lim) fs.unlinkSync(path.join(DIR, f));
}
function rebuild(force) {
  if (T && !force && Date.now() - Tt < 10 * 60 * 1000) return T;
  Tt = Date.now(); cleanup();
  const from = new Date(Date.now() - USE_DAYS * 86400000).toISOString().slice(0, 10);
  const cal = {}, mt = {}; let total = 0, settled = 0;
  if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json') && x.slice(0, 10) >= from)) {
    for (const r of read(f.slice(0, 10)).recs) {
      total++; if (r.won == null) continue; settled++;
      const pb = pband(r.p), mb = mband(r.minute, r.ht);
      const c = (cal[r.type] = cal[r.type] || PBANDS.map(() => ({ n: 0, sp: 0, w: 0 })))[pb]; c.n++; c.sp += r.p; if (r.won) c.w++;
      const m = (mt[r.type] = mt[r.type] || MBANDS.map(() => ({ n: 0, sp: 0, w: 0, hot: { n: 0, sp: 0, w: 0 } })))[mb]; m.n++; m.sp += r.p; if (r.won) m.w++;
      if (r.hot) { m.hot.n++; m.hot.sp += r.p; if (r.won) m.hot.w++; }
    }
  }
  T = { cal, mt, total, settled };
  return T;
}

// kalibrált esély (ha van elég adat az adott fajta + esélysávban)
function adjust(type, p) {
  if (!T) rebuild();
  const c = T.cal[type] && T.cal[type][pband(p)];
  if (!c || c.n < MIN_CAL) return p;
  const w = c.n / (c.n + PRIOR);
  return Math.min(0.97, Math.max(0.02, p + w * (c.w / c.n - c.sp / c.n)));
}
// percsáv megítélése: 'jó' / 'gyenge' / null (kevés adat)
function verdict(type, minute, ht) {
  if (!T) rebuild();
  const m = T.mt[type] && T.mt[type][mband(minute, ht)];
  if (!m || m.n < MIN_FILTER) return null;
  const diff = m.w / m.n - m.sp / m.n;
  return diff <= -0.05 ? 'gyenge' : diff >= -0.01 ? 'jó' : null;
}

function stats() {
  const t = rebuild(true);
  return {
    total: t.total, settled: t.settled, minutes: MNAMES, minFilter: MIN_FILTER, minCal: MIN_CAL,
    rows: Object.entries(t.mt).map(([type, ms]) => ({ type, cells: ms.map(m => ({ n: m.n, pred: m.n ? m.sp / m.n : 0, hit: m.n ? m.w / m.n : 0, hotN: m.hot.n, hotHit: m.hot.n ? m.hot.w / m.hot.n : 0 })) })),
  };
}

module.exports = { record, settle, adjust, verdict, stats, rebuild, outcome, spec };
