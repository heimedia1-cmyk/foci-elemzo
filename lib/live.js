// Élő elemzés: ESPN ingyenes élő eredmények + meccs előtti modell + hátralévő idő Poisson-folyamata.
// Figyelembe veszi: hátralévő percek (a gólok ~55%-a a 2. félidőben esik), eddigi gólok (Bayes-i frissítés),
// piros lapok, és az állás hatását (a vesztésre álló csapat jobban támad).
const national = require('./national');
const tippmix = require('./tippmix');
const { devig, impliedLambdas } = require('./model');

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
    goals: (c.details || []).filter(d => d.scoringPlay).map(d => ({ min: d.clock && d.clock.displayValue, team: d.team && H.team && d.team.id === H.team.id ? 'h' : 'a', own: d.ownGoal, pen: d.penaltyKick })),
  };
}

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
      const o = offers.find(x => national.toEn(x.home, m.teams) === he && national.toEn(x.away, m.teams) === ae);
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

function liveMarkets(ev, pre) {
  const R = remainingShare(ev), E = 1 - R;
  // Bayes-i frissítés: az eddigi gólok információt hordoznak a csapat formájáról
  const thH = (K + ev.hs) / (K + pre.l * E), thA = (K + ev.as) / (K + pre.m * E);
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
  return {
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
    out.push({ ...ev, pre: { l: pre.l, m: pre.m, src: pre.src, generic: !!pre.generic }, mk: liveMarkets(ev, pre) });
  }
  out.sort((x, y) => (x.state === 'in' ? 0 : 1) - (y.state === 'in' ? 0 : 1) || (x.pre.generic ? 1 : 0) - (y.pre.generic ? 1 : 0) || (x.start || '').localeCompare(y.start || ''));
  return out;
}

module.exports = { liveList, liveMarkets, scoreboard, parseEvent, remainingShare };
