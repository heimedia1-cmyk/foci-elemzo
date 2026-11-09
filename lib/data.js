// Adatréteg: football-data.co.uk CSV fájlok (ingyenes, API-kulcs nélkül)
const fs = require('fs');
const path = require('path');

const BASE = process.env.DATA_BASE || 'https://www.football-data.co.uk';
const LOCAL = process.env.LOCAL_DATA || null; // tesztelésnél helyi mappa
const TTL = 3 * 60 * 60 * 1000; // 3 óra cache

const MAIN_LEAGUES = {
  E0: ['Anglia', 'Premier League'], E1: ['Anglia', 'Championship'], E2: ['Anglia', 'League One'],
  E3: ['Anglia', 'League Two'], EC: ['Anglia', 'National League'],
  SC0: ['Skócia', 'Premiership'], SC1: ['Skócia', 'Championship'], SC2: ['Skócia', 'League One'], SC3: ['Skócia', 'League Two'],
  D1: ['Németország', 'Bundesliga'], D2: ['Németország', '2. Bundesliga'],
  I1: ['Olaszország', 'Serie A'], I2: ['Olaszország', 'Serie B'],
  SP1: ['Spanyolország', 'La Liga'], SP2: ['Spanyolország', 'Segunda División'],
  F1: ['Franciaország', 'Ligue 1'], F2: ['Franciaország', 'Ligue 2'],
  N1: ['Hollandia', 'Eredivisie'], B1: ['Belgium', 'Jupiler Pro League'],
  P1: ['Portugália', 'Primeira Liga'], T1: ['Törökország', 'Süper Lig'], G1: ['Görögország', 'Super League'],
};
const EXTRA_LEAGUES = {
  ARG: ['Argentína', 'Liga Profesional', 'Argentina'], AUT: ['Ausztria', 'Bundesliga', 'Austria'],
  BRA: ['Brazília', 'Série A', 'Brazil'], CHN: ['Kína', 'Super League', 'China'],
  DNK: ['Dánia', 'Superliga', 'Denmark'], FIN: ['Finnország', 'Veikkausliiga', 'Finland'],
  IRL: ['Írország', 'Premier Division', 'Ireland'], JPN: ['Japán', 'J1 League', 'Japan'],
  MEX: ['Mexikó', 'Liga MX', 'Mexico'], NOR: ['Norvégia', 'Eliteserien', 'Norway'],
  POL: ['Lengyelország', 'Ekstraklasa', 'Poland'], ROU: ['Románia', 'Liga I', 'Romania'],
  RUS: ['Oroszország', 'Premier League', 'Russia'], SWE: ['Svédország', 'Allsvenskan', 'Sweden'],
  SWZ: ['Svájc', 'Super League', 'Switzerland'], USA: ['USA', 'MLS', 'USA'],
};
const COUNTRY_TO_EXTRA = Object.fromEntries(Object.entries(EXTRA_LEAGUES).map(([k, v]) => [v[2], k]));

function leagueInfo(code) {
  const v = MAIN_LEAGUES[code] || EXTRA_LEAGUES[code];
  return v ? { code, country: v[0], name: v[1], extra: !!EXTRA_LEAGUES[code] } : null;
}
function allLeagues() {
  return [...Object.keys(MAIN_LEAGUES), ...Object.keys(EXTRA_LEAGUES)].map(leagueInfo);
}

// ---------- letöltés + cache ----------
const cache = new Map();
async function getText(rel) {
  const hit = cache.get(rel);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = (async () => {
    if (LOCAL) {
      const f = path.join(LOCAL, rel);
      return fs.existsSync(f) ? fs.readFileSync(f, 'latin1') : null;
    }
    try {
      const r = await fetch(`${BASE}/${rel}`, { headers: { 'User-Agent': 'foci-elemzo/1.0' } });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return buf.toString('latin1');
    } catch (e) {
      return null;
    }
  })();
  cache.set(rel, { t: Date.now(), p });
  const v = await p;
  if (v === null) cache.set(rel, { t: Date.now() - TTL + 10 * 60 * 1000, p }); // hibánál 10 perc múlva újra
  return v;
}

function parseCSV(text) {
  if (!text) return [];
  const lines = text.replace(/^﻿/, '').replace(/^ï»¿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const split = l => {
    const out = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };
  const head = split(lines[0]);
  return lines.slice(1).map(l => {
    const c = split(l); const o = {};
    head.forEach((h, i) => { o[h] = c[i] ?? ''; });
    return o;
  });
}

function parseDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s || '');
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
// UK idő -> magyar idő (+1 óra, a nyári időszámítás mindkét helyen egyszerre vált)
function toHuTime(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return '';
  const h = (+m[1] + 1) % 24;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
const firstOdds = (r, keys) => { for (const k of keys) { const x = num(r[k]); if (x && x > 1) return x; } return null; };

function normRow(r, league) {
  const date = parseDate(r.Date);
  const home = r.HomeTeam || r.Home, away = r.AwayTeam || r.Away;
  if (!date || !home || !away) return null;
  const hg = num(r.FTHG ?? r.HG), ag = num(r.FTAG ?? r.AG);
  const oh = firstOdds(r, ['PSH', 'AvgH', 'B365H', 'PSCH', 'AvgCH', 'B365CH']);
  const od = firstOdds(r, ['PSD', 'AvgD', 'B365D', 'PSCD', 'AvgCD', 'B365CD']);
  const oa = firstOdds(r, ['PSA', 'AvgA', 'B365A', 'PSCA', 'AvgCA', 'B365CA']);
  const oo = firstOdds(r, ['P>2.5', 'Avg>2.5', 'B365>2.5', 'PC>2.5', 'AvgC>2.5']);
  const ou = firstOdds(r, ['P<2.5', 'Avg<2.5', 'B365<2.5', 'PC<2.5', 'AvgC<2.5']);
  return {
    league, date, time: toHuTime(r.Time), home, away,
    hg, ag, played: hg !== null && ag !== null,
    hst: num(r.HST), ast: num(r.AST), hs: num(r.HS), as: num(r.AS),
    hc: num(r.HC), ac: num(r.AC), hy: num(r.HY), ay: num(r.AY),
    hthg: num(r.HTHG), htag: num(r.HTAG),
    odds: oh && od && oa ? { h: oh, d: od, a: oa, over: oo, under: ou } : (oo && ou ? { over: oo, under: ou } : null),
  };
}

function seasonCode(startYear) {
  return String(startYear % 100).padStart(2, '0') + String((startYear + 1) % 100).padStart(2, '0');
}
function seasonStart(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return m >= 7 ? y : y - 1;
}

// Egy liga összes meccse (lejátszott) a dátum körüli 2+ szezonból
async function leagueMatches(code, aroundDate) {
  const info = leagueInfo(code);
  if (!info) return [];
  if (info.extra) {
    const rows = parseCSV(await getText(`new/${code}.csv`));
    return rows.map(r => normRow(r, code)).filter(Boolean);
  }
  const s = seasonStart(aroundDate);
  const seasons = [s - 2, s - 1, s];
  const texts = await Promise.all(seasons.map(y => getText(`mmz4281/${seasonCode(y)}/${code}.csv`)));
  const out = [];
  texts.forEach((t, i) => parseCSV(t).forEach(r => {
    const m = normRow(r, code);
    if (m) { m.season = seasons[i]; out.push(m); }
  }));
  return out;
}

async function fixtures() {
  const [a, b] = await Promise.all([getText('fixtures.csv'), getText('new_league_fixtures.csv')]);
  const out = [];
  parseCSV(a).forEach(r => { if (MAIN_LEAGUES[r.Div]) { const m = normRow(r, r.Div); if (m) out.push(m); } });
  parseCSV(b).forEach(r => {
    const code = COUNTRY_TO_EXTRA[r.Country];
    if (code) { const m = normRow(r, code); if (m) out.push(m); }
  });
  return out;
}

// Adott nap összes meccse (múlt: eredményekből, jövő: fixtures-ből)
async function matchesOnDate(date) {
  const codes = allLeagues().map(l => l.code);
  const results = [];
  const queue = [...codes];
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      const ms = await leagueMatches(c, date);
      ms.forEach(m => { if (m.date === date) results.push(m); });
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  const fx = await fixtures();
  const key = m => `${m.league}|${m.home}|${m.away}`;
  const seen = new Set(results.map(key));
  fx.forEach(m => { if (m.date === date && !seen.has(key(m))) { results.push(m); seen.add(key(m)); } });
  return results;
}

module.exports = { allLeagues, leagueInfo, leagueMatches, fixtures, matchesOnDate, parseCSV, seasonStart };
