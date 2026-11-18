// Térkép-bejárhatóság (kliens, szerver és tesztek közös kódja).
import { MAPS, SOLID } from './maps.js';
import { BUILDING_INFO } from '../art/assetIndex.js';

const cache = new Map();
/** Az adott térkép elérhető (bejárható) mezői a fő bejárattól indulva. */
export function walkable(mapKey) {
  if (cache.has(mapKey)) return cache.get(mapKey);
  const m = MAPS[mapKey]; if (!m) return null;
  const H = m.tiles.length, W = m.tiles[0].length;
  const blocked = new Set(); const doors = [];
  for (const b of m.buildings || []) {
    const info = BUILDING_INFO[b.key]; if (!info) continue;
    const tw = info.tw, th = Math.max(3, Math.round(info.h / 32) - 1);
    const door = { x: b.x + Math.floor(tw / 2) + (b.doorDx || 0), y: b.y };
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) { const X = b.x + i, Y = b.y - th + 1 + j; if (!(X === door.x && Y === door.y)) blocked.add(X + ',' + Y); }
    doors.push({ ...door, name: b.name });
  }
  for (const p of m.props || []) if (p.solid !== false) blocked.add(p.x + ',' + p.y);
  for (const f of m.furniture || []) if (f.solid !== false && !f.wall) for (let j = 0; j < (f.h || 1); j++) for (let i = 0; i < (f.w || 1); i++) blocked.add((f.x + i) + ',' + (f.y - j));
  for (const s of m.signs || []) blocked.add(s.x + ',' + s.y);
  const npcAt = new Set((m.npcs || []).map(n => n.x + ',' + n.y));
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || (SOLID.has(m.tiles[y][x]) && m.tiles[y][x] !== 'h') || blocked.has(x + ',' + y) || npcAt.has(x + ',' + y);
  const start = m.warps[0]; const sx = start.x, sy = start.y === 0 ? 1 : start.y - 1;
  const seen = new Set([sx + ',' + sy]); const q = [[sx, sy]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || solid(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } }
  const res = { seen, doors, solid, W, H, start: { x: sx, y: sy }, npcAt };
  cache.set(mapKey, res);
  return res;
}
/** Érvényes-e (bejárható és elérhető) a pozíció; ha nem, a legközelebbi jó mező (vagy a térkép bejárata). */
export function safePosition(mapKey, x, y) {
  const w = walkable(mapKey); if (!w) return null;
  const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.seen.has((x + dx) + ',' + (y + dy)));
  if (w.seen.has(x + ',' + y) || (w.npcAt.has(x + ',' + y) && nb)) return { x, y, fixed: false }; // NPC kezdőhelye: ha az NPC elsétált, ott is lehet állni
  let best = null, bd = Infinity;
  for (const k of w.seen) { const [a, b] = k.split(',').map(Number); const d = Math.abs(a - x) + Math.abs(b - y); if (d < bd) { bd = d; best = { x: a, y: b }; } }
  return best && bd <= 6 ? { ...best, fixed: true } : { ...w.start, fixed: true };
}
