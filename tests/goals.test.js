import assert from 'node:assert/strict';
import { nextGoal } from '../public/src/systems/goals.js';
import { BattleEngine } from '../public/src/systems/battleEngine.js';
const base = { flags: {}, defeatedTrainers: [], dex: { caught: {} }, map: 'mancsfalva' };
assert.match(nextGoal(base).short, /Szimat/);
assert.match(nextGoal({ ...base, flags: { starter: 1 } }).short, /első vad/);
assert.match(nextGoal({ ...base, flags: { starter: 1, firstFrog: 1 } }).short, /Bencét/);
assert.match(nextGoal({ ...base, flags: { starter: 1, firstFrog: 1 }, defeatedTrainers: ['bence'] }).short, /Lilit/);
assert.match(nextGoal({ ...base, flags: { starter: 1, firstFrog: 1 }, defeatedTrainers: ['bence', 'lili'] }).short, /Erdő/);
assert.match(nextGoal({ ...base, map: 'erdo', flags: { starter: 1, firstFrog: 1 }, defeatedTrainers: ['bence', 'lili'] }).short, /Edzők/);
assert.match(nextGoal({ ...base, flags: { starter: 1, firstFrog: 1 }, defeatedTrainers: ['bence', 'lili', 'mate', 'reka'] }).short, /Bodz/);
assert.match(nextGoal({ ...base, flags: { starter: 1, firstFrog: 1 }, defeatedTrainers: ['bence', 'lili', 'mate', 'reka', 'bodza'] }).short, /Lotti/);
assert.match(nextGoal({ ...base, flags: { starter: 1, firstFrog: 1 }, defeatedTrainers: ['bence', 'lili', 'mate', 'reka', 'bodza', 'lotti', 'volt', 'kaori', 'frida', 'pal', 'luna'] }).short, /Mexidex: 0\//);
console.log('goals ok');

// altatási szabály: ugyanaz az ellenfél egy harcban csak egyszer altatható el
{
  const { createMexi, setRng } = await import('../public/src/systems/mexi.js');
  const p = createMexi('alap', 20), f = createMexi('alap', 20);
  p.moves = [{ id: 'viragpor', pp: 15 }];
  const e = new BattleEngine({ playerParty: [p], foeParty: [f], isTrainer: false, inventory: {} });
  setRng(() => 0); // mindig talál
  try {
    const ev0 = []; e.executeMove('p', 0, ev0); if (f.status !== 'alvas') throw new Error('első altatás nem sikerült');
    f.status = null; const ev = []; e.executeMove('p', 0, ev);
    if (f.status === 'alvas') throw new Error('altatási szabály nem működik');
    if (!ev.some(x => /egyszer elaludt/.test(x.text || ''))) throw new Error('nincs üzenet');
  } finally { setRng(Math.random); }
  console.log('sleep clause ok');
}
