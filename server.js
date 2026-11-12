const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const data = require('./lib/data');
const analysis = require('./lib/analysis');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const q = Object.fromEntries(u.searchParams);
  try {
    if (u.pathname === '/api/leagues') return json(res, 200, data.allLeagues());
    if (u.pathname === '/api/matches') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date || '')) return json(res, 400, { error: 'Hibás dátum' });
      return json(res, 200, await analysis.quickForDate(q.date));
    }
    if (u.pathname === '/api/slip') {
      return json(res, 200, await require('./lib/slip').buildSlip({
        target: parseFloat(q.target) || 5, days: parseInt(q.days, 10) || 1, maxLegs: parseInt(q.maxLegs, 10) || 6,
        onlyModel: q.onlyModel === '1', exclude: (q.exclude || '').split(',').filter(Boolean), stake: parseInt(q.stake, 10) || 1000,
      }));
    }
    if (u.pathname === '/api/tippmix') {
      const ms = await analysis.quickForDate(q.date);
      const nums = new Set(ms.filter(m => m.tm).map(m => m.tm.num));
      return json(res, 200, await analysis.tippmixOnly(q.date, nums));
    }
    if (u.pathname === '/api/analysis') {
      return json(res, 200, await analysis.analyze(q.league, q.date, q.home, q.away));
    }
    if (u.pathname === '/api/backtest') {
      return json(res, 200, await analysis.backtest(q.league, Math.min(+q.weeks || 10, 30), q.end));
    }
    if (u.pathname === '/api/tune') {
      return json(res, 200, await analysis.tune(q.league, Math.min(+q.weeks || 20, 40), q.end));
    }
    if (u.pathname === '/health') return json(res, 200, { ok: true });
    let f = path.normalize(path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message || 'Hiba' });
  }
});

server.listen(PORT, () => {
  console.log(`Foci elemző fut: http://localhost:${PORT}`);
  warmup().then(async () => {
    for (const t of [3, 10]) {
      try {
        const r = await require('./lib/slip').buildSlip({ target: t, days: 2, maxLegs: 6, stake: 1000 });
        if (r.error) console.log(`[slip] cél ${t}: ${r.error} (${r.candidates} jelölt)`);
        else console.log(`[slip] cél ${t}: ${r.candidates} jelölt (${r.modelCandidates} modell) -> odds ${r.totalOdds.toFixed(2)}, esély ${(r.winP * 100).toFixed(1)}%, hozam ${(r.ev * 100).toFixed(1)}% | ` + r.legs.map(l => `${l.num} ${l.name} ${l.pick}@${l.odds} ${(l.p * 100).toFixed(0)}% [${l.src}]`).join(' ; '));
      } catch (e) { console.log('[slip] hiba ' + e.message); }
    }
    if (process.env.CALIB === '1') require('./lib/calib').runCalib().catch(e => console.log('[calib] hiba', e));
    if (process.env.STUDY === '1') require('./lib/study').runStudy().catch(e => console.log('[study] hiba', e));
  });
});

// Indulás után és 3 óránként előtölti a mai/holnapi meccseket (gyors első megnyitás) + napló
async function warmup() {
  const d = new Date();
  const days = [-1, 0, 1].map(k => new Date(d.getTime() + k * 86400000).toISOString().slice(0, 10));
  for (const day of days) {
    try {
      const t = Date.now();
      const ms = await analysis.quickForDate(day);
      const ok = ms.filter(m => m.p);
      const leagues = new Set(ms.map(m => m.league));
      const hits = ok.filter(m => m.hits);
      const hr = hits.length ? Math.round(hits.filter(m => m.hits.x12).length / hits.length * 100) : null;
      console.log(`[warmup] ${day}: ${ms.length} meccs, ${leagues.size} liga, ${ok.length} elemezve, ${Date.now() - t} ms` + (hr !== null ? `, 1X2 találat ${hr}% (${hits.length} lejátszott)` : ''));
      const tms = ms.filter(m => m.tm);
      console.log(`[warmup] ${day}: Tippmix párosítva ${tms.length}/${ms.length}` + tms.slice(0, 6).map(m => ` | ${m.home}-${m.away} = ${m.tm.name} ${m.tm.best.pick}@${m.tm.best.odds} ${m.tm.best.ev}%`).join(''));
      const nums = new Set(tms.map(m => m.tm.num));
      const only = await analysis.tippmixOnly(day, nums);
      const leagues2 = [...new Set(only.map(o => o.league))];
      console.log(`[warmup] ${day}: csak Tippmix ${only.length} meccs, ligák: ${leagues2.join(', ')}`);
      const it = only.filter(o => /olasz/i.test(o.league)).slice(0, 4);
      if (it.length) console.log('[warmup] olasz: ' + it.map(o => `${o.league}: ${o.home}-${o.away} ${o.p.h}/${o.p.d}/${o.p.a} BTTS ${o.p.btts}% 2.5+ ${o.p.o25}% ${o.score}`).join(' | '));
      if (ok[0]) console.log(`[warmup] minta: ${ok[0].home} - ${ok[0].away} | 1:${ok[0].p.h}% X:${ok[0].p.d}% 2:${ok[0].p.a}% | BTTS ${ok[0].p.btts}% | 2.5+ ${ok[0].p.o25}% | ${ok[0].score}`);
    } catch (e) {
      console.log(`[warmup] ${day} hiba: ${e.message}`);
    }
  }
}
setInterval(warmup, 3 * 60 * 60 * 1000);
