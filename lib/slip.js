// Szelvénykészítő: adott cél-oddshoz a legnagyobb nyerési esélyű Tippmix-kombináció.
// Optimalizálás: max Σ log(p)  feltéve, hogy  Σ log(odds) ≥ log(cél), meccsenként legfeljebb 1 tipp,
// a Tippmix "min. kötés" szabályát betartva (csoportos hátizsák, dinamikus programozás).
const analysis = require('./analysis');

const RES = 800; // log-odds felbontás (0,125%)

function nowBudapest() {
  const f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  return f.format(new Date()).replace(' ', 'T'); // "YYYY-MM-DDTHH:MM"
}
function addDays(d, k) { return new Date(Date.parse(d) + k * 86400000).toISOString().slice(0, 10); }

async function candidates(days, onlyModel, allMarkets) {
  const now = nowBudapest();
  const today = now.slice(0, 10);
  const out = new Map();
  for (let k = 0; k < days; k++) {
    const date = addDays(today, k);
    const ms = await analysis.quickForDate(date);
    for (const m of ms) {
      if (!m.tm || m.played) continue;
      const when = `${m.tm.date}T${m.tm.time || '00:00'}`;
      if (when <= now) continue;
      const label = { '1': m.home, 'X': 'Döntetlen', '2': m.away };
      const opts = m.tm.rows.map(r => ({ pick: r.pick, label: label[r.pick], market: '1X2', num: m.tm.num, odds: r.odds, p: r.p / 100 }));
      if (allMarkets && m.lam) {
        const [h, a] = m.tm.name.split(' - ');
        const ex = await analysis.extraMarkets(m.tm, m.lam, h, a).catch(() => null);
        for (const r of ex || []) {
          if (/pontos/i.test(r.market)) continue;
          opts.push({ pick: r.code || r.name, label: r.name, market: r.market, num: r.num, odds: r.odds, p: r.p });
        }
      }
      out.set(m.tm.num, {
        num: m.tm.num, minCombi: m.tm.minCombi || 1, date: m.tm.date, time: m.tm.time, league: `${m.country} – ${m.leagueName}`,
        name: m.tm.name, src: 'modell', opts, ref: m.ref || null,
      });
    }
    if (!onlyModel) {
      const nums = new Set(ms.filter(m => m.tm).map(m => m.tm.num));
      const only = await analysis.tippmixOnly(date, nums);
      for (const o of only) {
        if (out.has(o.num)) continue;
        if (`${o.date}T${o.time || '00:00'}` <= now) continue;
        out.set(o.num, {
          num: o.num, minCombi: o.minCombi || 1, date: o.date, time: o.time, league: o.league, name: `${o.home} - ${o.away}`, src: 'szorzó',
          opts: [['1', o.home, o.odds.h, o.prob.h], ['X', 'Döntetlen', o.odds.d, o.prob.d], ['2', o.away, o.odds.a, o.prob.a]]
            .map(([pick, label, odds, p]) => ({ pick, label, odds, p, market: '1X2', num: o.num })),
        });
      }
    }
  }
  return [...out.values()];
}

function solve(G, K, W) {
  const NEG = -1e18;
  let dp = Array.from({ length: K + 1 }, () => new Float64Array(W + 1).fill(NEG));
  dp[0][0] = 0;
  const chs = [];
  for (const g of G) {
    const nd = dp.map(r => Float64Array.from(r));
    const ch = Array.from({ length: K + 1 }, () => new Int16Array(W + 1).fill(-1));
    const from = Array.from({ length: K + 1 }, () => new Int32Array(W + 1).fill(-1));
    g.opts.forEach((o, oi) => {
      const w = Math.max(0, Math.round(Math.log(o.odds) * RES)), v = Math.log(Math.max(o.p, 1e-6));
      for (let k = K - 1; k >= 0; k--) {
        const row = dp[k], nrow = nd[k + 1];
        for (let x = 0; x <= W; x++) {
          if (row[x] === NEG) continue;
          const y = Math.min(W, x + w), val = row[x] + v;
          if (val > nrow[y]) { nrow[y] = val; ch[k + 1][y] = oi; from[k + 1][y] = x; }
        }
      }
    });
    chs.push({ ch, from });
    dp = nd;
  }
  if (dp[K][W] === NEG) return null;
  const legs = [];
  let k = K, w = W;
  for (let gi = G.length - 1; gi >= 0 && k > 0; gi--) {
    const { ch, from } = chs[gi];
    if (ch[k][w] >= 0) {
      const o = G[gi].opts[ch[k][w]];
      const { opts, ...rest } = G[gi];
      legs.push({ ...rest, exNum: rest.num, num: o.num || rest.num, market: o.market || '1X2', pick: o.pick, label: o.label, odds: o.odds, p: o.p });
      w = from[k][w]; k--;
    }
  }
  return { v: dp[K][W], legs: legs.reverse() };
}

// pontosan K tipp, mindegyik min. kötése <= K; a legjobb K-t választjuk
function optimize(groups, target, maxLegs) {
  const W = Math.ceil(Math.log(target) * RES);
  let best = null;
  for (let K = 1; K <= maxLegs; K++) {
    const G = groups.filter(g => g.minCombi <= K);
    if (G.length < K) continue;
    const r = solve(G, K, W);
    if (r && (!best || r.v > best.v)) best = r;
  }
  return best ? best.legs : null;
}

async function buildSlip({ target = 5, days = 1, maxLegs = 6, onlyModel = false, exclude = [], stake = 1000, minLegP = 0, allMarkets = true }) {
  target = Math.min(Math.max(target, 1.1), 5000);
  maxLegs = Math.min(Math.max(maxLegs, 1), 12);
  const cands = (await candidates(Math.min(Math.max(days, 1), 4), onlyModel, allMarkets))
    .filter(c => !exclude.includes(c.num))
    .map(c => ({ ...c, opts: c.opts.filter(o => o.odds >= 1.05 && o.p >= minLegP).map(o => ({ ...o, p: Math.min(o.p, 0.97) })) }))
    .filter(c => c.opts.length);
  const legs = optimize(cands, target, maxLegs);
  const base = { target, candidates: cands.length, modelCandidates: cands.filter(c => c.src === 'modell').length };
  if (!legs) return { ...base, error: 'Ezekkel a beállításokkal nem lehet elérni a cél oddsot (kevés meccs vagy túl kevés kötés engedélyezve).' };
  const odds = legs.reduce((x, l) => x * l.odds, 1), p = legs.reduce((x, l) => x * l.p, 1);
  // legjobb szimpla tippek (tájékoztató)
  const singles = cands.flatMap(c => c.opts.map(o => ({ ref: c.ref, name: c.name, league: c.league, date: c.date, time: c.time, src: c.src, minCombi: c.minCombi, ...o, ev: o.p * o.odds - 1 })))
    .filter(x => x.minCombi === 1).sort((a, b) => b.p - a.p).slice(0, 8);
  return {
    ...base, legs: legs.map(l => ({ ...l, ev: l.p * l.odds - 1 })),
    totalOdds: odds, winP: p, ev: p * odds - 1, stake, payout: Math.round(stake * odds),
    fairOdds: 1 / p, singles,
  };
}

module.exports = { buildSlip };
