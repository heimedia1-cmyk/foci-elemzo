// MexiVerse – szerver: kiszolgálja a játékot, kezeli a belépést és a felhős mentést.
// A fiókokat az Anime Battlegrounds szervere kezeli (ugyanaz, mint a Mexi Survivorsnál):
// ugyanazzal a felhasználónévvel és jelszóval lehet belépni. Itt csak a MexiVerse-mentést tároljuk.
// Később ide kerül az online rész (profilok, barátok, Gymek, Raidek).
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { attachCoop } from './server/coop.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ACCOUNT_API = String(process.env.ACCOUNT_API || 'https://animebg.up.railway.app').replace(/\/$/, '');
const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, 'data'));
const SAVE_DIR = path.join(DATA_DIR, 'saves');
fs.mkdirSync(SAVE_DIR, { recursive: true });

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ---------- Fiók ellenőrzése az Anime Battlegrounds szerverén ----------
const tokenCache = new Map(); // sha256(token) -> { username, exp }
async function accountFor(req) {
  const raw = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
  if (!raw) return null;
  const h = crypto.createHash('sha256').update(raw).digest('hex');
  const c = tokenCache.get(h);
  if (c && c.exp > Date.now()) return c.username;
  try {
    const r = await fetch(ACCOUNT_API + '/api/me', { headers: { Authorization: 'Bearer ' + raw }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) { tokenCache.delete(h); return null; }
    const d = await r.json();
    if (!d?.username) return null;
    tokenCache.set(h, { username: d.username, exp: Date.now() + 10 * 60000 });
    if (tokenCache.size > 5000) for (const [k, v] of tokenCache) if (v.exp < Date.now()) tokenCache.delete(k);
    return d.username;
  } catch {
    return c ? c.username : null; // ha a fiókszerver épp nem érhető el, a korábban ellenőrzött belépés marad
  }
}

// Belépés / regisztráció: továbbítjuk a fiókszervernek (így nincs böngészős CORS-gond)
async function forward(pathname, req, res) {
  try {
    const r = await fetch(ACCOUNT_API + pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(10000),
    });
    const text = await r.text();
    res.status(r.status).type('application/json').send(text || '{}');
  } catch {
    res.status(503).json({ error: 'A fiókszerver most nem érhető el. Próbáld újra később.' });
  }
}
app.post('/api/login', (req, res) => forward('/api/login', req, res));
app.post('/api/register', (req, res) => forward('/api/register', req, res));
app.post('/api/logout', (req, res) => forward('/api/logout', req, res));

// ---------- Felhős mentés ----------
const saveFile = (username) => path.join(SAVE_DIR, crypto.createHash('sha1').update(username.toLowerCase()).digest('hex') + '.json');

app.get('/api/save', async (req, res) => {
  const user = await accountFor(req);
  if (!user) return res.status(401).json({ error: 'Lépj be újra.' });
  try { res.json({ username: user, save: JSON.parse(fs.readFileSync(saveFile(user), 'utf8')) }); }
  catch { res.json({ username: user, save: null }); }
});

app.put('/api/save', async (req, res) => {
  const user = await accountFor(req);
  if (!user) return res.status(401).json({ error: 'Lépj be újra.' });
  const s = req.body?.save;
  if (!s || typeof s !== 'object' || !Array.isArray(s.party) || !Array.isArray(s.storage) || typeof s.money !== 'number') return res.status(400).json({ error: 'Hibás mentés.' });
  if (s.party.length > 6 || s.storage.length > 3000) return res.status(400).json({ error: 'Hibás mentés.' });
  s.serverSavedAt = Date.now();
  try {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    const file = saveFile(user);
    fs.writeFileSync(file + '.tmp', JSON.stringify(s));
    fs.renameSync(file + '.tmp', file);
    res.json({ ok: true, savedAt: s.serverSavedAt });
  } catch (e) {
    console.error('Mentési hiba', e);
    res.status(500).json({ error: 'A szerver nem tudta elmenteni.' });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true, game: 'MexiVerse' }));
app.use('/vendor/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist'), { maxAge: '7d' }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/phaser/dist'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const server = http.createServer(app);
attachCoop(server);
server.listen(PORT, () => console.log(`MexiVerse fut: http://localhost:${PORT} (adatok: ${DATA_DIR}, fiókok: ${ACCOUNT_API})`));
