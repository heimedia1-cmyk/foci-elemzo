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
