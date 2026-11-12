// Tippmix szorzók a tipplap.hu kalkulátorából (1X2), csapatnév-párosítással
const TTL = 20 * 60 * 1000;
const cache = new Map();

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

async function fetchDay(date) {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = (async () => {
    try {
      const r = await fetch(`https://www.tipplap.hu/kalkulator/labdarugas/${date}`, { headers: { 'User-Agent': 'Mozilla/5.0 (foci-elemzo, szemelyes hasznalat)' } });
      if (!r.ok) return [];
      return parse(await r.text(), date);
    } catch (e) { return []; }
  })();
  cache.set(date, { t: Date.now(), p });
  return p;
}

function parse(html, date) {
  const start = html.indexOf('id="calcTableDesktop"');
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const t = html.slice(start, end);
  const out = [];
  let league = '';
  const re = /<th[^>]*>([\s\S]*?)<\/th>|<tr data-event="(\d+)"[\s\S]*?<\/tr>/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1] !== undefined) { league = decode(m[1].replace(/^Labdarúgás\s*[–-]\s*/, '')); continue; }
    const row = m[0];
    const num = (/data-market-number>(\d+)</.exec(row) || [])[1];
    const minCombi = parseInt((/data-min-combi>(\d+)</.exec(row) || [])[1] || '1', 10);
    const name = (/data-event-name[^>]*>([^<]+)</.exec(row) || [])[1];
    const odds = {};
    for (const o of row.matchAll(/data-name="([HDV])"[\s\S]*?<strong data-odds>([\d.]+)<\/strong>/g)) odds[o[1]] = parseFloat(o[2]);
    const dm = /<td width="72">(\d{2})\.(\d{2})\.<\/td>\s*<td width="72">(\d{2}:\d{2})<\/td>/.exec(row);
    if (!name || !odds.H || !odds.D || !odds.V) continue;
    const parts = decode(name).split(' - ');
    if (parts.length !== 2) continue;
    const year = date.slice(0, 4);
    out.push({
      num, minCombi, league, home: parts[0].trim(), away: parts[1].trim(),
      date: dm ? `${year}-${dm[1]}-${dm[2]}` : date, time: dm ? dm[3] : '',
      h: odds.H, d: odds.D, a: odds.V,
    });
  }
  return out;
}

// ---- névpárosítás ----
const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'cd', 'ud', 'afc', 'club', 'de', 'sk', 'fk', 'if', 'bk', 'sv', 'vfl', 'vfb', 'tsg', 'ssc', 'as', 'us', 'rc', 'rcd', 'ca', 'cs', 'kv', 'krc', 'aj', 'ogc', 'ff', 'ik', 'aik', 'ks', 'the', 'and', '1', 'calcio', 'football', 'futbol', 'cfc', 'utd']);
const ALIAS = { utd: 'united', man: 'manchester', nottm: 'nottingham', wolves: 'wolverhampton', spurs: 'tottenham', psg: 'paris', gladbach: 'monchengladbach', munchen: 'munich', inter: 'inter', sp: 'sporting' };
function norm(name) {
  const s = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let toks = s.split(' ').filter(Boolean).map(t => ALIAS[t] || t);
  const reserve = toks.some(t => t === 'b' || t === '2' || t === 'ii' || t === 'u23' || t === 'u21');
  toks = toks.filter(t => !STOP.has(t) && !['b', '2', 'ii', 'u23', 'u21'].includes(t));
  return { toks, reserve };
}
function tokMatch(a, b) {
  if (a === b) return true;
  if ((a === 'ath' && b.startsWith('at')) || (b === 'ath' && a.startsWith('at'))) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 3 && l.startsWith(s);
}
function sim(x, y) {
  const A = norm(x), B = norm(y);
  if (A.reserve !== B.reserve) return 0;
  if (!A.toks.length || !B.toks.length) return 0;
  let hit = 0;
  for (const a of A.toks) if (B.toks.some(b => tokMatch(a, b))) hit++;
  return hit / Math.min(A.toks.length, B.toks.length);
}

// meccsek párosítása a Tippmix kínálattal
async function attach(matches, date) {
  const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  const prev = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
  const offers = [...(await fetchDay(date)), ...(await fetchDay(next))];
  const res = new Map();
  for (const m of matches) {
    let best = null;
    for (const o of offers) {
      if (o.date !== date && o.date !== next && o.date !== prev) continue;
      const sh = sim(m.home, o.home), sa = sim(m.away, o.away);
      if (sh < 0.5 || sa < 0.5 || sh + sa < 1.5) continue;
      const sc = sh + sa;
      if (!best || sc > best.sc) best = { sc, o };
    }
    if (best) res.set(`${m.league}|${m.home}|${m.away}`, best.o);
  }
  return res;
}

module.exports = { fetchDay, attach, sim, parse };
