// Pontos végeredmény: képletek visszatesztelése régi meccseken.
// Minden meccsre csak a meccs ELŐTTI adatokból készül előrejelzés (hetente újraillesztett modell),
// a végeredményt csak az értékelésnél nézzük. Tanító időszakon hangoljuk a paramétereket,
// a független teszt időszakon mérjük a találati arányt.
const data = require('./data');
const { buildLeagueModel, predictMatch, CFG } = require('./model');

const MAXG = 10;
const lf = [0]; for (let i = 1; i <= 60; i++) lf[i] = lf[i - 1] + Math.log(i);
const pois = (k, l) => Math.exp(k * Math.log(l) - l - lf[k]);
function lgamma(z) { // Lanczos
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
const nb = (k, m, r) => Math.exp(lgamma(k + r) - lf[k] - lgamma(r) + r * Math.log(r / (r + m)) + k * Math.log(m / (r + m)));
const tau = (x, y, l, m, rho) => x === 0 && y === 0 ? 1 - l * m * rho : x === 0 && y === 1 ? 1 + l * rho : x === 1 && y === 0 ? 1 + m * rho : x === 1 && y === 1 ? 1 - rho : 1;

function norm(M) { let s = 0; M.forEach(r => r.forEach(p => s += p)); return M.map(r => r.map(p => p / s)); }
function build(f) { const M = []; for (let i = 0; i <= MAXG; i++) { M[i] = []; for (let j = 0; j <= MAXG; j++) M[i][j] = Math.max(f(i, j), 0); } return norm(M); }

// ---- képletek: (l, m, rho, param) -> mátrix ----
const MATRIX = {
  poisson: (l, m) => build((i, j) => pois(i, l) * pois(j, m)),
  dc: (l, m, rho) => build((i, j) => pois(i, l) * pois(j, m) * tau(i, j, l, m, rho)),
  dcRho: (l, m, _r, p) => build((i, j) => pois(i, l) * pois(j, m) * tau(i, j, l, m, p)),
  diag: (l, m, _r, p) => build((i, j) => pois(i, l) * pois(j, m) * (i === j ? 1 + p : 1)),
  bivPois: (l, m, _r, p) => {
    const l3 = p * Math.min(l, m), a = l - l3, b = m - l3;
    return build((x, y) => {
      let s = 0;
      for (let k = 0; k <= Math.min(x, y); k++) s += Math.exp((x - k) * Math.log(a) + (y - k) * Math.log(b) + (k ? k * Math.log(l3) : 0) - lf[x - k] - lf[y - k] - lf[k]);
      return Math.exp(-(a + b + l3)) * s;
    });
  },
  negBin: (l, m, _r, p) => build((i, j) => nb(i, l, p) * nb(j, m, p)),
};
const GRIDS = {
  poisson: [null], dc: [null],
  dcRho: [-0.3, -0.25, -0.2, -0.15, -0.1, -0.05, 0, 0.05],
  diag: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7],
  bivPois: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.75, 0.9],
  negBin: [3, 5, 8, 12, 20, 40],
};

// kiválasztás: legvalószínűbb / az 1X2 legvalószínűbb kimenetén belül
function pick(M, mode) {
  let best = null, h = 0, d = 0, a = 0;
  if (mode === 'cond') { for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) { if (i > j) h += M[i][j]; else if (i === j) d += M[i][j]; else a += M[i][j]; } }
  const out = mode === 'cond' ? (h >= d && h >= a ? 1 : a >= d ? -1 : 0) : null;
  for (let i = 0; i <= MAXG; i++) for (let j = 0; j <= MAXG; j++) {
    if (out !== null && Math.sign(i - j) !== out) continue;
    if (!best || M[i][j] > best.p) best = { i, j, p: M[i][j] };
  }
  return best;
}
function top3(M) {
  const a = []; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) a.push([i, j, M[i][j]]);
  return a.sort((x, y) => y[2] - x[2]).slice(0, 3);
}

// empirikus kalibráció: cellánkénti megfigyelt/várt arány a tanító időszakból (shrinkage-dzsel)
function calibration(train, method, param, lamKey, shrink = 25) {
  const O = Array.from({ length: 6 }, () => new Array(6).fill(0)), E = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (const s of train) {
    const M = MATRIX[method](s[lamKey][0], s[lamKey][1], s.rho, param);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) E[i][j] += M[i][j];
    if (s.hg < 6 && s.ag < 6) O[s.hg][s.ag]++;
  }
  return O.map((r, i) => r.map((o, j) => (o + shrink) / (E[i][j] + shrink)));
}
function applyCal(M, R) {
  return norm(M.map((r, i) => r.map((p, j) => (i < 6 && j < 6 ? p * R[i][j] : p))));
}

function evaluate(samples, method, param, lamKey, mode, R) {
  let hit = 0, t3 = 0, ll = 0;
  for (const s of samples) {
    let M = MATRIX[method](s[lamKey][0], s[lamKey][1], s.rho, param);
    if (R) M = applyCal(M, R);
    const b = pick(M, mode);
    if (b.i === s.hg && b.j === s.ag) hit++;
    if (top3(M).some(([i, j]) => i === s.hg && j === s.ag)) t3++;
    ll += -Math.log(Math.max(s.hg <= MAXG && s.ag <= MAXG ? M[s.hg][s.ag] : 1e-6, 1e-9));
  }
  const n = samples.length;
  return { hit: hit / n, top3: t3 / n, ll: ll / n, n };
}

// ---- adatgyűjtés: walk-forward előrejelzések ----
async function collect(from, to, leagues, log) {
  const samples = [];
  const DAY = 86400000;
  for (const lg of leagues) {
    let cnt = 0;
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
        samples.push({ lg, date: m.date, hg: m.hg, ag: m.ag, rho: p.rho, fin: [L.final.l, L.final.m], mod: [L.model.l, L.model.m] });
        cnt++;
      }
    }
    log(`[study] ${lg}: ${cnt} meccs`);
  }
  return samples;
}

async function runStudy(opts = {}, log = console.log) {
  const from = opts.from || '2024-09-01', to = opts.to || new Date().toISOString().slice(0, 10), split = opts.split || '2025-12-01';
  const leagues = opts.leagues || ['E0', 'E1', 'E2', 'E3', 'SC0', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1'];
  const t0 = Date.now();
  const samples = await collect(from, to, leagues, log);
  const train = samples.filter(s => s.date < split), test = samples.filter(s => s.date >= split);
  log(`[study] összesen ${samples.length} meccs (tanító ${train.length}, teszt ${test.length}), ${Math.round((Date.now() - t0) / 1000)} mp`);

  // tényleges eredmények eloszlása (tájékoztató)
  const freq = {}; test.forEach(s => { const k = `${s.hg}-${s.ag}`; freq[k] = (freq[k] || 0) + 1; });
  log(`[study] leggyakoribb eredmények a tesztben: ${Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${(v / test.length * 100).toFixed(1)}%`).join(', ')}`);

  const results = [];
  for (const lamKey of opts.lamKeys || ['fin']) {
    for (const method of Object.keys(MATRIX)) {
      for (const mode of ['max']) {
        for (const cal of [false, true]) {
          // paraméter hangolása a tanító halmazon (log-likelihood + találat)
          let bestP = null, bestScore = -Infinity, bestR = null;
          for (const p of GRIDS[method]) {
            const R = cal ? calibration(train, method, p, lamKey) : null;
            const ev = evaluate(train, method, p, lamKey, mode, R);
            const score = ev.hit - 0.02 * ev.ll; // elsődleges: találat, másodlagos: valószínűségi pontosság
            if (score > bestScore) { bestScore = score; bestP = p; bestR = R; }
          }
          const R = cal ? calibration(train, method, bestP, lamKey) : null;
          const ev = evaluate(test, method, bestP, lamKey, mode, R);
          results.push({ lam: lamKey, method, param: bestP, mode, cal, ...ev });
        }
      }
    }
  }
  results.sort((a, b) => b.hit - a.hit || a.ll - b.ll);
  const fmt = r => `${r.lam}/${r.method}${r.param !== null ? `(${r.param})` : ''}/${r.mode}${r.cal ? '/kalibrált' : ''}: találat ${(r.hit * 100).toFixed(2)}% | top3 ${(r.top3 * 100).toFixed(1)}% | logloss ${r.ll.toFixed(4)}`;
  log('[study] ===== EREDMÉNY (teszt időszak, a végeredmény a tippeléskor nem volt ismert) =====');
  results.slice(0, 25).forEach((r, i) => log(`[study] #${i + 1} ${fmt(r)}`));
  const base = results.find(r => r.lam === 'fin' && r.method === 'dc' && r.mode === 'max' && !r.cal);
  log(`[study] jelenlegi módszer: ${fmt(base)}`);
  // a nyertes kalibrációs mátrixa a teljes adaton (alkalmazáshoz)
  const w = results[0];
  if (w.cal) {
    const R = calibration(samples, w.method, w.param, w.lam);
    log(`[study] NYERTES_KALIBRACIO ${JSON.stringify(R.map(r => r.map(x => Math.round(x * 1000) / 1000)))}`);
  }
  // naiv viszonyítás: mindig 1-1 / mindig 1-0
  for (const sc of ['1-1', '1-0', '2-1']) log(`[study] naiv "mindig ${sc}": ${((freq[sc] || 0) / test.length * 100).toFixed(2)}%`);
  return { results, n: samples.length };
}

module.exports = { runStudy, MATRIX, pick, applyCal };
