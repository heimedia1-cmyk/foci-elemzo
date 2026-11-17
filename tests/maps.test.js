// Térkép-ellenőrzés: minden fontos pont elérhető-e a kezdőpontból (szélességi kereséssel).
import assert from 'node:assert/strict';
import { MAPS, SOLID } from '../public/src/data/maps.js';
import { BUILDING_INFO } from '../public/src/art/assetIndex.js';
const T = 32;
for (const [key, m] of Object.entries(MAPS)) {
  const H = m.tiles.length, W = m.tiles[0].length;
  const blocked = new Set();
  const doors = [];
  for (const b of m.buildings) {
    const info = BUILDING_INFO[b.key]; const tw = info.tw, th = Math.max(3, Math.round(info.h / T) - 1);
    const door = { x: b.x + Math.floor(tw / 2) + (b.doorDx || 0), y: b.y };
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) { const X = b.x + i, Y = b.y - th + 1 + j; if (!(X === door.x && Y === door.y)) blocked.add(X + ',' + Y); }
    doors.push({ ...door, name: b.name });
  }
  for (const p of m.props || []) if (p.solid !== false) blocked.add(p.x + ',' + p.y);
  for (const s of m.signs) blocked.add(s.x + ',' + s.y);
  const npcAt = new Set(m.npcs.map(n => n.x + ',' + n.y));
  const solid = (x, y) => x < 0 || y < 0 || x >= W || y >= H || (SOLID.has(m.tiles[y][x]) && m.tiles[y][x] !== 'h') || blocked.has(x + ',' + y) || npcAt.has(x + ',' + y);
  const start = m.warps[0]; const sx = start.x, sy = start.y === 0 ? 1 : start.y - 1;
  const seen = new Set([sx + ',' + sy]); const q = [[sx, sy]];
  while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (seen.has(k) || solid(nx, ny)) continue; seen.add(k); q.push([nx, ny]); } }
  const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + ',' + (y + dy)));
  for (const d of doors) assert.ok(seen.has(d.x + ',' + d.y), `${key}: ajtó elérhetetlen: ${d.name} ${d.x},${d.y}`);
  for (const n of m.npcs) assert.ok(near(n.x, n.y), `${key}: NPC elérhetetlen: ${n.id}`);
  for (const s of m.signs) assert.ok(near(s.x, s.y), `${key}: tábla elérhetetlen: ${s.x},${s.y}`);
  for (const h of m.hidden) assert.ok(seen.has(h.x + ',' + h.y) || near(h.x, h.y), `${key}: rejtett tárgy elérhetetlen: ${h.id}`);
  for (const w of m.warps) assert.ok(near(w.x, w.y) || seen.has(w.x + ',' + w.y), `${key}: kijárat elérhetetlen`);
  if (m.secretBush) assert.ok(near(m.secretBush.x, m.secretBush.y), `${key}: titkos bokor elérhetetlen`);
  for (const t of m.triggers) assert.ok(seen.has(t.x + ',' + t.y), `${key}: esemény-zóna elérhetetlen ${t.id}`);
  console.log(`✓ ${key}: ${seen.size} bejárható mező, minden fontos pont elérhető`);
}
