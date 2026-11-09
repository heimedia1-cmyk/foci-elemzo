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
  warmup();
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
      if (ok[0]) console.log(`[warmup] minta: ${ok[0].home} - ${ok[0].away} | 1:${ok[0].p.h}% X:${ok[0].p.d}% 2:${ok[0].p.a}% | BTTS ${ok[0].p.btts}% | 2.5+ ${ok[0].p.o25}% | ${ok[0].score}`);
    } catch (e) {
      console.log(`[warmup] ${day} hiba: ${e.message}`);
    }
  }
}
setInterval(warmup, 3 * 60 * 60 * 1000);
