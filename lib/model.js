// Matematikai modellek
// 1) Dixon–Coles (1997) bivariáns Poisson, alacsony-eredmény korrekcióval (rho),
//    exponenciális időbeli súlyozással, ridge-regularizációval (Bayes-i shrinkage)
// 2) Kapura lövés alapú "xG-proxy" Poisson modell (stabilabb, kevésbé zajos mint a gól)
// 3) Piaci (fogadóirodai) valószínűségek marzs nélkül (power-módszer), és
//    ebből visszaszámolt piaci gólvárhatóság
// 4) Ensemble: a várható gólok geometriai súlyozott átlaga -> egységes eredménymátrix

const DAY = 86400000;
const MAXG = 10;

// ----- Poisson -----
const logFact = [0];
for (let i = 1; i <= 40; i++) logFact[i] = logFact[i - 1] + Math.log(i);
const pois = (k, l) => Math.exp(k * Math.log(l) - l - logFact[k]);

function tau(x, y, l, m, rho) {
  if (x === 0 && y === 0) return 1 - l * m * rho;
  if (x === 0 && y === 1) return 1 + l * rho;
  if (x === 1 && y === 0) return 1 + m * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Csapaterősség illesztése maximum likelihood-dal (Adam optimalizáló).
 * matches: [{home, away, x, y, w}]  x,y: hazai/vendég "gól" (vagy kapura lövés)
 * λ = exp(c + h + att[home] + def[away]),  μ = exp(c + att[away] + def[home])
 */
function fitStrengths(matches, { useTau = true, ridge = 3, iters = 700, priorMean = {} } = {}) {
  const teams = [...new Set(matches.flatMap(m => [m.home, m.away]))];
  const idx = new Map(teams.map((t, i) => [t, i]));
  const n = teams.length;
  const NP = 2 * n + 3; // att[n], def[n], c, h, rho
  const iC = 2 * n, iH = 2 * n + 1, iR = 2 * n + 2;
  const P = new Float64Array(NP);
  let sw = 0, sx = 0, sy = 0;
  for (const m of matches) { sw += m.w; sx += m.w * m.x; sy += m.w * m.y; }
  if (sw === 0 || n < 2) return null;
  const meanX = Math.max(sx / sw, 0.05), meanY = Math.max(sy / sw, 0.05);
  P[iC] = Math.log(meanY);
  P[iH] = Math.log(meanX / meanY);
  const pm = new Float64Array(2 * n);
  teams.forEach((t, i) => {
    if (priorMean[t]) { pm[i] = priorMean[t][0]; pm[n + i] = priorMean[t][1]; }
    P[i] = pm[i]; P[n + i] = pm[n + i];
  });
  const rows = matches.map(m => [idx.get(m.home), idx.get(m.away), m.x, m.y, m.w, m.hf == null ? 1 : m.hf]);

  const mA = new Float64Array(NP), vA = new Float64Array(NP), G = new Float64Array(NP);
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  let lr = 0.05;
  for (let it = 1; it <= iters; it++) {
    G.fill(0);
    const rho = useTau ? P[iR] : 0;
    for (const [hi, ai, x, y, w, hf] of rows) {
      const ll = Math.exp(P[iC] + hf * P[iH] + P[hi] + P[n + ai]);
      const mu = Math.exp(P[iC] + P[ai] + P[n + hi]);
      let gl = x - ll, gm = y - mu, gr = 0;
      if (useTau && x <= 1 && y <= 1) {
        const t = Math.max(tau(x, y, ll, mu, rho), 1e-6);
        if (x === 0 && y === 0) { gl += ll * (-mu * rho) / t; gm += mu * (-ll * rho) / t; gr = -ll * mu / t; }
        else if (x === 0 && y === 1) { gl += ll * rho / t; gr = ll / t; }
        else if (x === 1 && y === 0) { gm += mu * rho / t; gr = mu / t; }
        else { gr = -1 / t; }
      }
      gl *= w; gm *= w;
      G[iC] += gl + gm; G[iH] += gl * hf;
      G[hi] += gl; G[n + ai] += gl;
      G[ai] += gm; G[n + hi] += gm;
      G[iR] += w * gr;
    }
    for (let i = 0; i < 2 * n; i++) G[i] -= 2 * ridge * (P[i] - pm[i]);
    // Adam (maximalizálás)
    if (it === Math.floor(iters * 0.6)) lr = 0.015;
    for (let i = 0; i < NP; i++) {
      if (i === iR && !useTau) continue;
      const g = G[i] / sw;
      mA[i] = b1 * mA[i] + (1 - b1) * g;
      vA[i] = b2 * vA[i] + (1 - b2) * g * g;
      const mh = mA[i] / (1 - b1 ** it), vh = vA[i] / (1 - b2 ** it);
      P[i] += lr * mh / (Math.sqrt(vh) + eps);
    }
    if (useTau) P[iR] = Math.min(0.2, Math.max(-0.2, P[iR]));
  }
  const strength = {};
  teams.forEach((t, i) => { strength[t] = { att: P[i], def: P[n + i] }; });
  return {
    teams: idx, strength, c: P[iC], home: P[iH], rho: useTau ? P[iR] : 0,
    predict(home, away, hf = 1) {
      if (!idx.has(home) || !idx.has(away)) return null;
      const h = idx.get(home), a = idx.get(away);
      return {
        l: Math.exp(P[iC] + hf * P[iH] + P[h] + P[n + a]),
        m: Math.exp(P[iC] + P[a] + P[n + h]),
      };
    },
  };
}

// ----- Eredménymátrix és piacok -----
function scoreMatrix(l, m, rho = 0) {
  const M = [];
  let s = 0;
  for (let i = 0; i <= MAXG; i++) {
    M[i] = [];
    for (let j = 0; j <= MAXG; j++) {
      const p = pois(i, l) * pois(j, m) * Math.max(tau(i, j, l, m, rho), 0);
      M[i][j] = p; s += p;
    }
  }
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) M[i][j] /= s;
  return M;
}

function markets(M) {
  let h = 0, d = 0, a = 0, btts = 0;
  const totals = new Array(2 * MAXG + 1).fill(0);
  const homeG = new Array(MAXG + 1).fill(0), awayG = new Array(MAXG + 1).fill(0);
  const scores = [];
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    const p = M[i][j];
    if (i > j) h += p; else if (i === j) d += p; else a += p;
    if (i > 0 && j > 0) btts += p;
    totals[i + j] += p; homeG[i] += p; awayG[j] += p;
    scores.push({ score: `${i}-${j}`, h: i, a: j, p });
  }
  scores.sort((x, y) => y.p - x.p);
  const ou = {};
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]) {
    let under = 0;
    for (let k = 0; k < line; k++) under += totals[k];
    ou[line] = { over: 1 - under, under };
  }
  const teamOver = (arr, line) => { let u = 0; for (let k = 0; k < line; k++) u += arr[k]; return 1 - u; };
  // gólszám-sávok
  const bands = {
    '0-1': totals[0] + totals[1],
    '2-3': totals[2] + totals[3],
    '4-5': totals[4] + totals[5],
    '6+': 1 - totals.slice(0, 6).reduce((x, y) => x + y, 0),
  };
  const exp = totals.reduce((s, p, k) => s + p * k, 0);
  return {
    x12: { h, d, a }, dc: { '1X': h + d, '12': h + a, 'X2': d + a },
    btts: { yes: btts, no: 1 - btts }, ou, bands, totals: totals.slice(0, 9),
    homeOver: { 0.5: teamOver(homeG, 0.5), 1.5: teamOver(homeG, 1.5), 2.5: teamOver(homeG, 2.5) },
    awayOver: { 0.5: teamOver(awayG, 0.5), 1.5: teamOver(awayG, 1.5), 2.5: teamOver(awayG, 2.5) },
    cleanSheet: { home: awayG[0], away: homeG[0] },
    expGoals: exp, topScores: scores.slice(0, 10),
    matrix: M.slice(0, 7).map(r => r.slice(0, 7)),
  };
}

// ----- Pontos végeredmény: a visszatesztelés nyertese -----
// 14 328 meccs (18 liga, 2024/25–2026/27) walk-forward tesztje alapján, 5 865 független tesztmeccsen:
// bivariáns Poisson (közös gólkomponens = 0,3 × kisebb várható gól) + empirikus cellánkénti kalibráció.
// Találati arány 13,15% (korábbi Dixon–Coles: 12,77%, "mindig 1-1": 11,95%), top3: 33,4%.
const EXACT_COV = 0.3;
const EXACT_CAL = [[0.71,0.898,1.187,1.581,1.646,1.592],[0.938,1.033,1.137,1.069,1.075,1.162],[1.029,1.092,1.106,0.875,0.653,0.975],[1.33,1.058,0.919,0.819,0.684,0.784],[1.366,0.945,0.717,0.666,0.635,0.745],[1.479,1.13,0.782,0.665,0.77,0.887]];
function exactScoreMatrix(l, m) {
  const l3 = EXACT_COV * Math.min(l, m), a = l - l3, b = m - l3;
  const M = []; let s = 0;
  for (let x = 0; x <= MAXG; x++) {
    M[x] = [];
    for (let y = 0; y <= MAXG; y++) {
      let p = 0;
      for (let k = 0; k <= Math.min(x, y); k++) p += Math.exp((x - k) * Math.log(a) + (y - k) * Math.log(b) + (k ? k * Math.log(l3) : 0) - logFact[x - k] - logFact[y - k] - logFact[k]);
      p *= Math.exp(-(a + b + l3));
      if (x < 6 && y < 6) p *= EXACT_CAL[x][y];
      M[x][y] = p; s += p;
    }
  }
  for (let x = 0; x <= MAXG; x++) for (let y = 0; y <= MAXG; y++) M[x][y] /= s;
  return M;
}
function applyExact(mk, l, m) {
  const E = exactScoreMatrix(l, m);
  const scores = [];
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) scores.push({ score: `${i}-${j}`, h: i, a: j, p: E[i][j] });
  scores.sort((x, y) => y.p - x.p);
  mk.topScores = scores.slice(0, 10);
  mk.matrix = E.slice(0, 7).map(r => r.slice(0, 7));
  return mk;
}

// ----- Piaci szorzók -> valószínűség (power-módszer marzs-eltávolítás) -----
function devig(odds) {
  const inv = odds.map(o => 1 / o);
  const book = inv.reduce((a, b) => a + b, 0);
  let lo = 0.5, hi = 2;
  for (let i = 0; i < 60; i++) {
    const k = (lo + hi) / 2;
    const s = inv.reduce((acc, p) => acc + p ** k, 0);
    if (s > 1) lo = k; else hi = k;
  }
  const k = (lo + hi) / 2;
  return { probs: inv.map(p => p ** k), margin: book - 1 };
}

// Piaci valószínűségekből visszaszámolt várható gólok (Nelder–Mead)
function impliedLambdas(target, rho, start) {
  const f = ([a, b]) => {
    const l = Math.exp(a), m = Math.exp(b);
    const mk = markets(scoreMatrix(l, m, rho));
    let e = 0;
    if (target.x12) {
      e += (mk.x12.h - target.x12[0]) ** 2 + (mk.x12.d - target.x12[1]) ** 2 + (mk.x12.a - target.x12[2]) ** 2;
    }
    if (target.over25 != null) e += 1.5 * (mk.ou[2.5].over - target.over25) ** 2;
    return e;
  };
  let S = [[Math.log(start.l), Math.log(start.m)]];
  S.push([S[0][0] + 0.15, S[0][1]], [S[0][0], S[0][1] + 0.15]);
  let F = S.map(f);
  for (let it = 0; it < 120; it++) {
    const o = [0, 1, 2].sort((i, j) => F[i] - F[j]);
    S = o.map(i => S[i]); F = o.map(i => F[i]);
    const c = [(S[0][0] + S[1][0]) / 2, (S[0][1] + S[1][1]) / 2];
    const r = [2 * c[0] - S[2][0], 2 * c[1] - S[2][1]], fr = f(r);
    if (fr < F[0]) {
      const e = [3 * c[0] - 2 * S[2][0], 3 * c[1] - 2 * S[2][1]], fe = f(e);
      if (fe < fr) { S[2] = e; F[2] = fe; } else { S[2] = r; F[2] = fr; }
    } else if (fr < F[1]) { S[2] = r; F[2] = fr; }
    else {
      const k = [(c[0] + S[2][0]) / 2, (c[1] + S[2][1]) / 2], fk = f(k);
      if (fk < F[2]) { S[2] = k; F[2] = fk; }
      else { for (let i = 1; i < 3; i++) { S[i] = [(S[0][0] + S[i][0]) / 2, (S[0][1] + S[i][1]) / 2]; F[i] = f(S[i]); } }
    }
    if (Math.abs(F[2] - F[0]) < 1e-12) break;
  }
  return { l: Math.exp(S[0][0]), m: Math.exp(S[0][1]) };
}

// ----- Liga-modell építése egy adott dátumra (csak a dátum ELŐTTI adatokból) -----
const CFG = {
  xi: 0.0019,         // időbeli lecsengés / nap (felezési idő ~1 év, Dixon–Coles optimum)
  windowDays: 760,
  // 2026-11 kalibrációs mérés (14 473 meccs, 18 liga, walk-forward): a legjobb a piaci (Pinnacle) esély,
  // a statisztikai modell csak ott dönt, ahol nincs szorzó. Teszt log-loss: piac 2.3551 < keverék 2.3607 < modell 2.3844.
  wGoals: 0.3,        // modellen belül: gól-alapú vs. kapura lövés alapú (lövés-modell erősebb)
  wMarket: 1.0,       // végső keverés: piac súlya (ha van szorzó)
  newcomerPrior: [-0.18, 0.18], // feljutó / új csapat: gyengébb támadás, gyengébb védekezés
};

function buildLeagueModel(allMatches, date, cfg = CFG) {
  const t0 = Date.parse(date);
  const past = allMatches.filter(m => m.played && Date.parse(m.date) < t0 && (t0 - Date.parse(m.date)) / DAY <= cfg.windowDays);
  if (past.length < 30) return null;
  const w = m => Math.exp(-cfg.xi * (t0 - Date.parse(m.date)) / DAY);
  // feljutók: az aktuális szezonban szerepelnek, de az előzőben nem
  const curStart = Date.parse(`${(new Date(t0).getUTCMonth() >= 6 ? new Date(t0).getUTCFullYear() : new Date(t0).getUTCFullYear() - 1)}-07-01`);
  const recent = past.filter(m => Date.parse(m.date) >= curStart);
  const older = new Set(past.filter(m => Date.parse(m.date) < curStart).flatMap(m => [m.home, m.away]));
  const priorMean = {};
  if (older.size > 0) recent.forEach(m => [m.home, m.away].forEach(t => { if (!older.has(t)) priorMean[t] = cfg.newcomerPrior; }));

  const goalRows = past.map(m => ({ home: m.home, away: m.away, x: m.hg, y: m.ag, w: w(m) }));
  const goals = fitStrengths(goalRows, { useTau: true, priorMean });
  const sotPast = past.filter(m => m.hst != null && m.ast != null);
  let sot = null, conv = null;
  if (sotPast.length >= past.length * 0.7) {
    const rows = sotPast.map(m => ({ home: m.home, away: m.away, x: m.hst, y: m.ast, w: w(m) }));
    // a lövésszám kevésbé zajos -> kisebb ridge elég
    sot = fitStrengths(rows, { useTau: false, ridge: 1.5, priorMean });
    let g = 0, s = 0;
    sotPast.forEach(m => { const ww = w(m); g += ww * (m.hg + m.ag); s += ww * (m.hst + m.ast); });
    conv = g / s;
  }
  return { goals, sot, conv, cfg, past, nMatches: past.length };
}

function predictMatch(model, match) {
  const { goals, sot, conv, cfg } = model;
  const pg = goals.predict(match.home, match.away);
  if (!pg) return null;
  let l = pg.l, m = pg.m;
  let ps = null;
  if (sot) {
    const p = sot.predict(match.home, match.away);
    if (p) {
      ps = { l: p.l * conv, m: p.m * conv };
      l = Math.exp(cfg.wGoals * Math.log(pg.l) + (1 - cfg.wGoals) * Math.log(ps.l));
      m = Math.exp(cfg.wGoals * Math.log(pg.m) + (1 - cfg.wGoals) * Math.log(ps.m));
    }
  }
  const rho = goals.rho;
  const model1 = { l, m };
  let market = null, final = { ...model1 }, marketProbs = null;
  const o = match.odds;
  if (o && (o.h || o.over)) {
    const target = {};
    if (o.h) { const dv = devig([o.h, o.d, o.a]); target.x12 = dv.probs; marketProbs = { x12: dv.probs, margin: dv.margin }; }
    if (o.over && o.under) { const dv = devig([o.over, o.under]); target.over25 = dv.probs[0]; marketProbs = { ...(marketProbs || {}), over25: dv.probs[0] }; }
    market = impliedLambdas(target, rho, model1);
    const wM = target.x12 ? cfg.wMarket : cfg.wMarket * 0.5;
    final = {
      l: Math.exp((1 - wM) * Math.log(l) + wM * Math.log(market.l)),
      m: Math.exp((1 - wM) * Math.log(m) + wM * Math.log(market.m)),
    };
  }
  return {
    lambdas: { goals: pg, sot: ps, model: model1, market, final },
    rho,
    model: markets(scoreMatrix(model1.l, model1.m, rho)),
    marketMk: market ? markets(scoreMatrix(market.l, market.m, rho)) : null,
    final: applyExact(markets(scoreMatrix(final.l, final.m, rho)), final.l, final.m),
    marketProbs,
  };
}

module.exports = { applyExact, exactScoreMatrix, fitStrengths, scoreMatrix, markets, devig, impliedLambdas, buildLeagueModel, predictMatch, CFG };
