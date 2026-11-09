// Elemzés: modell-cache, csapatstatisztikák, tippek, value, visszamérés
const data = require('./data');
const { buildLeagueModel, predictMatch, scoreMatrix, markets, CFG } = require('./model');

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

async function quickForDate(date) {
  const matches = await data.matchesOnDate(date);
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
      });
    });
  }));
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
  const model = await getModel(league, date);
  if (!model) throw new Error('Ehhez a ligához nincs elég adat erre a dátumra.');
  const all = await data.leagueMatches(league, date);
  let match = all.find(m => m.date === date && m.home === home && m.away === away);
  if (!match) match = (await data.fixtures()).find(m => m.league === league && m.home === home && m.away === away);
  if (!match) match = { league, date, home, away, odds: null, played: false };
  const pred = predictMatch(model, match);
  if (!pred) throw new Error('Az egyik csapatról nincs elég adat.');
  const info = data.leagueInfo(league);
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

module.exports = { quickForDate, analyze, backtest, tune };
