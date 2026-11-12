// Tippmix további piacok (tipplap.hu /kalkulator/markets/{esemény}) + modell-valószínűség minden kimenetre
const { scoreMatrix, exactScoreMatrix, htMatrix } = require('./model');
const national = require('./national');
const learn = require('./learn');

const TTL = 30 * 60 * 1000;
const cache = new Map();
let active = 0; const queue = [];
const slot = () => new Promise(r => { if (active < 2) { active++; r(); } else queue.push(r); });
const release = () => { const n = queue.shift(); if (n) n(); else active--; };

const dec = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

function parse(html) {
  const out = [];
  let market = '';
  const re = /<tr data-event="\d+" data-market>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = re.exec(html))) {
    const row = m[1];
    const th = /<th[^>]*>([\s\S]*?)<\/th>/.exec(row);
    if (th) { market = dec(th[1]); continue; }
    const num = (/data-market-number>(\d+)</.exec(row) || [])[1];
    const name = (/data-outcome-name>([\s\S]*?)<\/div>/.exec(row) || [])[1];
    const code = (/data-outcome-code>([^<]*)</.exec(row) || [])[1];
    const odds = parseFloat((/data-odds>([\d.]+)</.exec(row) || [])[1]);
    const minCombi = parseInt((/data-min-combi>(\d+)</.exec(row) || [])[1] || '0', 10) || null;
    if (num && name && odds > 1) out.push({ market, num, name: dec(name), code: (code || '').trim(), odds, minCombi });
  }
  return out;
}

async function fetchMarkets(eventId, { onlyCached = false } = {}) {
  const hit = cache.get(eventId);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  if (onlyCached) return null;
  const p = (async () => {
    await slot();
    try {
      const r = await fetch(`https://www.tipplap.hu/kalkulator/markets/${eventId}`, { headers: { 'User-Agent': 'Mozilla/5.0 (foci-elemzo, szemelyes hasznalat)', 'X-Requested-With': 'XMLHttpRequest' } });
      if (!r.ok) return [];
      const body = await r.text();
      let html = body; try { html = JSON.parse(body).desktop || body; } catch (e) { /* nem JSON */ }
      return parse(html);
    } catch (e) { return []; } finally { release(); }
  })();
  cache.set(eventId, { t: Date.now(), p });
  return p;
}

// ---- kimenet -> feltétel az eredményre (i = hazai gól, j = vendég gól) ----
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SKIP = /félidő|ázsiai|hendikep|pontosan|száma|páros|melyik|nyertes különbség|félidő\/vég|mindkét félidő|pontos végeredmények|pontos eredmény -|mindkét félidőben|legalább egy|szöglet|lap|büntető|gólszerző/i;

function teamSide(n, home, away) {
  const t = norm(n), h = norm(home), a = norm(away);
  const hasH = /hazai/.test(t) || (h.length > 2 && t.includes(h.split(' ')[0])), hasA = /vendeg/.test(t) || (a.length > 2 && t.includes(a.split(' ')[0]));
  return { hasH, hasA };
}

// csak ezeket a piacokat értelmezzük (minden más kimarad)
const ALLOW = [/^mindket csapat szerez golt$/, /^1x2 \+ mindket csapat szerez golt$/, /^golszam \d,\d$/, /^1x2 \+ golszam \d,\d$/,
  /^(hazai csapat|vendegcsapat) - golszam \d,\d$/, /^mindket csapat szerez golt \+ golszam \d,\d$/, /kapott gol nelkul jatssza le/,
  /^ketesely$/, /^pontos vegeredmeny$/, /^(hazai csapat|dontetlen|vendegcsapat) (nyer )?vagy mindket csapat szerez golt$/];

const HT_ALLOW = [/^golszam \d,\d$/, /^1x2$/, /^ketesely$/, /^mindket csapat szerez golt\??$/];
function predicate(market, name, code, home, away) {
  const htm = /^1\. félidő - (.+)$/.exec(market);
  if (htm) {
    const rest = htm[1].replace(/\?$/, '');
    if (!HT_ALLOW.some(r => r.test(norm(rest)))) return null;
    let pr;
    if (/^1x2$/.test(norm(rest))) {
      const n2 = norm(name); let r = null;
      if (/^hazai|^1\b/.test(n2) || code === 'H') r = 'H'; else if (/^dontetlen|^x\b/.test(n2) || code === 'D') r = 'D'; else if (/^vendeg|^2\b/.test(n2) || code === 'V') r = 'A';
      pr = r && { f: (i, j) => (i > j ? 'H' : i === j ? 'D' : 'A') === r };
    } else pr = predicate(rest, name, code, home, away);
    return pr ? { ...pr, ht: true } : null;
  }
  if (SKIP.test(market)) return null;
  const mk = norm(market), n = norm(name);
  if (!ALLOW.some(r => r.test(mk))) return null;
  // "X nyer vagy mindkét csapat szerez gólt" (VAGY)
  const orm = /^(hazai csapat|dontetlen|vendegcsapat) (nyer )?vagy mindket csapat szerez golt$/.exec(mk);
  if (orm) {
    const yes = /^igen/.test(n), no = /^nem/.test(n);
    if (yes === no) return null;
    const r = orm[1] === 'hazai csapat' ? 'H' : orm[1] === 'dontetlen' ? 'D' : 'A';
    return { f: (i, j) => (((i > j ? 'H' : i === j ? 'D' : 'A') === r) || (i > 0 && j > 0)) === yes };
  }
  // pontos végeredmény
  if (/^pontos vegeredmeny$/.test(mk)) {
    const s = /^(\d+)\s*[:-]\s*(\d+)$/.exec(name.trim());
    if (!s) return null;
    const a = +s[1], b = +s[2];
    return { exact: true, f: (i, j) => i === a && j === b };
  }
  if (/^ketesely$/.test(mk)) {
    const { hasH, hasA } = teamSide(name, home, away), d = /dontetlen/.test(n);
    let set;
    if (/^1x$/i.test(name) || (d && hasH && !hasA)) set = 'HD';
    else if (/^x2$/i.test(name) || (d && hasA && !hasH)) set = 'DA';
    else if (/^12$/.test(name) || (hasH && hasA && !d)) set = 'HA';
    if (!set) return null;
    return { f: (i, j) => set.includes(i > j ? 'H' : i === j ? 'D' : 'A') };
  }
  if (/kapott gol nelkul/.test(mk)) {
    const yes = /^igen/.test(n), no = /^nem/.test(n);
    if (!yes && !no) return null;
    const homeCS = /^hazai/.test(mk);
    return { f: (i, j) => ((homeCS ? j : i) === 0) === yes };
  }
  // összetett: 1X2 / BTTS / gólszám kombinációk
  const parts = [];
  if (/1x2/.test(mk)) {
    let r = null;
    if (/^hazai|^1\b/.test(n)) r = 'H'; else if (/^dontetlen|^x\b/.test(n)) r = 'D'; else if (/^vendeg|^2\b/.test(n)) r = 'A';
    if (!r) return null;
    parts.push((i, j) => (i > j ? 'H' : i === j ? 'D' : 'A') === r);
  }
  if (/mindket csapat szerez golt/.test(mk)) {
    const yes = /igen/.test(n), no = /\bnem\b/.test(n);
    if (yes === no) return null;
    parts.push((i, j) => (i > 0 && j > 0) === yes);
  }
  const gl = /golszam (\d+),(\d)/.exec(mk);
  if (gl) {
    const line = +gl[1] + gl[2] / 10;
    const over = /tobb|felett|over|\+/.test(n), under = /kevesebb|alatt|under|-/.test(n);
    if (over === under) return null;
    const scope = /^hazai csapat/.test(mk) ? 'h' : /^vendegcsapat/.test(mk) ? 'a' : 't';
    parts.push((i, j) => { const g = scope === 'h' ? i : scope === 'a' ? j : i + j; return over ? g > line : g < line; });
  }
  if (!parts.length) return null;
  return { f: (i, j) => parts.every(p => p(i, j)) };
}

// Minden értelmezhető kimenetre: modell-valószínűség, várható hozam
function evaluate(list, lam, home, away) {
  const M = scoreMatrix(lam.l, lam.m, lam.rho || 0), E = exactScoreMatrix(lam.l, lam.m), HT = htMatrix(lam.l, lam.m);
  const N = M.length;
  const rows = [];
  const byMarket = new Map();
  for (const o of list) {
    const pr = predicate(o.market, o.name, o.code, home, away);
    if (!pr) continue;
    const X = pr.ht ? HT : pr.exact ? E : M;
    let p = 0;
    for (let i = 0; i < X.length; i++) for (let j = 0; j < X.length; j++) if (pr.f(i, j)) p += X[i][j];
    // válogatottnál a sima gólszám-vonalak kalibrálása (a modell ott túl magabiztos)
    const tl = /^Gólszám (\d),(\d)$/.exec(o.market);
    if (lam.nat && tl) {
      const line = +tl[1] + tl[2] / 10;
      const over = /több|felett/i.test(o.name);
      let pOver = over ? p : 1 - p; pOver = national.calTotal(line, pOver); p = over ? pOver : 1 - pOver;
    }
    const r = { ...o, p, ev: p * o.odds - 1, min: 1 / p };
    rows.push(r);
    if (!byMarket.has(o.market)) byMarket.set(o.market, []);
    byMarket.get(o.market).push(r);
  }
  // biztonsági ellenőrzés: egy piac kimenetei együtt ~100% (kivéve pontos eredmény)
  const ok = new Set();
  for (const [mk, rs] of byMarket) {
    const s = rs.reduce((x, r) => x + r.p, 0);
    if (/pontos/i.test(mk) || Math.abs(s - 1) < 0.03 || (/kétesély/i.test(mk) && Math.abs(s - 2) < 0.03)) ok.add(mk);
  }
  // kiegyensúlyozás: a modell esélyét keverjük a Tippmix marzs nélküli árával (azonos sorszámú, teljes piacokon)
  const out = rows.filter(r => ok.has(r.market));
  const byNum = new Map();
  for (const r of out) { if (!byNum.has(r.num)) byNum.set(r.num, []); byNum.get(r.num).push(r); }
  for (const [, rs] of byNum) {
    if (/pontos/i.test(rs[0].market)) continue;
    const tot = rs.reduce((x, r) => x + r.p, 0);
    if (rs.length < 2 || Math.abs(tot - (/kétesély/i.test(rs[0].market) ? 2 : 1)) > 0.03) continue;
    const scale = /kétesély/i.test(rs[0].market) ? 2 : 1;
    const inv = rs.map(r => 1 / r.odds), book = inv.reduce((a, b) => a + b, 0);
    rs.forEach((r, k) => { const fair = inv[k] / book * scale; r.pModel = r.p; r.p = MODEL_W * r.p + (1 - MODEL_W) * fair; });
  }
  for (const r of out) {
    r.pRaw = Math.min(r.p, P_CAP);                       // archiváláshoz (tanulás előtti)
    r.p = learn.adjust(r.market, r.name, r.code, r.pRaw); // tanult korrekció (ha már van elég adat)
    r.ev = r.p * r.odds - 1; r.min = 1 / r.p;
  }
  return out;
}
const MODEL_W = 0.6, P_CAP = 0.97;

module.exports = { fetchMarkets, evaluate, parse, predicate };
