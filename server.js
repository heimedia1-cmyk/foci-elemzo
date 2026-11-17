// MexiVerse – egyszerű statikus szerver (Railway-kompatibilis).
// Később ide kerül az online backend (profilok, Gymek, Raidek).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (_req, res) => res.json({ ok: true, game: 'MexiVerse' }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/phaser/dist'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.listen(PORT, () => console.log(`MexiVerse fut: http://localhost:${PORT}`));
