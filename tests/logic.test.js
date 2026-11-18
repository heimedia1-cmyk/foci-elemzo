// Logikai tesztek: node tests/logic.test.js
import assert from 'node:assert/strict';
import { TYPE_CHART, effectiveness } from '../public/src/data/types.js';
import { MEXIS } from '../public/src/data/mexis.js';
import { MOVES } from '../public/src/data/moves.js';
import { createMexi, gainXp, xpForLevel, canEvolve, evolve } from '../public/src/systems/mexi.js';
import { captureChance, throwBall } from '../public/src/systems/capture.js';
import { BattleEngine, calcDamage } from '../public/src/systems/battleEngine.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('típusmátrix', () => {
  assert.equal(TYPE_CHART.tuz.noveny, 2); assert.equal(TYPE_CHART.viz.tuz, 2);
  assert.equal(TYPE_CHART.villam.fold, 0); assert.equal(TYPE_CHART.tuz.viz, 0.5);
  assert.equal(TYPE_CHART.semleges.tuz, 1); assert.equal(effectiveness('fold', ['viz', 'noveny']), 0.5);
  for (const a in TYPE_CHART) for (const d in TYPE_CHART[a]) assert.ok([0, 0.5, 1, 2].includes(TYPE_CHART[a][d]));
});
t('adatok épek', () => {
  for (const [id, m] of Object.entries(MEXIS)) {
    for (const [, mv] of m.learnset) assert.ok(MOVES[mv], id + ' ismeretlen támadás ' + mv);
    if (m.evolve) assert.ok(MEXIS[m.evolve.to]);
  }
});
t('Mexi létrehozás', () => {
  const m = createMexi('alap', 5);
  assert.ok(m.uid && m.moves.length >= 1 && m.moves.length <= 4 && m.hp === m.stats.hp);
  const a = createMexi('beka', 5), b = createMexi('beka', 5);
  assert.notEqual(a.uid, b.uid);
});
t('XP és szintlépés', () => {
  const m = createMexi('alap', 5);
  const ev = gainXp(m, xpForLevel(8) - m.xp);
  assert.equal(m.level, 8); assert.ok(ev.some(e => e.type === 'levelup'));
  assert.ok(m.moves.some(x => x.id === 'gyorsmancs'));
});
t('fejlődés', () => {
  const m = createMexi('beka', 15); gainXp(m, xpForLevel(16) - m.xp);
  assert.equal(canEvolve(m), 'mocsarkiraly'); evolve(m, 'mocsarkiraly'); assert.equal(m.species, 'mocsarkiraly');
});
t('befogás: kevesebb HP = könnyebb, jobb labda = könnyebb', () => {
  const m = createMexi('beka', 4);
  const full = captureChance(m, 'sima_labda'); m.hp = 1;
  const low = captureChance(m, 'sima_labda'); const pro = captureChance(m, 'profi_labda');
  assert.ok(low > full && pro >= low, `${full} ${low} ${pro}`);
  const leg = createMexi('sarkany', 30); assert.ok(captureChance(leg, 'sima_labda') < 0.1);
  let caught = 0; for (let i = 0; i < 2000; i++) if (throwBall(m, 'sima_labda').caught) caught++;
  assert.ok(caught > 1000);
});
t('sebzés: szuperhatékony > semleges', () => {
  const a = createMexi('beka', 10), fire = createMexi('lang', 10), neu = createMexi('alap', 10);
  const s = calcDamage(a, fire, MOVES.vizpermet, {}, {}, { forceCrit: false, fixedRandom: 1 });
  const n2 = calcDamage(a, neu, MOVES.vizpermet, {}, {}, { forceCrit: false, fixedRandom: 1 });
  assert.equal(s.eff, 2); assert.ok(s.dmg > n2.dmg);
});
t('teljes harc szimuláció (vad, edző, befogás)', () => {
  for (let i = 0; i < 300; i++) {
    const party = [createMexi('alap', 6), createMexi('beka', 5)];
    const inv = { sima_labda: 5, kis_ital: 2 };
    const isTrainer = i % 2 === 0;
    const e = new BattleEngine({ playerParty: party, foeParty: isTrainer ? [createMexi('mehecske', 5), createMexi('nindzsa', 6)] : [createMexi('beka', 4)], isTrainer, trainerName: 'Teszt', inventory: inv });
    let guard = 0;
    while (!e.over && guard++ < 200) {
      let ev;
      if (!isTrainer && e.fm.hp < e.fm.stats.hp / 2 && inv.sima_labda > 0) ev = e.playerAction({ type: 'item', itemId: 'sima_labda' });
      else ev = e.playerAction({ type: 'move', index: Math.floor(Math.random() * e.pm.moves.length) });
      if (ev.some(x => x.t === 'needSwitch')) e.forcedSwitch(e.p.party.findIndex(m => m.hp > 0));
    }
    assert.ok(e.over, 'harc nem ért véget');
  }
});
t('közös XP: a nem harcoló csapattag is fejlődik', () => {
  const a = createMexi('alap', 5), b2 = createMexi('beka', 5); const xb = b2.xp;
  const e = new BattleEngine({ playerParty: [a, b2], foeParty: [createMexi('mehecske', 3)] });
  e.fm.hp = 0; e.checkFaints([]);
  assert.ok(b2.xp > xb, 'a második Mexi nem kapott XP-t');
  assert.ok(a.xp - xpForLevel(5) > b2.xp - xb);
});
console.log(`\n${n} teszt sikeres.`);

// --- támadások: max 4, evolúció/újratanulás ---
{
  const { createMexi, gainXp, relearnable, evolve } = await import('../public/src/systems/mexi.js');
  const { MEXIS } = await import('../public/src/data/mexis.js');
  let ok = true;
  for (const sp of Object.keys(MEXIS)) {
    const m = createMexi(sp, 5);
    for (let i = 0; i < 40; i++) gainXp(m, 5000);
    if (m.moves.length > 4) ok = false;
    const r = relearnable(m);
    if (r.some(id => m.moves.some(x => x.id === id))) ok = false;
    const evo = MEXIS[sp].evolve; if (evo && evo.to) { const p = evolve(m, evo.to); if (!Array.isArray(p) || m.moves.length > 4) ok = false; }
  }
  if (!ok) throw new Error('támadás-szabály sérült');
  console.log('✓ legfeljebb 4 támadás, újratanulási lista rendben');
}

// --- egyidejű kiütés, érvénytelen csere/tárgy, ájult fejlődés ---
{
  const { createMexi, evolve } = await import('../public/src/systems/mexi.js');
  const { BattleEngine } = await import('../public/src/systems/battleEngine.js');
  // körvégi égés mindkét utolsó Mexin → döntetlen (nem győzelem)
  const p = createMexi('alap', 10), f = createMexi('alap', 10);
  p.status = 'eges'; f.status = 'eges';
  const e = new BattleEngine({ playerParty: [p], foeParty: [f], isTrainer: true, trainerName: 'X', inventory: {} });
  p.hp = 1; f.hp = 1; const ev = []; e.endOfTurn(ev);
  if (e.result !== 'draw') throw new Error('egyidejű kiütés eredménye hibás: ' + e.result);
  // csak az ellenfél esik ki → győzelem; csak a játékos → vereség
  const e2 = new BattleEngine({ playerParty: [createMexi('alap', 10)], foeParty: [createMexi('alap', 10)], isTrainer: false, inventory: {} });
  e2.fm.hp = 0; e2.checkFaints([]); if (e2.result !== 'win') throw new Error('győzelem hibás');
  // érvénytelen csere / tárgy nem veszi el a kört és nem fogy tárgy
  const a = createMexi('alap', 8), b = createMexi('beka', 8); b.hp = 0;
  const e3 = new BattleEngine({ playerParty: [a, b], foeParty: [createMexi('alap', 3)], isTrainer: false, inventory: { kis_ital: 1 } });
  const hpBefore = a.hp;
  e3.playerAction({ type: 'switch', index: 1 }); e3.playerAction({ type: 'switch', index: 7 }); e3.playerAction({ type: 'switch', index: 0 });
  if (e3.p.active !== 0 || a.hp !== hpBefore) throw new Error('érvénytelen csere elfogadva vagy kört vett el');
  e3.playerAction({ type: 'item', itemId: 'kis_ital', target: 9 });
  e3.playerAction({ type: 'item', itemId: 'nagy_ital', target: 0 });
  if (e3.inventory.kis_ital !== 1 || a.hp !== hpBefore) throw new Error('érvénytelen tárgyhasználat');
  // ájult Mexi fejlődés után is ájult
  const m = createMexi('alap', 18); m.hp = 0; evolve(m, 'hosmexi');
  if (m.hp !== 0) throw new Error('fejlődés feltámasztotta az ájult Mexit');
  const m2 = createMexi('alap', 18); m2.hp = 10; evolve(m2, 'hosmexi');
  if (m2.hp <= 0) throw new Error('élő Mexi fejlődés után ájult');
  console.log('✓ egyidejű kiütés = döntetlen, érvénytelen csere/tárgy elutasítva, ájult fejlődés nem gyógyít');
}
