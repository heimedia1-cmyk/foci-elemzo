// Fiók-ellenőrzés és felhős mentések elérése (a HTTP- és a WebSocket-szerver is ezt használja).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ACCOUNT_API = String(process.env.ACCOUNT_API || 'https://animebg.up.railway.app').replace(/\/$/, '');
export const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
export const SAVE_DIR = path.join(DATA_DIR, 'saves');
fs.mkdirSync(SAVE_DIR, { recursive: true });

const tokenCache = new Map(); // sha256(token) -> { username, exp }
/** Token → felhasználónév (vagy null). */
export async function verifyToken(raw) {
  if (!/^[a-f0-9]{64}$/.test(raw || '')) return null;
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
export const accountFor = (req) => verifyToken(/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1]);

export const userKey = (username) => crypto.createHash('sha1').update(username.toLowerCase()).digest('hex');
export const saveFile = (username) => path.join(SAVE_DIR, userKey(username) + '.json');
export const backupDir = (username) => path.join(SAVE_DIR, 'backup', userKey(username));
export function readSave(username) { try { return JSON.parse(fs.readFileSync(saveFile(username), 'utf8')); } catch { return null; } }
