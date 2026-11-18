// Közös harc szimuláció: node tests/coop.test.js
import assert from 'node:assert/strict';
import { CoopBattle, coopLevelCap } from '../public/src/systems/coopBattle.js';
import { createMexi } from '../public/src/systems/mexi.js';
let wins = 0, total = 300;
for (let i = 0; i < total; i++) {
  const A = [createMexi('alap', 8), createMexi('beka', 6)], B = [createMexi('lang', 25), createMexi('mehecske', 5)];
  const cap = coopLevelCap(8, 25, 5);
  const eff = (Math.min(8, cap) + Math.min(25, cap)) / 2;
  const b = new CoopBattle({ players: [{ id: 'a', name: 'A', party: A, inventory: { sima_labda: 3 } }, { id: 'b', name: 'B', party: B, inventory: {} }], foes: [createMexi('beka', Math.round(eff) + 1), createMexi('nindzsa', Math.round(eff) + 2)], cap });
  assert.ok(b.allies[1].party[0].level <= cap, 'szinthatár');
  let g = 0;
  while (!b.over && g++ < 200) {
    for (const id of b.waitingFor()) {
      const ev = b.submit(id, i % 7 === 0 && id === 'a' ? { type: 'ball', itemId: 'sima_labda', target: 0 } : { type: 'move', index: 0, target: b.livingFoes()[0] ?? 0 });
    }
  }
  assert.ok(b.over, 'a harc nem ért véget');
  if (b.result === 'win') wins++;
  const r = b.resultFor('b');
  assert.equal(r.party[0].level >= 25, true, 'a valódi szint nem csökkenhet');
  assert.ok(r.party.every(m => m.hp <= m.stats.hp));
}
console.log(`✓ közös harc: ${total} szimuláció, győzelmi arány ${Math.round(wins / total * 100)}% (szinthatár mellett)`);

// Let's Go-stílus: közös dobás → mindketten megkapják, normál statokkal
{
  const { setRng } = await import('../public/src/systems/mexi.js');
  const foe = createMexi('virag', 10); foe.stats.hp = Math.round(foe.stats.hp * 1.8); foe.hp = foe.stats.hp; foe._boss = true;
  const b = new CoopBattle({ players: [{ id: 'a', name: 'A', party: [createMexi('alap', 10)], inventory: { sima_labda: 2 } }, { id: 'b', name: 'B', party: [createMexi('lang', 10)], inventory: { profi_labda: 1 } }], foes: [foe], cap: 15 });
  setRng(() => 0);
  try {
    b.submit('a', { type: 'ball', itemId: 'sima_labda', target: 0 });
    b.submit('b', { type: 'ball', itemId: 'profi_labda', target: 0 });
  } finally { setRng(Math.random); }
  assert.ok(b.over, 'közös dobás után vége');
  const ra = b.resultFor('a'), rb = b.resultFor('b');
  assert.equal(ra.caught.length, 1); assert.equal(rb.caught.length, 1);
  assert.ok(!ra.caught[0]._boss && ra.caught[0].hp <= ra.caught[0].stats.hp, 'normál statok');
  assert.equal(ra.inventory.sima_labda, 1); assert.equal(rb.inventory.profi_labda, 0);
  console.log('✓ közös dobás: mindketten megkapják');
}
