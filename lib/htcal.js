// Első félidő kalibráció: a teljes meccsre várt gólok hányad része esik az 1. félidőre,
// és mennyire pontos a P(1. félidő 0,5 felett) becslés (walk-forward, csak múltbeli adatokkal).
const data = require('./data');
const { buildLeagueModel, predictMatch, CFG } = require('./model');
const LEAGUES = ['E0', 'E1', 'E2', 'E3', 'SC0', 'D1', 'D2', 'I1', 'I2', 'SP1', 'SP2', 'F1', 'F2', 'N1', 'B1', 'P1', 'T1', 'G1'];

async function runHT(log = console.log) {
  const S = [], DAY = 86400000, from = '2024-09-01', to = new Date().toISOString().slice(0, 10);
  for (const lg of LEAGUES) {
    for (let t = Date.parse(from); t < Date.parse(to); t += 7 * DAY) {
      const d0 = new Date(t).toISOString().slice(0, 10), d1 = new Date(t + 7 * DAY).toISOString().slice(0, 10);
      const all = await data.leagueMatches(lg, d0);
      const wk = all.filter(m => m.played && m.hthg != null && m.htag != null && m.date >= d0 && m.date < d1);
      if (!wk.length) continue;
      const model = buildLeagueModel(all, d0, CFG);
      if (!model) continue;
      for (const m of wk) {
        const p = predictMatch(model, m); if (!p) continue;
        S.push({ lg, date: m.date, l: p.lambdas.final.l, m: p.lambdas.final.m, hh: m.hthg, ha: m.htag, fh: m.hg, fa: m.ag });
      }
    }
  }
  const split = '2025-12-01', tr = S.filter(s => s.date < split), te = S.filter(s => s.date >= split);
  // 1) arány (Poisson MLE): s = Σ félidős gól / Σ várt teljes gól — külön hazai/vendég
  const sh = tr.reduce((x, s) => x + s.hh, 0) / tr.reduce((x, s) => x + s.l, 0);
  const sa = tr.reduce((x, s) => x + s.ha, 0) / tr.reduce((x, s) => x + s.m, 0);
  const ll = (D, f) => D.reduce((x, s) => { const p = Math.min(1 - 1e-9, Math.max(1e-9, f(s))); return x - Math.log((s.hh + s.ha > 0) ? p : 1 - p); }, 0) / D.length;
  const pO = (s, a, b) => 1 - Math.exp(-(a * s.l + b * s.m));
  log(`[ht] ${S.length} meccs (tanító ${tr.length}, teszt ${te.length}); 1. félidős arány hazai ${sh.toFixed(3)}, vendég ${sa.toFixed(3)}; valós 0,5 felett arány teszt: ${(te.filter(s => s.hh + s.ha > 0).length / te.length * 100).toFixed(1)}%`);
  log(`[ht] teszt log-loss 0,5 felett: fix 0.45 arány ${ll(te, s => pO(s, 0.45, 0.45)).toFixed(4)} | illesztett ${ll(te, s => pO(s, sh, sa)).toFixed(4)} | konstans ${ll(te, () => te.filter(s => s.hh + s.ha > 0).length / te.length).toFixed(4)}`);
  // 2) Platt-korrekció (túldiszperzió) a tanítón
  const lg2 = p => Math.log(p / (1 - p)), sg = x => 1 / (1 + Math.exp(-x));
  let a = 0, b = 1;
  for (let it = 0; it < 800; it++) { let ga = 0, gb = 0; for (const s of tr) { const x = lg2(Math.min(1 - 1e-6, pO(s, sh, sa))), q = sg(a + b * x), e = (s.hh + s.ha > 0 ? 1 : 0) - q; ga += e; gb += e * x; } a += 0.5 * ga / tr.length; b += 0.5 * gb / tr.length; }
  log(`[ht] Platt a=${a.toFixed(3)} b=${b.toFixed(3)} teszt log-loss ${ll(te, s => sg(a + b * lg2(Math.min(1 - 1e-6, pO(s, sh, sa))))).toFixed(4)}`);
  const bins = [[0.5, 0.6], [0.6, 0.65], [0.65, 0.7], [0.7, 0.75], [0.75, 0.8], [0.8, 0.9]].map(([lo, hi]) => {
    const sel = te.filter(s => { const p = pO(s, sh, sa); return p >= lo && p < hi; }); if (sel.length < 30) return null;
    return `${lo * 100}-${hi * 100}%: mondott ${(sel.reduce((x, s) => x + pO(s, sh, sa), 0) / sel.length * 100).toFixed(1)} / valós ${(sel.filter(s => s.hh + s.ha > 0).length / sel.length * 100).toFixed(1)} (n=${sel.length})`;
  }).filter(Boolean);
  log('[ht] kalibráció: ' + bins.join(' | '));
  // 1. félidő 1,5 felett és 1X2
  const p15 = s => { const L = sh * s.l + sa * s.m; return 1 - Math.exp(-L) * (1 + L); };
  log(`[ht] 1,5 felett teszt: mondott ${(te.reduce((x, s) => x + p15(s), 0) / te.length * 100).toFixed(1)}% / valós ${(te.filter(s => s.hh + s.ha > 1).length / te.length * 100).toFixed(1)}%`);
  log(`[ht] HT_PARAMS ${JSON.stringify({ sh: +sh.toFixed(4), sa: +sa.toFixed(4), platt: [+a.toFixed(3), +b.toFixed(3)] })}`);
}
module.exports = { runHT };
