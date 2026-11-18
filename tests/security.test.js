// Szerveroldali ellenőrzések: csalás és hibás adatok
import { sanitizeMexi, sanitizeSave, sanitizeCoopParty, sanitizeAction, serverEncounterTable } from '../server/validate.js';
import { createMexi } from '../public/src/systems/mexi.js';
import { CoopBattle } from '../public/src/systems/coopBattle.js';
const ok = (c, msg) => { if (!c) throw new Error(msg); };

// 1) felfújt statok: a szerver újraszámolja
const m = createMexi('alap', 3); const real = m.stats.atk;
const fake = { ...m, stats: { ...m.stats, atk: 100000 }, hp: 99999, level: 999, ivs: { hp: 99, atk: 99 }, moves: [{ id: 'nincsilyen', pp: 99 }, { id: 'harapas', pp: 999 }] };
const c = sanitizeMexi(fake);
ok(c.stats.atk < 200 && c.level === 50 && c.hp === c.stats.hp && c.ivs.atk === 15, 'statok nincsenek újraszámolva');
ok(c.moves.length === 1 && c.moves[0].id === 'harapas' && c.moves[0].pp <= 35, 'hibás támadás átment');
ok(sanitizeMexi({ species: 'kamu' }) === null, 'nem létező faj átment');

// 2) közös harc: felhős mentéshez kötve a szint sem hamisítható
const cloud = { party: [m], storage: [] };
const p = sanitizeCoopParty([{ ...m, level: 40 }, createMexi('sarkany', 50)], cloud, 10);
ok(p.length === 1 && p[0].level === 3, 'felhős ellenőrzés nem működik');
const g = sanitizeCoopParty([{ ...m, level: 40 }], null, 10);
ok(g[0].level === 10, 'vendég szintkorlát nem működik');

// 3) érvénytelen harci lépés nem fagyasztja le a harcot
const b = new CoopBattle({ players: [{ id: 'a', name: 'A', party: [createMexi('alap', 5)], inventory: {} }, { id: 'b', name: 'B', party: [createMexi('beka', 5)], inventory: {} }], foes: [createMexi('alap', 5), createMexi('alap', 5)], cap: 10 });
ok(sanitizeAction(b, 'a', { type: 'move', index: 99 }) === null, 'rossz támadásindex átment');
ok(sanitizeAction(b, 'a', { type: 'ball', itemId: 'hos_labda' }) === null, 'nem létező labda átment');
ok(sanitizeAction(b, 'x', { type: 'run' }) === null, 'idegen játékos lépése átment');
ok(sanitizeAction(b, 'a', { type: 'move', index: 0, target: 7 }).target === 0, 'rossz célpont nem javult');

// 4) a vad Mexik táblázata a szerverről jön, és csak fűben/barlangban
ok(serverEncounterTable('mancsfalva', 6, 20, 12) === null, 'a faluban is lehetett harcot kérni');
let grass = null; const { MAPS } = await import('../public/src/data/maps.js');
MAPS.osveny.tiles.forEach((r, y) => r.forEach((ch, x) => { if (!grass && ch === '"') grass = [x, y]; }));
const t = serverEncounterTable('osveny', grass[0], grass[1], 12);
ok(t && t.table.length && !t.table.some(([sp]) => sp === 'fonix'), 'fűben nincs táblázat');

// 5) mentés: pénzugrás és hibás tárgyak
const prev = { party: [m], storage: [], money: 1000, serverSavedAt: Date.now() };
const r = sanitizeSave({ party: [m], storage: [], money: 9999999, inventory: { hos_labda: 5000, kamu: 3 } }, prev);
ok(r.save.money <= 1000 + 8000 && r.save.inventory.hos_labda <= 1 && !r.save.inventory.kamu, 'mentés-ellenőrzés gyenge');
ok(sanitizeSave({ party: [], storage: [], money: 0 }, prev).error, 'üres mentés felülírhatta a régit');
// 6) szabálytalan támadás, nem megszerezhető faj, IV/shiny átírás, fajcsere, szintugrás
{
  const { legalMoves } = await import('../server/validate.js');
  const a = createMexi('alap', 5);
  const hacked = { ...a, moves: [{ id: 'pokoltuz', pp: 5 }, { id: 'harapas', pp: 35 }] };
  const c2 = sanitizeMexi(hacked);
  ok(!c2.moves.some(x => x.id === 'pokoltuz') && c2.moves.some(x => x.id === 'harapas'), 'szabálytalan támadás bent maradt');
  ok(legalMoves('hosmexi', 20).has('harapas'), 'az előző alak támadásai nem szabályosak');
  const prev2 = { party: [a], storage: [], money: 100, inventory: {}, serverSavedAt: Date.now() - 60000 };
  const s2 = sanitizeSave({ party: [{ ...a, ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, shiny: true, level: 50 }, createMexi('fonix', 50)], storage: [], money: 100, inventory: { arany_labda: 50 } }, prev2);
  const p0 = s2.save.party[0];
  ok(p0.shiny === a.shiny && p0.ivs.atk === a.ivs.atk, 'IV/shiny átírható');
  ok(p0.level <= a.level + 8, 'szintugrás nem korlátozott: ' + p0.level);
  ok(!s2.save.party.some(m => m.species === 'fonix') && s2.save.quarantine.length === 1, 'nem megszerezhető faj bekerült (vagy elveszett a karanténból)');
  ok(s2.save.inventory.arany_labda <= 3, 'aranylabda halmozható');
  const s3 = sanitizeSave({ party: [{ ...a, species: 'gyemant' }], storage: [], money: 100 }, prev2);
  ok(s3.save.party[0].species === 'alap', 'fajcsere fejlődés nélkül átment');
  const s4 = sanitizeSave({ party: [{ ...a, species: 'hosmexi' }], storage: [], money: 100 }, prev2);
  ok(s4.save.party[0].species === 'hosmexi', 'szabályos fejlődést elutasított');
  // régi, szabályos mentés változatlanul átmegy
  const legit = createMexi('beka', 12); const s5 = sanitizeSave({ party: [legit], storage: [], money: 500, inventory: { sima_labda: 5 }, map: 'osveny', pos: { x: 15, y: 54, dir: 'up' } }, null);
  ok(s5.save.party[0].level === 12 && s5.save.party[0].moves.length === legit.moves.length && s5.save.inventory.sima_labda === 5 && s5.report.length === 0, 'szabályos mentést módosított: ' + s5.report);
}
// 7) közös harc: tárgyak pontosan a felhős készletig, vendégnek szigorú korlát
{
  const { safeInv } = await import('../server/coop.js');
  ok(safeInv({ arany_labda: 6, sima_labda: 3 }, { inventory: { arany_labda: 1, sima_labda: 10 } }).arany_labda === 1, 'közös harcban több labda vihető be, mint amennyi van');
  ok(!safeInv({ hos_labda: 3, arany_labda: 3 }, null).hos_labda && !safeInv({ arany_labda: 3 }, null).arany_labda, 'vendég ritka labdát vihet be');
}
console.log('✓ biztonság: statok újraszámolva, felhős szintellenőrzés, hibás lépések kiszűrve, szerveroldali Mexi-táblázat, mentés-ellenőrzés, szabályos támadások, karantén, IV/shiny/faj védelem, közös harc tárgykorlát');
