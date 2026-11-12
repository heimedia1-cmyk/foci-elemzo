// Kalibráció-ellenőrzés: ha a modell p valószínűséget mond, tényleg p arányban jön-e be?
// Walk-forward (csak múltbeli adatok), tanító/teszt bontás, súlyhangolás + Platt-korrekció piaconként.
const data = require('./data');
const { buildLeagueModel, predictMatch, scoreMatrix, markets, CFG } = require('./model');

const LEAGUES = process.env.CALIB_LEAGUES ? process.env.CALIB_LEAGUES.split(',') : ['E0', 'E1', 'E2', 'E3', 'SC0', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1'];
const geo = (a, b, w) => Math.exp(w * Math.log(a) + (1 - w) * Math.log(b));
const logit = p => Math.log(p / (1 - p));
const sig = x => 1 / (1 + Math.exp(-x));
const clip = p => Math.min(1 - 1e-6, Math.max(1e-6, p));

// piacok: név -> [valószínűség a markets()-ből, bejött-e]
const MK = {
  '1': (k, r) => [k.x12.h, r.hg > r.ag], 'X': (k, r) => [k.x12.d, r.hg === r.ag], '2': (k, r) => [k.x12.a, r.hg < r.ag],
  '1X': (k, r) => [k.dc['1X'], r.hg >= r.ag], 'X2': (k, r) => [k.dc['X2'], r.hg <= r.ag], '12': (k, r) => [k.dc['12'], r.hg !== r.ag],
  'BTTS igen': (k, r) => [k.btts.yes, r.hg > 0 && r.ag > 0], 'BTTS nem': (k, r) => [k.btts.no, !(r.hg > 0 && r.ag > 0)],
  '1,5 felett': (k, r) => [k.ou[1.5].over, r.hg + r.ag > 1.5], '2,5 felett': (k, r) => [k.ou[2.5].over, r.hg + r.ag > 2.5],
  '2,5 alatt': (k, r) => [k.ou[2.5].under, r.hg + r.ag < 2.5], '3,5 alatt': (k, r) => [k.ou[3.5].under, r.hg + r.ag < 3.5],
};

async function collect(from, to, log) {
  const S = [], DAY = 86400000;
  for (const lg of LEAGUES) {
    for (let t = Date.parse(from); t < Date.parse(to); t += 7 * DAY) {
      const d0 = new Date(t).toISOString().slice(0, 10), d1 = new Date(t + 7 * DAY).toISOString().slice(0, 10);
      const all = await data.leagueMatches(lg, d0);
      const wk = all.filter(m => m.played && m.date >= d0 && m.date < d1);
      if (!wk.length) continue;
      const model = buildLeagueModel(all, d0, CFG);
      if (!model) continue;
      for (const m of wk) {
        const p = predictMatch(model, m);
        if (!p) continue;
        const L = p.lambdas;
        S.push({ lg, date: m.date, hg: m.hg, ag: m.ag, rho: p.rho, g: L.goals, s: L.sot, k: L.market });
      }
    }
    log(`[calib] ${lg} kész (${S.length})`);
  }
  return S;
}

function lamFor(s, wG, wM) {
  let l = s.s ? geo(s.g.l, s.s.l, wG) : s.g.l, m = s.s ? geo(s.g.m, s.s.m, wG) : s.g.m;
  if (s.k) { l = geo(s.k.l, l, wM); m = geo(s.k.m, m, wM); }
  return [l, m];
}

function preds(samples, wG, wM) {
  return samples.map(s => { const [l, m] = lamFor(s, wG, wM); return { s, k: markets(scoreMatrix(l, m, s.rho)) }; });
}

function logloss(P) {
  let L = 0, n = 0;
  for (const { s, k } of P) {
    for (const name of ['1', 'X', '2']) { const [p, y] = MK[name](k, s); if (y) L -= Math.log(clip(p)); }
    const [po, yo] = MK['2,5 felett'](k, s); L -= Math.log(clip(yo ? po : 1 - po));
    const [pb, yb] = MK['BTTS igen'](k, s); L -= Math.log(clip(yb ? pb : 1 - pb));
    n++;
  }
  return L / n;
}

// Platt-skálázás (logit lineáris korrekció) gradiens módszerrel
function fitPlatt(pairs) {
  let a = 0, b = 1;
  for (let it = 0; it < 400; it++) {
    let ga = 0, gb = 0;
    for (const [p, y] of pairs) { const x = logit(clip(p)), q = sig(a + b * x), e = (y ? 1 : 0) - q; ga += e; gb += e * x; }
    a += 0.5 * ga / pairs.length; b += 0.5 * gb / pairs.length;
  }
  return { a, b };
}
const ll = (pairs, f) => pairs.reduce((s, [p, y]) => s - Math.log(clip(y ? f(p) : 1 - f(p))), 0) / pairs.length;

async function runCalib(opts = {}, log = console.log) {
  const from = opts.from || '2024-09-01', to = opts.to || new Date().toISOString().slice(0, 10), split = opts.split || '2025-12-01';
  const S = await collect(from, to, log);
  const train = S.filter(s => s.date < split), test = S.filter(s => s.date >= split);
  log(`[calib] ${S.length} meccs (tanító ${train.length}, teszt ${test.length}), piaci szorzó: ${S.filter(s => s.k).length}`);

  // 1) súlyok hangolása a tanítón
  let best = null;
  for (const wG of [0.3, 0.45, 0.55, 0.7, 0.85, 1]) for (const wM of [0, 0.3, 0.45, 0.6, 0.7, 0.8, 0.9, 1]) {
    const L = logloss(preds(train, wG, wM));
    if (!best || L < best.L) best = { wG, wM, L };
  }
  const Pcur = preds(test, CFG.wGoals, CFG.wMarket), Pbest = preds(test, best.wG, best.wM);
  log(`[calib] súlyok: jelenlegi gól ${CFG.wGoals}/piac ${CFG.wMarket} teszt logloss ${logloss(Pcur).toFixed(4)} | legjobb (tanítón) gól ${best.wG}/piac ${best.wM} teszt logloss ${logloss(Pbest).toFixed(4)}`);
  log(`[calib] összevetés: csak modell ${logloss(preds(test, best.wG, 0)).toFixed(4)} | csak piac ${logloss(preds(test, best.wG, 1)).toFixed(4)}`);

  // 2) kalibráció piaconként (teszt), Platt a tanítón
  const Ptr = preds(train, best.wG, best.wM);
  const platt = {};
  for (const name of Object.keys(MK)) {
    const tr = Ptr.map(({ s, k }) => MK[name](k, s)), te = Pbest.map(({ s, k }) => MK[name](k, s));
    const c = fitPlatt(tr);
    const f = p => sig(c.a + c.b * logit(clip(p)));
    const before = ll(te, p => p), after = ll(te, f);
    platt[name] = { a: +c.a.toFixed(3), b: +c.b.toFixed(3), before: +before.toFixed(4), after: +after.toFixed(4) };
    // tartományok
    const bins = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([lo, hi]) => {
      const sel = te.filter(([p]) => p >= lo && p < hi);
      if (sel.length < 20) return null;
      const avg = sel.reduce((x, [p]) => x + p, 0) / sel.length, hit = sel.filter(([, y]) => y).length / sel.length;
      return `${Math.round(lo * 100)}-${Math.round(Math.min(hi, 1) * 100)}%: mondott ${(avg * 100).toFixed(1)} / valós ${(hit * 100).toFixed(1)} (n=${sel.length})`;
    }).filter(Boolean);
    log(`[calib] ${name}: Platt a=${platt[name].a} b=${platt[name].b} logloss ${before.toFixed(4)}→${after.toFixed(4)} | ${bins.join(' | ')}`);
  }
  log(`[calib] PLATT ${JSON.stringify(Object.fromEntries(Object.entries(platt).map(([k, v]) => [k, [v.a, v.b]])))}`);
  log(`[calib] LEGJOBB_SULY ${JSON.stringify({ wGoals: best.wG, wMarket: best.wM })}`);
  return { best, platt };
}

module.exports = { runCalib };
