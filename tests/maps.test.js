// Térkép-ellenőrzés: minden fontos pont elérhető-e a kezdőpontból (szélességi kereséssel).
import assert from 'node:assert/strict';
import { MAPS, SOLID } from '../public/src/data/maps.js';
import { walkable, safePosition } from '../public/src/data/mapNav.js';
for (const [key, m] of Object.entries(MAPS)) {
  const { seen, doors } = walkable(key);
  const acts = (m.furniture || []).filter(f => f.act);
  const near = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((x + dx) + ',' + (y + dy)));
  for (const d of doors) assert.ok(seen.has(d.x + ',' + d.y), `${key}: ajtó elérhetetlen: ${d.name} ${d.x},${d.y}`);
  for (const n of m.npcs) assert.ok(near(n.x, n.y), `${key}: NPC elérhetetlen: ${n.id}`);
  for (const s of m.signs) assert.ok(near(s.x, s.y), `${key}: tábla elérhetetlen: ${s.x},${s.y}`);
  for (const h of m.hidden) assert.ok(seen.has(h.x + ',' + h.y) || near(h.x, h.y), `${key}: rejtett tárgy elérhetetlen: ${h.id}`);
  for (const w of m.warps) assert.ok(near(w.x, w.y) || seen.has(w.x + ',' + w.y), `${key}: kijárat elérhetetlen`);
  for (const f of acts) { let ok = false; for (let j = 0; j < (f.h || 1); j++) for (let i = 0; i < (f.w || 1); i++) if (near(f.x + i, f.y - j)) ok = true; assert.ok(ok, `${key}: bútor elérhetetlen: ${f.k}`); }
  if (m.secretBush) assert.ok(near(m.secretBush.x, m.secretBush.y), `${key}: titkos bokor elérhetetlen`);
  for (const t of m.triggers) assert.ok(seen.has(t.x + ',' + t.y), `${key}: esemény-zóna elérhetetlen ${t.id}`);
  console.log(`✓ ${key}: ${seen.size} bejárható mező, minden fontos pont elérhető`);
}
// A találkozási táblázatok szerkezete (a WorldScene ezt olvassa)
for (const [key, m] of Object.entries(MAPS)) {
  if (!m.encounters) continue;
  assert.ok(m.encounters.default?.day?.length && m.encounters.default?.night?.length && m.encounters.default?.levels, `${key}: hiányos alap találkozási tábla`);
  for (const z of m.encounters.zones) assert.ok(z.rect && (z.levels || m.encounters.default.levels), `${key}: hibás zóna`);
}
console.log('✓ találkozási táblázatok rendben');

// Pozíció-mentés: falba/vízbe mentett hely biztonságos mezőre kerül
for (const key of Object.keys(MAPS)) {
  const w = walkable(key);
  for (const [x, y] of [[0, 0], [-5, 3], [999, 999], [w.start.x, w.start.y]]) {
    const p = safePosition(key, x, y); assert.ok(w.seen.has(p.x + ',' + p.y), `${key}: rossz biztonságos pozíció ${x},${y}`);
  }
}
console.log('✓ hibás mentett pozíciók minden térképen bejárható mezőre kerülnek');

// Minden átjáró érvényes, bejárható célmezőre visz, és minden térképről van út vissza
{
  const graph = {};
  for (const [key, m] of Object.entries(MAPS)) for (const w of m.warps) {
    if (w.back) continue; // épületből kilépés: a belépés helyére (returnTo) visz vissza
    assert.ok(MAPS[w.to], `${key}: átjáró nem létező térképre: ${w.to}`);
    const p = safePosition(w.to, w.tx, w.ty);
    assert.ok(!p.fixed, `${key} → ${w.to}: az érkezési mező (${w.tx},${w.ty}) nem bejárható`);
    (graph[key] ||= new Set()).add(w.to);
  }
  // épületek → belső terek
  for (const [key, m] of Object.entries(MAPS)) for (const b of m.buildings || []) if (MAPS['int_' + b.key]) (graph[key] ||= new Set()).add('int_' + b.key);
  const reach = (from) => { const s = new Set([from]); const q = [from]; while (q.length) for (const n of graph[q.shift()] || []) if (!s.has(n)) { s.add(n); q.push(n); } return s; };
  const fromStart = reach('mancsfalva');
  for (const key of Object.keys(MAPS).filter(k => !k.startsWith('int_'))) {
    assert.ok(fromStart.has(key), `${key} nem érhető el Mancsfalváról`);
    assert.ok(reach(key).has('mancsfalva'), `${key}: nincs út vissza Mancsfalvára`);
  }
  console.log(`✓ átjárók: minden érkezési mező bejárható, ${fromStart.size} térkép elérhető, mindenhonnan van út vissza`);
}
