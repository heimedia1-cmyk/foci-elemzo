// Élő elemzés: ESPN ingyenes élő eredmények + meccs előtti modell + hátralévő idő Poisson-folyamata.
// Figyelembe veszi: hátralévő percek (a gólok ~55%-a a 2. félidőben esik), eddigi gólok (Bayes-i frissítés),
// piros lapok, és az állás hatását (a vesztésre álló csapat jobban támad).
const national = require('./national');
const tippmix = require('./tippmix');
const { devig, impliedLambdas, htMarkets, HT_PARAMS } = require('./model');
const ll = require('./livelearn');

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard';
let cache = { t: 0, p: null };

// ESPN -> válogatott-adatbázis nevek
const ALIAS = {
  'Congo DR': 'DR Congo', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina', 'Türkiye': 'Turkey', 'Czechia': 'Czech Republic',
  'USA': 'United States', 'Ireland': 'Republic of Ireland', "Côte d'Ivoire": 'Ivory Coast', 'Korea Republic': 'South Korea', 'South Korea': 'South Korea',
  'Cape Verde Islands': 'Cape Verde', 'Curacao': 'Curaçao', 'Chinese Taipei': 'Taiwan', 'Kyrgyz Republic': 'Kyrgyzstan', 'IR Iran': 'Iran',
  'Gambia': 'Gambia', 'The Gambia': 'Gambia', 'Sao Tome and Principe': 'São Tomé and Príncipe', 'St. Kitts and Nevis': 'Saint Kitts and Nevis',
  'St. Lucia': 'Saint Lucia', 'St. Vincent and the Grenadines': 'Saint Vincent and the Grenadines', 'Eswatini': 'Eswatini', 'Swaziland': 'Eswatini',
  'North Macedonia': 'North Macedonia', 'Timor-Leste': 'Timor-Leste', 'East Timor': 'Timor-Leste', 'US Virgin Islands': 'United States Virgin Islands',
  'Congo': 'Congo', 'Brunei Darussalam': 'Brunei', 'Hong Kong, China': 'Hong Kong',
};
const enName = n => ALIAS[n] || n;

async function scoreboard() {
  if (cache.p && Date.now() - cache.t < 30 * 1000) return cache.p;
  cache = { t: Date.now(), p: (async () => {
    try {
      const r = await fetch(ESPN, { headers: { 'User-Agent': 'Mozilla/5.0 (foci-elemzo)' } });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.events || []).map(parseEvent).filter(Boolean);
    } catch (e) { return []; }
  })() };
  return cache.p;
}

function parseEvent(e) {
  const c = e.competitions && e.competitions[0];
  if (!c || !c.competitors || c.competitors.length !== 2) return null;
  const H = c.competitors.find(x => x.homeAway === 'home'), A = c.competitors.find(x => x.homeAway === 'away');
  const st = e.status || {}, type = st.type || {};
  const reds = { h: 0, a: 0 };
  for (const d of c.details || []) if (d.redCard) { if (d.team && H.team && d.team.id === H.team.id) reds.h++; else if (d.team && A.team && d.team.id === A.team.id) reds.a++; }
  const m = /^(\d+)'(?:\+(\d+)')?/.exec(st.displayClock || '');
  return {
    id: e.id, state: type.state, status: type.shortDetail || type.description, period: st.period || 0,
    minute: m ? +m[1] + (m[2] ? +m[2] : 0) : 0, baseMinute: m ? +m[1] : 0, clock: st.displayClock,
    halftime: type.name === 'STATUS_HALFTIME',
    home: H.team && (H.team.displayName || H.team.name), away: A.team && (A.team.displayName || A.team.name),
    hs: +H.score || 0, as: +A.score || 0, reds, neutral: !!c.neutralSite, date: (e.date || '').slice(0, 10),
    start: e.date, league: (e.season && e.season.slug) || '',
    goals: (c.details || []).filter(d => d.scoringPlay && !d.shootout).map(d => ({ min: d.clock && d.clock.displayValue, team: d.team && H.team && d.team.id === H.team.id ? 'h' : 'a', own: d.ownGoal, pen: d.penaltyKick })),
    goalsFull: (c.details || []).filter(d => d.scoringPlay && !d.shootout).map(d => {
      const mm = /^(\d+)'(?:\+(\d+)')?/.exec((d.clock && d.clock.displayValue) || '') || [0, 0, 0];
      return { team: d.team && H.team && d.team.id === H.team.id ? 'h' : 'a', t: +mm[1] * 100 + (+mm[2] || 0), half: +mm[1] <= 45 ? 1 : 2 };
    }),
  };
}

// ---- élő meccsstatisztika (lövések, kapura lövések, labdabirtoklás, szöglet) ----
const statCache = new Map();
async function liveStats(id) {
  const hit = statCache.get(id);
  if (hit && Date.now() - hit.t < 110 * 1000) return hit.p;
  const p = (async () => {
    try {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${id}`, { headers: { 'User-Agent': 'Mozilla/5.0 (foci-elemzo)' } });
      if (!r.ok) return null;
      const j = await r.json();
      const teams = j.boxscore && j.boxscore.teams; if (!teams || teams.length !== 2) return null;
      const comp = j.header && j.header.competitions && j.header.competitions[0];
      const homeId = comp && (comp.competitors.find(c => c.homeAway === 'home') || {}).id;
      const get = t => { const o = {}; (t.statistics || []).forEach(s => { o[s.name] = parseFloat(s.displayValue); }); return o; };
      let [h, a] = teams.map(get);
      if (homeId && teams[1].team && teams[1].team.id === homeId) [h, a] = [a, h];
      if (!(h.totalShots >= 0) || !(a.totalShots >= 0)) return null;
      const pick = o => ({ shots: o.totalShots || 0, sot: o.shotsOnTarget || 0, poss: o.possessionPct || null, corners: o.wonCorners || 0, blocked: o.blockedShots || 0 });
      return { h: pick(h), a: pick(a) };
    } catch (e) { return null; }
  })();
  statCache.set(id, { t: Date.now(), p });
  if (statCache.size > 200) statCache.delete(statCache.keys().next().value);
  return p;
}
// lövésekből számolt "várható gól" (xG-közelítés): kapura lövés ~0,26, egyéb lövés ~0,03 gól
const xgProxy = t => 0.26 * t.sot + 0.03 * Math.max(0, t.shots - t.sot);

// ---- meccs előtti várható gólok forrása ----
async function preLambda(ev, quick) {
  const he = enName(ev.home), ae = enName(ev.away);
  // 1) válogatott-modell (+ Tippmix meccs előtti ár, ha megtaláljuk)
  const m = await national.modelFor(ev.date).catch(() => null);
  if (m && m.teams.has(he) && m.teams.has(ae)) {
    const p = m.fit.predict(he, ae, ev.neutral ? 0 : 1);
    if (p) {
      let l = p.l, mu = p.m, src = 'válogatott-modell';
      const offers = await tippmix.fetchDay(ev.date).catch(() => []);
      let o = offers.find(x => national.toEn(x.home, m.teams) === he && national.toEn(x.away, m.teams) === ae);
      if (!o) { // kezdés után a kalkulátorból eltűnik -> archívumból
        const arc = require('./learn').findEvent(ev.date, a => { const [h, w] = a.name.split(' - '); return national.toEn(h, m.teams) === he && national.toEn(w, m.teams) === ae; });
        const r = arc && Object.fromEntries(arc.rows.filter(x => x.market === '1X2').map(x => [x.pick, x.odds]));
        if (r && r['1'] && r['X'] && r['2']) o = { h: r['1'], d: r['X'], a: r['2'] };
      }
      if (o) {
        const mk = impliedLambdas({ x12: devig([o.h, o.d, o.a]).probs }, m.fit.rho, { l, m: mu });
        l = Math.sqrt(l * mk.l); mu = Math.sqrt(mu * mk.m); src = 'válogatott-modell + Tippmix';
      }
      return { l, m: mu, src };
    }
  }
  // 2) klub: a nap elemzett meccsei között (statisztika + profi szorzók)
  const q = (quick || []).find(x => x.lam && tippmix.sim(ev.home, x.home) >= 0.5 && tippmix.sim(ev.away, x.away) >= 0.5 && tippmix.sim(ev.home, x.home) + tippmix.sim(ev.away, x.away) >= 1.5);
  if (q) return { l: q.lam.l, m: q.lam.m, src: 'statisztikai modell' };
  // 3) Tippmix meccs előtti szorzóból
  const offers = await tippmix.fetchDay(ev.date).catch(() => []);
  const o = offers.find(x => tippmix.sim(ev.home, x.home) >= 0.5 && tippmix.sim(ev.away, x.away) >= 0.5 && tippmix.sim(ev.home, x.home) + tippmix.sim(ev.away, x.away) >= 1.5);
  if (o) { const mk = impliedLambdas({ x12: devig([o.h, o.d, o.a]).probs }, -0.05, { l: 1.4, m: 1.15 }); return { l: mk.l, m: mk.m, src: 'Tippmix meccs előtti szorzó' }; }
  return { l: 1.4, m: 1.1, src: 'átlagos meccs (nincs meccs előtti adat)', generic: true };
}

// ---- élő matek ----
const H1 = 1.0, H2 = 1.25;              // gólráta percenként (2. félidő magasabb)
const ST1 = 2, ST2 = 4;                 // várható hosszabbítás percben
const TOTAL = (45 + ST1) * H1 + (45 + ST2) * H2;
const K = 8;                            // Bayes-i prior erőssége (gamma alak)

function remainingShare(ev) {
  if (ev.state === 'pre') return 1;
  if (ev.state === 'post') return 0;
  if (ev.halftime) return (45 + ST2) * H2 / TOTAL;
  if (ev.period <= 1) return (Math.max(0, 45 + ST1 - ev.minute) * H1 + (45 + ST2) * H2) / TOTAL;
  return Math.max(0.3, 90 + ST2 - ev.minute) * H2 / TOTAL;
}

const lf = [0]; for (let i = 1; i <= 30; i++) lf[i] = lf[i - 1] + Math.log(i);
const pois = (k, l) => (l <= 0 ? (k === 0 ? 1 : 0) : Math.exp(k * Math.log(l) - l - lf[k]));

function liveMarkets(ev, pre, st) {
  const R = remainingShare(ev), E = 1 - R;
  // Bayes-i frissítés: az eddigi teljesítmény információt hordoz. Ha van élő statisztika, a lövésekből
  // számolt xG-közelítés (70%) és a tényleges gólok (30%) keverékét használjuk, különben csak a gólokat.
  const evH = st ? 0.3 * ev.hs + 0.7 * xgProxy(st.h) : ev.hs, evA = st ? 0.3 * ev.as + 0.7 * xgProxy(st.a) : ev.as;
  const Kp = st ? 3 : K; // a lövés-adat informatívabb, gyorsabban frissítünk
  const thH = (Kp + evH) / (Kp + pre.l * E), thA = (Kp + evA) / (Kp + pre.m * E);
  let a = pre.l * thH * R, b = pre.m * thA * R;
  // piros lapok (lapos csapat ~ -33%, ellenfél ~ +25% lapjanként, a hátralévő időre)
  a *= Math.pow(0.67, ev.reds.h) * Math.pow(1.25, ev.reds.a);
  b *= Math.pow(0.67, ev.reds.a) * Math.pow(1.25, ev.reds.h);
  // állás hatása: a vesztésre álló támad, a vezető biztonsági játékot játszik
  const d = ev.hs - ev.as;
  if (d > 0) { a *= 0.9; b *= 1.15; } else if (d < 0) { a *= 1.15; b *= 0.9; }
  const N = 10, M = [];
  for (let i = 0; i <= N; i++) { M[i] = []; for (let j = 0; j <= N; j++) M[i][j] = pois(i, a) * pois(j, b); }
  let h = 0, x = 0, aw = 0, btts = 0; const tot = new Array(2 * N + 1).fill(0); const sc = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const p = M[i][j], fh = ev.hs + i, fa = ev.as + j;
    if (fh > fa) h += p; else if (fh === fa) x += p; else aw += p;
    if (fh > 0 && fa > 0) btts += p;
    tot[i + j] += p;
    sc.push({ score: `${fh}-${fa}`, p });
  }
  sc.sort((u, v) => v.p - u.p);
  const cur = ev.hs + ev.as;
  const ou = [];
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]) {
    if (line < cur) continue; // már eldőlt
    let under = 0; for (let k = 0; k <= N * 2; k++) if (cur + k < line) under += tot[k];
    ou.push({ line, over: 1 - under, under });
  }
  const pNo = Math.exp(-(a + b));
  // első félidő
  let ht = null;
  if (ev.state === 'pre') { const h0 = htMarkets(pre.l, pre.m); ht = { o05: h0.o05, o15: h0.o15, settled: false }; }
  else if (ev.period <= 1 && !ev.halftime) {
    const r1 = Math.max(0, 45 + ST1 - ev.minute) * H1 / TOTAL, sc = ((HT_PARAMS.sh + HT_PARAMS.sa) / 2) / ((45 + ST1) * H1 / TOTAL);
    let a1 = pre.l * thH * r1 * sc, b1 = pre.m * thA * r1 * sc;
    a1 *= Math.pow(0.67, ev.reds.h) * Math.pow(1.25, ev.reds.a); b1 *= Math.pow(0.67, ev.reds.a) * Math.pow(1.25, ev.reds.h);
    const x = a1 + b1;
    ht = { o05: cur >= 1 ? 1 : 1 - Math.exp(-x), o15: cur >= 2 ? 1 : cur === 1 ? 1 - Math.exp(-x) : 1 - Math.exp(-x) * (1 + x), settled: false };
  } else ht = { o05: cur >= 1 ? 1 : 0, o15: null, settled: true, htGoals: null };
  return {
    teamScores: { h: 1 - Math.exp(-a), a: 1 - Math.exp(-b) },
    ht,
    remaining: { share: R, home: a, away: b }, x12: { h, d: x, a: aw }, dc: { '1X': h + x, 'X2': x + aw, '12': h + aw },
    next: { home: (1 - pNo) * a / (a + b || 1), none: pNo, away: (1 - pNo) * b / (a + b || 1) },
    btts, ou, top: sc.slice(0, 6), moreGoals: 1 - pNo,
  };
}

async function liveList(quickFn) {
  const evs = await scoreboard();
  const live = evs.filter(e => e.state === 'in' || (e.state === 'pre' && Date.parse(e.start) - Date.now() < 3 * 3600 * 1000 && Date.parse(e.start) > Date.now() - 3600 * 1000));
  const dates = [...new Set(live.map(e => e.date))];
  const quick = [];
  for (const d of dates) quick.push(...(await quickFn(d).catch(() => [])));
  const out = [];
  for (const ev of live) {
    if (/U\d{2}|Women|W$/.test(`${ev.home} ${ev.away}`)) continue;
    const pre = await preLambda(ev, quick);
    const st = ev.state === 'in' ? await liveStats(ev.id) : null;
    out.push({ ...ev, stats: st, xg: st ? [xgProxy(st.h), xgProxy(st.a)] : null, pre: { l: pre.l, m: pre.m, src: pre.src, generic: !!pre.generic }, mk: liveMarkets(ev, pre, st), mk0: st ? liveMarkets(ev, pre, null) : null });
  }
  out.sort((x, y) => (x.state === 'in' ? 0 : 1) - (y.state === 'in' ? 0 : 1) || (x.pre.generic ? 1 : 0) - (y.pre.generic ? 1 : 0) || (x.start || '').localeCompare(y.start || ''));
  return out;
}

// ---- Élő lehetőségek: kockázatosabb, de esélyes kimenetek (a statisztika alapján kiemelve) ----
const LIVE_MARGIN = 1.08;
const TYPES = { ht: '1. félidős gól', more: 'Lesz még gól', team: 'Csapat lő gólt / következő gól', win: 'Győzelem / döntetlen', btts: 'Mindkét csapat lő gólt', line: 'Gólszám vonal' };
function opportunities(list, { minP = 0.45, maxP = 0.85, minOdds = 1.35, types = Object.keys(TYPES), includeWeak = false, raw = false } = {}) {
  const out = [];
  for (const e of list) {
    if (e.state !== 'in' || e.pre.generic || e.minute > 85) continue;
    const k = e.mk, k0 = e.mk0 || e.mk, cur = e.hs + e.as;
    const c = [];
    if (k.ht && !k.ht.settled && cur === 0 && !e.halftime && e.period <= 1) c.push(['ht', '1. félidőben lesz gól (0,5 felett)', k.ht.o05, k0.ht ? k0.ht.o05 : k.ht.o05]);
    c.push(['more', `Lesz még gól (${String(cur + 0.5).replace('.', ',')} felett)`, k.moreGoals, k0.moreGoals]);
    const l2 = k.ou.find(o => o.line === cur + 1.5), l20 = k0.ou.find(o => o.line === cur + 1.5);
    if (l2) c.push(['line', `${String(cur + 1.5).replace('.', ',')} gól felett`, l2.over, l20 ? l20.over : l2.over]);
    c.push(['team', `${e.home} lő még gólt`, k.teamScores.h, k0.teamScores.h], ['team', `${e.away} lő még gólt`, k.teamScores.a, k0.teamScores.a]);
    c.push(['team', `Következő gól: ${e.home}`, k.next.home, k0.next.home], ['team', `Következő gól: ${e.away}`, k.next.away, k0.next.away]);
    c.push(['win', `${e.home} nyer`, k.x12.h, k0.x12.h], ['win', 'Döntetlen', k.x12.d, k0.x12.d], ['win', `${e.away} nyer`, k.x12.a, k0.x12.a]);
    if (!(e.hs > 0 && e.as > 0)) c.push(['btts', 'Mindkét csapat lő gólt', k.btts, k0.btts]);
    for (const [type, label, pRaw, p0] of c) {
      const p = raw ? pRaw : ll.adjust(type, pRaw);                 // élő tanulás: kalibrált esély
      const verdict = ll.verdict(type, e.minute, e.halftime);       // ebben a percsávban bizonyított/gyenge?
      if (!types.includes(type) || !(p >= minP && p <= maxP) || 1 / p < minOdds) continue;
      if (verdict === 'gyenge' && !includeWeak) continue;
      const boost = pRaw - p0;
      // becsült élő iroda-szorzó: statisztika nélküli modell (állás + idő + meccs előtti erő) + ~8% marzs
      const est = 1 / Math.min(0.99, ll.adjust(type, p0) * LIVE_MARGIN);
      const need = 1.05 / p;
      out.push({ est, value: est >= need, near: est >= need * 0.95, id: e.id, match: `${e.home} – ${e.away}`, clock: e.halftime ? 'Félidő' : e.clock, score: `${e.hs}–${e.as}`, type, typeName: TYPES[type], label, p, pRaw, verdict, fair: 1 / p, need, boost,
        hot: boost >= 0.04, stats: e.stats ? `lövés ${e.stats.h.shots}(${e.stats.h.sot})–${e.stats.a.shots}(${e.stats.a.sot}), xG≈${e.xg[0].toFixed(1)}–${e.xg[1].toFixed(1)}` : '', rank: p * (1 + 3 * Math.max(0, boost)) * (verdict === 'jó' ? 1.15 : 1) * (est >= need ? 1.3 : est >= need * 0.95 ? 1.1 : 1) });
    }
  }
  return out.sort((a, b) => b.rank - a.rank);
}

module.exports = { opportunities, TYPES, liveList, liveMarkets, scoreboard, parseEvent, remainingShare };
