// Önálló tanulás: minden nap minden tipp (esély + valódi Tippmix-szorzó) archiválása,
// a meccsek után kiértékelés, és kategóriánkénti automatikus korrekció (Bayes-i zsugorítással).
const fs = require('fs');
const path = require('path');

const DIR = path.join(process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', '.data')), 'archivum');
const BANDS = [[0, 0.3], [0.3, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]];
const MIN_N = 80, PRIOR = 300; // korrekció csak elég adat után, óvatosan

function group(market, name, pick, p) {
  if (market === '1X2') return pick === 'X' ? '1X2 döntetlen' : (p >= 0.5 ? '1X2 esélyes' : '1X2 nem esélyes');
  if (/^Kétesély$/.test(market)) return 'Kétesély';
  if (/^Mindkét csapat szerez gólt$/.test(market)) return /^igen/i.test(name) ? 'BTTS igen' : 'BTTS nem';
  if (/^Gólszám \d,\d$/.test(market)) return /több|felett/i.test(name) ? 'Gólszám felett' : 'Gólszám alatt';
  if (/^(Hazai csapat|Vendégcsapat) - Gólszám/.test(market)) return 'Csapatgól';
  if (/kapott gól nélkül/.test(market)) return 'Kapott gól nélkül';
  if (/^Pontos/.test(market)) return null;
  return 'Kombinált';
}
const band = p => BANDS.findIndex(([lo, hi]) => p >= lo && p < hi);

// ---- tanult korrekciók (memóriában, óránként frissül) ----
let table = null;
function adjust(market, name, pick, p) {
  if (!table) return p;
  const g = group(market, name, pick, p);
  const c = g && table[g] && table[g][band(p)];
  if (!c || c.n < MIN_N) return p;
  const w = c.n / (c.n + PRIOR);
  return Math.min(0.97, Math.max(0.01, p + w * (c.hit - c.avgP)));
}

function file(date) { return path.join(DIR, `${date}.json`); }
function read(date) { try { return JSON.parse(fs.readFileSync(file(date), 'utf8')); } catch (e) { return { events: {} }; } }
function write(date, db) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file(date) + '.tmp', JSON.stringify(db)); fs.renameSync(file(date) + '.tmp', file(date)); }

// entries: a quickForDate() elemei; extraFn(entry) -> kiértékelt további piacok (vagy null)
async function record(date, entries, extraFn) {
  const db = read(date);
  const now = Date.now();
  for (const e of entries) {
    if (!e.tm || !e.lam || e.played || !e.ref) continue;
    const ko = Date.parse(`${e.tm.date}T${e.tm.time || '00:00'}:00+01:00`);
    if (ko <= now) continue; // csak kezdés előtti állapotot mentünk (az utolsó felülírja)
    const rows = e.tm.rows.map(r => ({ market: '1X2', name: r.pick, pick: r.pick, odds: r.odds, p: (r.pRaw != null ? r.pRaw : r.p) / 100 }));
    const ex = await extraFn(e).catch(() => null);
    for (const r of ex || []) if (!/^Pontos/.test(r.market)) rows.push({ market: r.market, name: r.name, pick: r.code, odds: r.odds, p: r.pRaw != null ? r.pRaw : r.p });
    db.events[e.tm.num] = { name: e.tm.name, ref: e.ref, date: e.tm.date, time: e.tm.time, kind: e.ref.kind, rows, saved: new Date().toISOString(), result: null };
  }
  write(date, db);
}

async function settle(findResult, legWon) {
  if (!fs.existsSync(DIR)) return;
  const today = new Date().toISOString().slice(0, 10);
  for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    const date = f.slice(0, 10);
    if (date >= today) continue;
    const db = read(date);
    let changed = false;
    for (const ev of Object.values(db.events)) {
      if (ev.result) continue;
      const res = await findResult({ ref: ev.ref }).catch(() => null);
      if (!res) continue;
      ev.result = res;
      for (const r of ev.rows) { const w = legWon({ market: r.market, label: r.name, pick: r.pick, name: ev.name }, res[0], res[1]); r.won = w; }
      changed = true;
    }
    if (changed) write(date, db);
  }
  rebuild();
}

function rebuild() {
  const t = {};
  const value = { n: 0, staked: 0, ret: 0 };
  let total = 0, settled = 0;
  if (fs.existsSync(DIR)) for (const f of fs.readdirSync(DIR).filter(x => x.endsWith('.json'))) {
    const db = read(f.slice(0, 10));
    for (const ev of Object.values(db.events)) {
      total += ev.rows.length;
      if (!ev.result) continue;
      for (const r of ev.rows) {
        if (r.won == null) continue;
        settled++;
        const g = group(r.market, r.name, r.pick, r.p); if (!g) continue;
        const b = band(r.p); if (b < 0) continue;
        t[g] = t[g] || BANDS.map(() => ({ n: 0, sp: 0, hits: 0 }));
        const c = t[g][b]; c.n++; c.sp += r.p; if (r.won) c.hits++;
        if (r.p * r.odds - 1 > 0.02 && r.odds >= 1.4) { value.n++; value.staked++; if (r.won) value.ret += r.odds; }
      }
    }
  }
  for (const g of Object.keys(t)) t[g] = t[g].map(c => ({ n: c.n, avgP: c.n ? c.sp / c.n : 0, hit: c.n ? c.hits / c.n : 0 }));
  table = t;
  return { table: t, total, settled, value };
}

function stats() {
  const r = rebuild();
  return {
    total: r.total, settled: r.settled, minN: MIN_N, bands: BANDS.map(([lo, hi]) => `${Math.round(lo * 100)}–${Math.round(Math.min(hi, 1) * 100)}%`),
    groups: Object.entries(r.table).map(([g, cs]) => ({ group: g, cells: cs.map(c => ({ n: c.n, pred: c.avgP, hit: c.hit, active: c.n >= MIN_N })) })),
    value: { ...r.value, roi: r.value.staked ? (r.value.ret - r.value.staked) / r.value.staked : null },
  };
}

// archivált (kezdés előtti) esemény keresése név alapján
function findEvent(date, test) {
  for (const d of [date, new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10)]) {
    const db = read(d);
    for (const ev of Object.values(db.events)) if (test(ev)) return ev;
  }
  return null;
}

module.exports = { findEvent, record, settle, stats, adjust, rebuild, group };
