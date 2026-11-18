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
import { ACCOUNT_API, DATA_DIR, SAVE_DIR, accountFor, saveFile, backupDir, readSave } from './server/auth.js';
import { sanitizeSave } from './server/validate.js';

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Az Android app helyi fájlokból fut (https://localhost), ezért az API-t onnan is engedélyezni kell.
const APP_ORIGINS = new Set(['https://localhost', 'http://localhost', 'capacitor://localhost']);
app.use('/api', (req, res, next) => {
  const o = req.headers.origin;
  if (o && APP_ORIGINS.has(o)) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(o && APP_ORIGINS.has(o) ? 204 : 403);
  next();
});
app.use(express.json({ limit: '1mb' }));

// Egyszerű, IP-nkénti kérésszám-korlát (pl. mentésátviteli kód találgatása ellen)
const hits = new Map();
function limit(key, max, windowMs) {
  const now = Date.now(); const h = hits.get(key) || { n: 0, t: now };
  if (now - h.t > windowMs) { h.n = 0; h.t = now; }
  h.n++; hits.set(key, h);
  if (hits.size > 20000) for (const [k, v] of hits) if (now - v.t > windowMs) hits.delete(k);
  return h.n > max;
}

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
app.get('/api/save', async (req, res) => {
  const user = await accountFor(req);
  if (!user) return res.status(401).json({ error: 'Lépj be újra.' });
  res.json({ username: user, save: readSave(user) });
});

const MAX_BACKUPS = 12;
function writeBackup(user, prev) {
  try {
    const dir = backupDir(user); fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    const lastTs = files.length ? +files[files.length - 1].split('.')[0] : 0;
    if (Date.now() - lastTs < 15 * 60000) return; // legfeljebb 15 percenként egy biztonsági mentés
    fs.writeFileSync(path.join(dir, Date.now() + '.json'), JSON.stringify(prev));
    for (const f of files.slice(0, Math.max(0, files.length + 1 - MAX_BACKUPS))) fs.unlinkSync(path.join(dir, f));
  } catch (e) { console.error('Biztonsági mentés hiba', e.message); }
}
function writeSave(user, s) {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  const file = saveFile(user);
  fs.writeFileSync(file + '.tmp', JSON.stringify(s));
  fs.renameSync(file + '.tmp', file);
}

app.put('/api/save', async (req, res) => {
  const user = await accountFor(req);
  if (!user) return res.status(401).json({ error: 'Lépj be újra.' });
  const prev = readSave(user);
  // két eszköz egyszerre: ha a szerveren újabb mentés van, mint amire ez épült, nem írjuk felül vakon
  const baseRev = Number.isFinite(req.body?.baseRev) ? req.body.baseRev : null;
  if (prev && baseRev != null && (prev.rev || 0) > baseRev && !req.body?.force) return res.status(409).json({ error: 'Másik eszközön újabb mentés készült.', save: prev });
  const r = sanitizeSave(req.body?.save, prev);
  if (r.error) return res.status(400).json({ error: r.error });
  if (r.report?.length) console.log('mentés-ellenőrzés', user, r.report.slice(0, 8).join(', '));
  const s = r.save;
  s.rev = (prev?.rev || 0) + 1;
  s.serverSavedAt = Date.now();
  try {
    if (prev) writeBackup(user, prev);
    writeSave(user, s);
    res.json({ ok: true, savedAt: s.serverSavedAt, rev: s.rev, ...(r.serious ? { corrected: s } : {}) });
  } catch (e) {
    console.error('Mentési hiba', e);
    res.status(500).json({ error: 'A szerver nem tudta elmenteni.' });
  }
});

// Biztonsági mentések listája és visszaállítása
app.get('/api/save/backups', async (req, res) => {
  const user = await accountFor(req);
  if (!user) return res.status(401).json({ error: 'Lépj be újra.' });
  try {
    const dir = backupDir(user);
    const list = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse().map(f => {
      const s = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { id: f.split('.')[0], at: +f.split('.')[0], party: (s.party || []).map(m => ({ species: m.species, level: m.level })), money: s.money, caught: Object.keys(s.dex?.caught || {}).length };
    }) : [];
    res.json({ backups: list });
  } catch { res.json({ backups: [] }); }
});
app.post('/api/save/restore', async (req, res) => {
  const user = await accountFor(req);
  if (!user) return res.status(401).json({ error: 'Lépj be újra.' });
  const id = String(req.body?.id || '');
  if (!/^\d{10,15}$/.test(id)) return res.status(400).json({ error: 'Hibás azonosító.' });
  try {
    const old = JSON.parse(fs.readFileSync(path.join(backupDir(user), id + '.json'), 'utf8'));
    const prev = readSave(user);
    if (prev) { const dir = backupDir(user); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, Date.now() + '.json'), JSON.stringify(prev)); }
    old.rev = (prev?.rev || 0) + 1; old.serverSavedAt = Date.now(); old.savedAt = Date.now();
    writeSave(user, old);
    res.json({ ok: true, save: old });
  } catch { res.status(404).json({ error: 'Nincs ilyen biztonsági mentés.' }); }
});

// ---- Mentés átvitele kóddal (pl. régi app vendégmentése → új app) ----
const TRANSFER_DIR = path.join(DATA_DIR, 'transfer');
fs.mkdirSync(TRANSFER_DIR, { recursive: true });
const TRANSFER_MS = 48 * 3600 * 1000;
const tcode = () => Array.from(crypto.randomBytes(8), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
app.post('/api/transfer', (req, res) => {
  if (limit('tp:' + req.ip, 10, 3600000)) return res.status(429).json({ error: 'Túl sok próbálkozás, próbáld később.' });
  const r = sanitizeSave(req.body?.save, null);
  if (r.error) return res.status(400).json({ error: r.error });
  for (const f of fs.readdirSync(TRANSFER_DIR)) { try { if (Date.now() - fs.statSync(path.join(TRANSFER_DIR, f)).mtimeMs > TRANSFER_MS) fs.unlinkSync(path.join(TRANSFER_DIR, f)); } catch {} }
  const code = tcode();
  fs.writeFileSync(path.join(TRANSFER_DIR, code + '.json'), JSON.stringify(r.save));
  res.json({ code, expiresAt: Date.now() + TRANSFER_MS });
});
app.get('/api/transfer/:code', (req, res) => {
  if (limit('tg:' + req.ip, 20, 3600000)) return res.status(429).json({ error: 'Túl sok próbálkozás, próbáld később.' });
  const code = String(req.params.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) return res.status(400).json({ error: 'A kód 8 karakteres.' });
  const f = path.join(TRANSFER_DIR, code + '.json');
  try {
    if (Date.now() - fs.statSync(f).mtimeMs > TRANSFER_MS) { fs.unlinkSync(f); throw new Error('lejárt'); }
    res.json({ save: JSON.parse(fs.readFileSync(f, 'utf8')) });
  } catch { res.status(404).json({ error: 'Nincs ilyen kód, vagy már lejárt (48 óráig érvényes).' }); }
});

app.get('/health', (_req, res) => res.json({ ok: true, game: 'MexiVerse' }));
// Android app letöltése (a GitHub Actions építi, külön ágon tárolja)
app.get('/app/MexiVerse.apk', (req, res) => res.redirect(302, 'https://raw.githubusercontent.com/heimedia1-cmyk/foci-elemzo/mexiverse-apk/MexiVerse.apk'));
app.get('/app/MexiVerse-teszt.apk', (req, res) => res.redirect(302, 'https://raw.githubusercontent.com/heimedia1-cmyk/foci-elemzo/mexiverse-apk/MexiVerse-teszt.apk'));
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
