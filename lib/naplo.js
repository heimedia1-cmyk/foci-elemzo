// Tippnapló: megjátszott szelvények mentése, automatikus kiértékelés, statisztika
const fs = require('fs');
const path = require('path');
const data = require('./data');
const national = require('./national');
const { predicate } = require('./tmmarkets');

const DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '.data'));
const FILE = path.join(DIR, 'naplo.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { slips: [] }; }
}
function save(db) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}

function addSlip({ legs, stake, note }) {
  if (!Array.isArray(legs) || !legs.length || legs.length > 20) throw new Error('Hibás szelvény.');
  const db = load();
  const slip = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    created: new Date().toISOString(), stake: Math.max(0, +stake || 0), note: String(note || '').slice(0, 200),
    legs: legs.map(l => ({
      num: String(l.num), name: String(l.name).slice(0, 120), market: String(l.market || '1X2').slice(0, 120),
      label: String(l.label || '').slice(0, 120), pick: String(l.pick).slice(0, 40), odds: +l.odds, p: +l.p,
      date: l.date, time: l.time, league: String(l.league || '').slice(0, 120), ref: l.ref || null, status: 'függő', score: null,
    })),
  };
  slip.odds = slip.legs.reduce((x, l) => x * l.odds, 1);
  slip.p = slip.legs.reduce((x, l) => x * (l.p || 0), 1);
  db.slips.unshift(slip);
  save(db);
  return slip;
}

function removeSlip(id) { const db = load(); db.slips = db.slips.filter(s => s.id !== id); save(db); }

function setLeg(id, idx, status) {
  if (!['nyert', 'vesztett', 'függő', 'törölt'].includes(status)) throw new Error('Hibás állapot.');
  const db = load();
  const s = db.slips.find(x => x.id === id);
  if (!s || !s.legs[idx]) throw new Error('Nincs ilyen tipp.');
  s.legs[idx].status = status; s.legs[idx].manual = true;
  finalize(s); save(db);
}

function legWon(leg, hg, ag) {
  const [hn, an] = leg.name.split(' - ');
  if (leg.market === '1X2') return leg.pick === (hg > ag ? '1' : hg === ag ? 'X' : '2');
  const pr = predicate(leg.market, leg.label, leg.pick, hn || '', an || '');
  return pr ? pr.f(hg, ag) : null;
}

function finalize(s) {
  const st = s.legs.map(l => l.status);
  if (st.includes('vesztett')) s.status = 'vesztett';
  else if (st.every(x => x === 'nyert' || x === 'törölt')) s.status = 'nyert';
  else s.status = 'függő';
  const odds = s.legs.filter(l => l.status !== 'törölt').reduce((x, l) => x * l.odds, 1);
  s.payout = s.status === 'nyert' ? Math.round(s.stake * odds) : 0;
}

async function findResult(leg) {
  const r = leg.ref;
  if (!r) return null;
  if (r.kind === 'club') {
    const ms = await data.leagueMatches(r.league, r.date);
    const m = ms.find(x => x.played && x.home === r.home && x.away === r.away && Math.abs(Date.parse(x.date) - Date.parse(r.date)) <= 2 * 86400000);
    return m ? [m.hg, m.ag] : null;
  }
  if (r.kind === 'nat') {
    const rows = await national.load();
    const m = rows.find(x => x.home === r.home && x.away === r.away && Math.abs(Date.parse(x.date) - Date.parse(r.date)) <= 2 * 86400000);
    return m ? [m.hg, m.ag] : null;
  }
  return null;
}

async function settle() {
  const db = load();
  let changed = false;
  for (const s of db.slips) {
    for (const l of s.legs) {
      if (l.status !== 'függő' || l.manual) continue;
      if (Date.parse(`${l.date}T23:59:00Z`) > Date.now()) continue;
      const res = await findResult(l).catch(() => null);
      if (!res) continue;
      const won = legWon(l, res[0], res[1]);
      if (won === null) continue;
      l.status = won ? 'nyert' : 'vesztett'; l.score = `${res[0]}-${res[1]}`; changed = true;
    }
    const before = s.status; finalize(s); if (s.status !== before) changed = true;
  }
  if (changed) save(db);
  return db;
}

function stats(db) {
  const done = db.slips.filter(s => s.status !== 'függő');
  const staked = done.reduce((x, s) => x + s.stake, 0), ret = done.reduce((x, s) => x + (s.payout || 0), 0);
  const legs = db.slips.flatMap(s => s.legs).filter(l => l.status === 'nyert' || l.status === 'vesztett');
  const byMarket = {};
  for (const l of legs) {
    const k = l.market === '1X2' ? '1X2' : l.market.replace(/\s\d+,\d$/, '').replace(/^Hazai csapat - |^Vendégcsapat - /, 'Csapat-');
    byMarket[k] = byMarket[k] || { n: 0, won: 0, expected: 0 };
    byMarket[k].n++; if (l.status === 'nyert') byMarket[k].won++; byMarket[k].expected += l.p || 0;
  }
  return {
    slips: db.slips.length, settled: done.length, won: done.filter(s => s.status === 'nyert').length,
    staked, returned: ret, profit: ret - staked, roi: staked ? (ret - staked) / staked : null,
    legs: legs.length, legsWon: legs.filter(l => l.status === 'nyert').length,
    expectedLegs: legs.reduce((x, l) => x + (l.p || 0), 0),
    byMarket,
  };
}

module.exports = { findResult, legWon, addSlip, removeSlip, setLeg, settle, stats, load };
