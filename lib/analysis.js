// Elemzés: modell-cache, csapatstatisztikák, tippek, value, visszamérés
const data = require('./data');
const tippmix = require('./tippmix');
const { buildLeagueModel, predictMatch, scoreMatrix, markets, devig, impliedLambdas, exactScoreMatrix, applyExact, CFG } = require('./model');
const national = require('./national');
const tmm = require('./tmmarkets');

const leagueCfg = {}; // ligánként hangolt súlyok (auto-hangolás után)
const cfgFor = lg => leagueCfg[lg] || CFG;

const modelCache = new Map(); // `${league}|${date}` -> Promise<model>
async function getModel(league, date) {
  const k = `${league}|${date}`;
  if (!modelCache.has(k)) {
    modelCache.set(k, (async () => {
      const all = await data.leagueMatches(league, date);
      return buildLeagueModel(all, date, cfgFor(league));
    })());
    if (modelCache.size > 400) modelCache.delete(modelCache.keys().next().value);
  }
  return modelCache.get(k);
}

const pct = p => Math.round(p * 1000) / 10;

function confidence(p) {
  if (p >= 0.7) return 'nagyon erős';
  if (p >= 0.6) return 'erős';
  if (p >= 0.5) return 'közepes';
  return 'gyenge';
}

// a legvalószínűbb eredmény az 1X2 legvalószínűbb kimenetén belül
function condScore(f) {
  const x = f.x12;
  const out = x.h >= x.d && x.h >= x.a ? '1' : x.a >= x.d ? '2' : 'X';
  const ok = s => (out === '1' ? s.h > s.a : out === '2' ? s.h < s.a : s.h === s.a);
  const s = f.topScores.find(ok);
  return s ? { out, score: s.score, p: s.p } : null;
}

function buildTips(pred, match) {
  const f = pred.final;
  const tips = [];
  const x = f.x12;
  const opts = [['1', x.h, `${match.home} győzelem`], ['X', x.d, 'Döntetlen'], ['2', x.a, `${match.away} győzelem`]];
  opts.sort((a, b) => b[1] - a[1]);
  const best = opts[0];
  if (best[1] >= 0.5) tips.push({ market: '1X2', pick: best[0], label: best[2], p: best[1] });
  else {
    const dcs = [['1X', f.dc['1X'], `${match.home} vagy döntetlen`], ['X2', f.dc['X2'], `${match.away} vagy döntetlen`], ['12', f.dc['12'], 'Nem lesz döntetlen']];
    dcs.sort((a, b) => b[1] - a[1]);
    tips.push({ market: '1X2', pick: best[0], label: best[2], p: best[1], note: `Bizonytalan – biztonságosabb: ${dcs[0][0]} (${pct(dcs[0][1])}%)`, alt: { pick: dcs[0][0], p: dcs[0][1] } });
  }
  const b = f.btts;
  tips.push({ market: 'Mindkét csapat lő gólt', pick: b.yes >= 0.5 ? 'Igen' : 'Nem', p: Math.max(b.yes, b.no) });
  const o = f.ou[2.5];
  tips.push({ market: 'Gólszám 2,5', pick: o.over >= 0.5 ? '2,5 felett' : '2,5 alatt', p: Math.max(o.over, o.under) });
  // legbiztosabb gólvonal
  const lines = [];
  for (const [ln, v] of Object.entries(f.ou)) {
    if (+ln > 4.5) continue;
    lines.push([`${String(ln).replace('.', ',')} felett`, v.over], [`${String(ln).replace('.', ',')} alatt`, v.under]);
  }
  const safe = lines.filter(l => l[1] >= 0.7 && l[1] <= 0.88).sort((a, b) => Math.abs(a[1] - 0.78) - Math.abs(b[1] - 0.78))[0];
  if (safe) tips.push({ market: 'Biztonsági gólvonal', pick: safe[0], p: safe[1] });
  const top = f.topScores[0];
  const cs = condScore(f);
  const condTxt = cs && cs.score !== top.score ? ` · Ha ${cs.out === '1' ? 'hazai győzelem' : cs.out === '2' ? 'vendég győzelem' : 'döntetlen'} (az 1X2 tipp): ${cs.score} (${pct(cs.p)}%)` : '';
  tips.push({ market: 'Pontos végeredmény', pick: top.score, p: top.p, note: `Továbbiak: ${f.topScores.slice(1, 4).map(s => `${s.score} (${pct(s.p)}%)`).join(', ')}${condTxt}` });
  tips.forEach(t => { t.conf = t.market === 'Pontos végeredmény' ? 'a pontos eredmény mindig kis esélyű' : confidence(t.p); t.pct = pct(t.p); });
  return tips;
}

function valueBets(pred, match) {
  const o = match.odds; if (!o) return [];
  const f = pred.final, out = [];
  const add = (label, p, odd) => {
    if (!odd) return;
    const ev = p * odd - 1;
    const kelly = ev > 0 ? ev / (odd - 1) : 0;
    out.push({ label, p: pct(p), odds: odd, fair: Math.round(100 / p) / 100, ev: Math.round(ev * 1000) / 10, kelly: Math.round(kelly * 250) / 10 });
  };
  if (o.h) { add(`1 (${match.home})`, f.x12.h, o.h); add('X', f.x12.d, o.d); add(`2 (${match.away})`, f.x12.a, o.a); }
  if (o.over) { add('2,5 felett', f.ou[2.5].over, o.over); add('2,5 alatt', f.ou[2.5].under, o.under); }
  return out.sort((a, b) => b.ev - a.ev);
}

function teamStats(past, team, n = 6) {
  const ms = past.filter(m => m.home === team || m.away === team).sort((a, b) => b.date.localeCompare(a.date));
  const last = ms.slice(0, n).map(m => {
    const home = m.home === team;
    const gf = home ? m.hg : m.ag, ga = home ? m.ag : m.hg;
    return { date: m.date, opp: home ? m.away : m.home, home, gf, ga, r: gf > ga ? 'W' : gf === ga ? 'D' : 'L' };
  });
  const season = ms.slice(0, 20);
  const avg = (arr, f) => arr.length ? arr.reduce((s, m) => s + f(m), 0) / arr.length : null;
  const gfOf = m => (m.home === team ? m.hg : m.ag), gaOf = m => (m.home === team ? m.ag : m.hg);
  const homeMs = season.filter(m => m.home === team), awayMs = season.filter(m => m.away === team);
  const sotMs = season.filter(m => m.hst != null);
  return {
    form: last,
    played: season.length,
    gf: avg(season, gfOf), ga: avg(season, gaOf),
    homeGf: avg(homeMs, m => m.hg), homeGa: avg(homeMs, m => m.ag),
    awayGf: avg(awayMs, m => m.ag), awayGa: avg(awayMs, m => m.hg),
    btts: avg(season, m => (m.hg > 0 && m.ag > 0 ? 1 : 0)),
    over25: avg(season, m => (m.hg + m.ag > 2.5 ? 1 : 0)),
    cleanSheets: avg(season, m => (gaOf(m) === 0 ? 1 : 0)),
    sotFor: sotMs.length ? avg(sotMs, m => (m.home === team ? m.hst : m.ast)) : null,
    sotAgainst: sotMs.length ? avg(sotMs, m => (m.home === team ? m.ast : m.hst)) : null,
  };
}

function h2h(past, a, b) {
  return past.filter(m => (m.home === a && m.away === b) || (m.home === b && m.away === a))
    .sort((x, y) => y.date.localeCompare(x.date)).slice(0, 6)
    .map(m => ({ date: m.date, home: m.home, away: m.away, hg: m.hg, ag: m.ag }));
}

function strengthTable(model) {
  const g = model.goals;
  return Object.entries(g.strength).map(([t, s]) => ({
    team: t,
    att: Math.round(Math.exp(s.att) * 100) / 100,
    def: Math.round(Math.exp(s.def) * 100) / 100,
    rating: Math.round((s.att - s.def) * 100) / 100,
  })).sort((a, b) => b.rating - a.rating);
}

function tmValue(f, tm) {
  if (!tm) return null;
  const rows = [['1', f.x12.h, tm.h], ['X', f.x12.d, tm.d], ['2', f.x12.a, tm.a]].map(([k, p, o]) => ({
    pick: k, p: pct(p), odds: o, min: Math.round(100 / p) / 100, ev: Math.round((p * o - 1) * 1000) / 10,
    kelly: p * o > 1 ? Math.round((p * o - 1) / (o - 1) * 250) / 10 : 0,
  }));
  return { num: tm.num, event: tm.event, minCombi: tm.minCombi, date: tm.date, time: tm.time, league: tm.league, name: `${tm.home} - ${tm.away}`, rows, best: [...rows].sort((a, b) => b.ev - a.ev)[0] };
}

// Csak Tippmix-szorzó alapú elemzés azokra a meccsekre, amelyekről nincs statisztikai adat
function marketOnly(o) {
  const dv = devig([o.h, o.d, o.a]);
  const rho = -0.05;
  const lam = impliedLambdas({ x12: dv.probs }, rho, { l: 1.4, m: 1.15 });
  const mk = markets(scoreMatrix(lam.l, lam.m, rho));
  const E = exactScoreMatrix(lam.l, lam.m);
  const sc = [];
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) sc.push({ score: `${i}-${j}`, h: i, a: j, p: E[i][j] });
  sc.sort((a, b) => b.p - a.p);
  const out1 = mk.x12.h >= mk.x12.d && mk.x12.h >= mk.x12.a ? '1' : mk.x12.a >= mk.x12.d ? '2' : 'X';
  const cond = sc.find(s => (out1 === '1' ? s.h > s.a : out1 === '2' ? s.h < s.a : s.h === s.a));
  return {
    league: o.league, num: o.num, minCombi: o.minCombi, home: o.home, away: o.away, date: o.date, time: o.time,
    odds: { h: o.h, d: o.d, a: o.a }, margin: pct(dv.margin), prob: { h: dv.probs[0], d: dv.probs[1], a: dv.probs[2] },
    p: { h: pct(dv.probs[0]), d: pct(dv.probs[1]), a: pct(dv.probs[2]), btts: pct(mk.btts.yes), o25: pct(mk.ou[2.5].over), o15: pct(mk.ou[1.5].over), u35: pct(mk.ou[3.5].under) },
    xg: [Math.round(lam.l * 100) / 100, Math.round(lam.m * 100) / 100],
    score: sc[0].score, scoreP: pct(sc[0].p), top: sc.slice(0, 4).map(s => `${s.score} (${pct(s.p)}%)`),
    cond: cond ? { out: out1, score: cond.score } : null,
  };
}

// további Tippmix piacok kiértékelése egy meccsre
async function extraMarkets(tm, lam, home, away, onlyCached = false) {
  if (!tm || !tm.event || !lam) return null;
  const list = await tmm.fetchMarkets(tm.event, { onlyCached });
  if (!list) return null;
  return tmm.evaluate(list, lam, home, away);
}
function fmtExtra(rows) {
  if (!rows) return null;
  return rows.map(r => ({ market: r.market, name: r.name, code: r.code, num: r.num, odds: r.odds, p: pct(r.p), min: Math.round(r.min * 100) / 100, ev: Math.round(r.ev * 1000) / 10 }))
    .sort((a, b) => b.ev - a.ev);
}
function extraBest(rows) {
  if (!rows || !rows.length) return null;
  const b = rows.filter(r => !/pontos/i.test(r.market) && r.p >= 0.25).sort((a, b2) => b2.ev - a.ev)[0];
  return b ? { market: b.market, name: b.name, code: b.code, num: b.num, odds: b.odds, p: pct(b.p), ev: Math.round(b.ev * 1000) / 10 } : null;
}

// ---- Válogatott meccsek: saját modell + Tippmix-szorzó (50-50% keverés) ----
const NAT_W_MODEL = 0.5;
async function nationalPred(o, date) {
  if (!national.isSeniorNational(o.league)) return null;
  const np = await national.predict(o.home, o.away, date);
  if (!np) return null;
  const dv = devig([o.h, o.d, o.a]);
  const mk = impliedLambdas({ x12: dv.probs }, np.rho, { l: np.l, m: np.m });
  const geo = (a, b, w) => Math.exp(w * Math.log(a) + (1 - w) * Math.log(b));
  const fin = { l: geo(np.l, mk.l, NAT_W_MODEL), m: geo(np.m, mk.m, NAT_W_MODEL) };
  return {
    np, dv, lambdas: { goals: { l: np.l, m: np.m }, sot: null, model: { l: np.l, m: np.m }, market: mk, final: fin },
    rho: np.rho,
    model: markets(scoreMatrix(np.l, np.m, np.rho)),
    marketMk: markets(scoreMatrix(mk.l, mk.m, np.rho)),
    final: applyExact(markets(scoreMatrix(fin.l, fin.m, np.rho)), fin.l, fin.m),
    marketProbs: { margin: dv.margin },
  };
}

async function nationalForDate(date) {
  const offers = (await tippmix.fetchDay(date)).filter(o => o.date === date);
  const out = [];
  for (const o of offers) {
    const pred = await nationalPred(o, date);
    if (!pred) continue;
    const f = pred.final, m = { home: o.home, away: o.away };
    const tips = buildTips(pred, m);
    out.push({
      league: 'NAT', country: 'Válogatott', leagueName: o.league, date, time: o.time, home: o.home, away: o.away, played: false,
      hasOdds: true, nat: true,
      p: { h: pct(f.x12.h), d: pct(f.x12.d), a: pct(f.x12.a), btts: pct(f.btts.yes), o25: pct(f.ou[2.5].over) },
      xg: [Math.round(pred.lambdas.final.l * 100) / 100, Math.round(pred.lambdas.final.m * 100) / 100],
      tip1x2: tips[0], score: f.topScores[0].score, cond: condScore(f), value: null, hits: null,
      tm: tmValue(f, o),
      lam: { l: pred.lambdas.final.l, m: pred.lambdas.final.m, rho: pred.rho },
      ref: { kind: 'nat', home: pred.np.homeEn, away: pred.np.awayEn, date },
    });
  }
  return out;
}

async function analyzeNational(date, home, away) {
  const offers = [...(await tippmix.fetchDay(date))];
  const o = offers.find(x => x.home === home && x.away === away);
  if (!o) throw new Error('A meccs nem található a Tippmix kínálatában.');
  const pred = await nationalPred(o, date);
  if (!pred) throw new Error('Az egyik válogatottról nincs elég adat.');
  const { np } = pred, mdl = np.model;
  const r2 = x => Math.round(x * 100) / 100;
  const lam = {}; for (const [k, v] of Object.entries(pred.lambdas)) lam[k] = v ? { l: r2(v.l), m: r2(v.m) } : null;
  const fmt = mk => mk && ({ x12: { h: pct(mk.x12.h), d: pct(mk.x12.d), a: pct(mk.x12.a) }, btts: pct(mk.btts.yes), o25: pct(mk.ou[2.5].over) });
  const rename = st => st;
  const hs = teamStats(mdl.past, np.homeEn), as = teamStats(mdl.past, np.awayEn);
  const table = Object.entries(mdl.fit.strength).map(([t, s2]) => ({ team: t, att: r2(Math.exp(s2.att)), def: r2(Math.exp(s2.def)), rating: r2(s2.att - s2.def), n: mdl.past.filter(r => r.home === t || r.away === t).length }))
    .filter(t => t.n >= 15).sort((a, b) => b.rating - a.rating);
  const idxH = table.findIndex(t => t.team === np.homeEn), idxA = table.findIndex(t => t.team === np.awayEn);
  const keep = new Set([...table.slice(0, 15).map(t => t.team), np.homeEn, np.awayEn]);
  return {
    match: { league: 'NAT', date, time: o.time, home, away, leagueName: o.league, country: 'Válogatott', odds: null, played: false },
    lambdas: lam, rho: r2(pred.rho), final: pred.final,
    compare: { model: fmt(pred.model), market: fmt(pred.marketMk), final: fmt(pred.final), marketMargin: pct(pred.dv.margin) },
    tips: buildTips(pred, { home, away }), value: [], tm: tmValue(pred.final, o),
    extra: fmtExtra(await extraMarkets(tmValue(pred.final, o), { l: pred.lambdas.final.l, m: pred.lambdas.final.m, rho: pred.rho }, o.home, o.away).catch(() => null)),
    home: hs, away: as, h2h: h2h(mdl.past, np.homeEn, np.awayEn),
    table: table.map((t, i) => ({ ...t, rank: i + 1 })).filter(t => keep.has(t.team)).map(t => ({ team: `${t.rank}. ${t.team}`, att: t.att, def: t.def, rating: t.rating, hl: t.team === np.homeEn || t.team === np.awayEn })),
    homeAdv: r2(Math.exp(mdl.fit.home)), nMatches: mdl.past.length, result: null,
    cfg: { wGoals: 1, wMarket: 1 - NAT_W_MODEL }, tuned: false, nat: true,
    natInfo: `Válogatott-modell: ${mdl.past.length} válogatott meccs (8 év, időben súlyozva), keverve a Tippmix marzs nélküli esélyével 50-50%-ban. Visszamérve 1 275 tétmeccsen: 63,5% 1X2 találat.`,
  };
}

async function tippmixOnly(date, matchedNums) {
  const offers = await tippmix.fetchDay(date);
  return offers.filter(o => o.date === date && !matchedNums.has(o.num)).map(marketOnly)
    .sort((a, b) => a.league.localeCompare(b.league) || a.time.localeCompare(b.time));
}

async function quickForDate(date) {
  const matches = await data.matchesOnDate(date);
  const tmMap = await tippmix.attach(matches, date).catch(() => new Map());
  const out = [];
  const leagues = [...new Set(matches.map(m => m.league))];
  await Promise.all(leagues.map(async lg => {
    const model = await getModel(lg, date);
    matches.filter(m => m.league === lg).forEach(m => {
      const info = data.leagueInfo(lg);
      const base = { league: lg, country: info.country, leagueName: info.name, date: m.date, time: m.time, home: m.home, away: m.away, played: m.played, hg: m.hg, ag: m.ag, hasOdds: !!(m.odds && m.odds.h) };
      if (!model) { out.push({ ...base, error: 'Kevés adat' }); return; }
      const pred = predictMatch(model, m);
      if (!pred) { out.push({ ...base, error: 'Ismeretlen csapat (nincs elég adat)' }); return; }
      const f = pred.final;
      const tips = buildTips(pred, m);
      const vb = valueBets(pred, m).filter(v => v.ev >= 3 && v.odds <= 4.5); // a nagy szorzós "value" túl zajos
      out.push({
        ...base,
        p: { h: pct(f.x12.h), d: pct(f.x12.d), a: pct(f.x12.a), btts: pct(f.btts.yes), o25: pct(f.ou[2.5].over) },
        xg: [Math.round(pred.lambdas.final.l * 100) / 100, Math.round(pred.lambdas.final.m * 100) / 100],
        tip1x2: tips[0], score: f.topScores[0].score, cond: condScore(f),
        value: vb.length ? vb[0] : null,
        hits: m.played ? evalHits(f, m) : null,
        tm: tmValue(f, tmMap.get(`${m.league}|${m.home}|${m.away}`)),
        lam: { l: pred.lambdas.final.l, m: pred.lambdas.final.m, rho: pred.rho },
        ref: { kind: 'club', league: lg, home: m.home, away: m.away, date: m.date },
      });
    });
  }));
  const nat = await nationalForDate(date).catch(e => { console.log('[nat] hiba', e.message); return []; });
  out.push(...nat);
  for (const e of out) {
    if (!e.tm || !e.lam) continue;
    const ex = await extraMarkets(e.tm, e.lam, e.tm.name.split(' - ')[0], e.tm.name.split(' - ')[1], true).catch(() => null);
    e.extraBest = extraBest(ex);
  }
  out.sort((a, b) => a.country.localeCompare(b.country) || a.leagueName.localeCompare(b.leagueName) || (a.time || '').localeCompare(b.time || ''));
  return out;
}

function evalHits(f, m) {
  const res = m.hg > m.ag ? 'h' : m.hg === m.ag ? 'd' : 'a';
  const pick = ['h', 'd', 'a'].sort((x, y) => f.x12[y] - f.x12[x])[0];
  return {
    x12: pick === res,
    btts: (f.btts.yes >= 0.5) === (m.hg > 0 && m.ag > 0),
    o25: (f.ou[2.5].over >= 0.5) === (m.hg + m.ag > 2.5),
    score: f.topScores[0].score === `${m.hg}-${m.ag}`,
  };
}

async function analyze(league, date, home, away) {
  if (league === 'NAT') return analyzeNational(date, home, away);
  const model = await getModel(league, date);
  if (!model) throw new Error('Ehhez a ligához nincs elég adat erre a dátumra.');
  const all = await data.leagueMatches(league, date);
  let match = all.find(m => m.date === date && m.home === home && m.away === away);
  if (!match) match = (await data.fixtures()).find(m => m.league === league && m.home === home && m.away === away);
  if (!match) match = { league, date, home, away, odds: null, played: false };
  const pred = predictMatch(model, match);
  if (!pred) throw new Error('Az egyik csapatról nincs elég adat.');
  const info = data.leagueInfo(league);
  const tmMap = await tippmix.attach([match], date).catch(() => new Map());
  const r2 = x => Math.round(x * 100) / 100;
  const lam = {};
  for (const [k, v] of Object.entries(pred.lambdas)) lam[k] = v ? { l: r2(v.l), m: r2(v.m) } : null;
  const fmt = mk => mk && ({
    x12: { h: pct(mk.x12.h), d: pct(mk.x12.d), a: pct(mk.x12.a) },
    btts: pct(mk.btts.yes), o25: pct(mk.ou[2.5].over),
  });
  return {
    match: { ...match, leagueName: info.name, country: info.country },
    lambdas: lam, rho: r2(pred.rho),
    final: pred.final,
    compare: { model: fmt(pred.model), market: fmt(pred.marketMk), final: fmt(pred.final), marketMargin: pred.marketProbs?.margin != null ? pct(pred.marketProbs.margin) : null },
    tips: buildTips(pred, match),
    value: valueBets(pred, match),
    tm: tmValue(pred.final, tmMap.get(`${league}|${home}|${away}`)),
    extra: await (async () => { const tmo = tmMap.get(`${league}|${home}|${away}`); const t = tmValue(pred.final, tmo); const ex = t ? await extraMarkets(t, { l: pred.lambdas.final.l, m: pred.lambdas.final.m, rho: pred.rho }, tmo.home, tmo.away).catch(() => null) : null; return fmtExtra(ex); })(),
    home: teamStats(model.past, home), away: teamStats(model.past, away),
    h2h: h2h(model.past, home, away),
    table: strengthTable(model),
    homeAdv: r2(Math.exp(model.goals.home)),
    nMatches: model.nMatches,
    result: match.played ? { hg: match.hg, ag: match.ag, hits: evalHits(pred.final, match) } : null,
    cfg: cfgFor(league), tuned: !!leagueCfg[league],
  };
}

// ----- Visszamérés: hetente újraillesztve, csak múltbeli adatokkal -----
async function backtest(league, weeks = 10, endDate) {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const all = await data.leagueMatches(league, end);
  const played = all.filter(m => m.played && m.date < end).sort((a, b) => a.date.localeCompare(b.date));
  const DAY = 86400000;
  const endT = Date.parse(end);
  const stats = {};
  const mk = () => ({ n: 0, ll: 0, brier: 0, hit: 0, btts: 0, o25: 0, score: 0 });
  ['model', 'market', 'final'].forEach(k => (stats[k] = mk()));
  const valueLog = { bets: 0, staked: 0, ret: 0 };
  for (let w = weeks; w >= 1; w--) {
    const from = new Date(endT - w * 7 * DAY).toISOString().slice(0, 10);
    const to = new Date(endT - (w - 1) * 7 * DAY).toISOString().slice(0, 10);
    const wk = played.filter(m => m.date >= from && m.date < to);
    if (!wk.length) continue;
    const model = buildLeagueModel(all, from, cfgFor(league));
    if (!model) continue;
    for (const m of wk) {
      const pred = predictMatch(model, m);
      if (!pred) continue;
      const res = m.hg > m.ag ? 'h' : m.hg === m.ag ? 'd' : 'a';
      const add = (k, mkt) => {
        if (!mkt) return;
        const s = stats[k], x = mkt.x12;
        s.n++;
        s.ll += -Math.log(Math.max(x[res], 1e-9));
        s.brier += ['h', 'd', 'a'].reduce((acc, o) => acc + (x[o] - (o === res ? 1 : 0)) ** 2, 0);
        const pick = ['h', 'd', 'a'].sort((a, b) => x[b] - x[a])[0];
        if (pick === res) s.hit++;
        if ((mkt.btts.yes >= 0.5) === (m.hg > 0 && m.ag > 0)) s.btts++;
        if ((mkt.ou[2.5].over >= 0.5) === (m.hg + m.ag > 2.5)) s.o25++;
        if (mkt.topScores[0].score === `${m.hg}-${m.ag}`) s.score++;
      };
      add('model', pred.model);
      if (pred.marketMk) add('market', pred.marketMk);
      add('final', pred.final);
      // value-stratégia szimuláció (1 egység, EV >= 5%)
      for (const v of valueBets(pred, m)) {
        if (v.ev < 5) continue;
        valueLog.bets++; valueLog.staked += 1;
        const won = (v.label.startsWith('1 ') && res === 'h') || (v.label === 'X' && res === 'd') || (v.label.startsWith('2 ') && res === 'a') ||
          (v.label === '2,5 felett' && m.hg + m.ag > 2.5) || (v.label === '2,5 alatt' && m.hg + m.ag < 2.5);
        if (won) valueLog.ret += v.odds;
      }
    }
  }
  const out = {};
  for (const [k, s] of Object.entries(stats)) {
    if (!s.n) { out[k] = null; continue; }
    out[k] = {
      n: s.n, logLoss: Math.round(s.ll / s.n * 1000) / 1000, brier: Math.round(s.brier / s.n * 1000) / 1000,
      hit1x2: pct(s.hit / s.n), btts: pct(s.btts / s.n), o25: pct(s.o25 / s.n), score: pct(s.score / s.n),
    };
  }
  out.value = { ...valueLog, roi: valueLog.staked ? pct((valueLog.ret - valueLog.staked) / valueLog.staked) : null, ret: Math.round(valueLog.ret * 100) / 100 };
  return out;
}

// ----- Auto-hangolás: a súlyok optimalizálása a liga elmúlt heteire (log-loss minimum) -----
async function tune(league, weeks = 20, endDate) {
  const end = endDate || new Date().toISOString().slice(0, 10);
  const all = await data.leagueMatches(league, end);
  const played = all.filter(m => m.played && m.date < end);
  const DAY = 86400000, endT = Date.parse(end);
  const samples = [];
  for (let w = weeks; w >= 1; w--) {
    const from = new Date(endT - w * 7 * DAY).toISOString().slice(0, 10);
    const to = new Date(endT - (w - 1) * 7 * DAY).toISOString().slice(0, 10);
    const wk = played.filter(m => m.date >= from && m.date < to);
    if (!wk.length) continue;
    const model = buildLeagueModel(all, from, CFG);
    if (!model) continue;
    for (const m of wk) {
      const p = predictMatch(model, m);
      if (p) samples.push({ m, g: p.lambdas.goals, s: p.lambdas.sot, k: p.lambdas.market, rho: p.rho });
    }
  }
  if (samples.length < 40) throw new Error('Kevés lejátszott meccs a hangoláshoz.');
  const geo = (a, b, w) => Math.exp(w * Math.log(a) + (1 - w) * Math.log(b));
  const score = (wG, wM) => {
    let L = 0;
    for (const { m, g, s, k, rho } of samples) {
      let l = s ? geo(g.l, s.l, wG) : g.l, mu = s ? geo(g.m, s.m, wG) : g.m;
      if (k) { l = geo(k.l, l, wM); mu = geo(k.m, mu, wM); }
      const mk = markets(scoreMatrix(l, mu, rho));
      const res = m.hg > m.ag ? 'h' : m.hg === m.ag ? 'd' : 'a';
      const ov = m.hg + m.ag > 2.5, bt = m.hg > 0 && m.ag > 0;
      L += -Math.log(Math.max(mk.x12[res], 1e-9))
        - Math.log(Math.max(ov ? mk.ou[2.5].over : mk.ou[2.5].under, 1e-9))
        - Math.log(Math.max(bt ? mk.btts.yes : mk.btts.no, 1e-9));
    }
    return L / samples.length;
  };
  const hasSot = samples.some(x => x.s), hasMk = samples.some(x => x.k);
  let best = { wG: CFG.wGoals, wM: CFG.wMarket, L: score(CFG.wGoals, CFG.wMarket) };
  const base = best.L;
  for (const wG of hasSot ? [0.2, 0.35, 0.5, 0.65, 0.8, 1] : [1]) {
    for (const wM of hasMk ? [0, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] : [0]) {
      const L = score(wG, wM);
      if (L < best.L) best = { wG, wM, L };
    }
  }
  leagueCfg[league] = { ...CFG, wGoals: best.wG, wMarket: best.wM };
  for (const k of [...modelCache.keys()]) if (k.startsWith(league + '|')) modelCache.delete(k);
  return { league, samples: samples.length, wGoals: best.wG, wMarket: best.wM, before: Math.round(base * 1000) / 1000, after: Math.round(best.L * 1000) / 1000 };
}

module.exports = { extraMarkets, tippmixOnly, quickForDate, analyze, backtest, tune };
