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
ok(r.save.money <= 1000 + 8000 && r.save.inventory.hos_labda === 999 && !r.save.inventory.kamu, 'mentés-ellenőrzés gyenge');
ok(sanitizeSave({ party: [], storage: [], money: 0 }, prev).error, 'üres mentés felülírhatta a régit');
console.log('✓ biztonság: statok újraszámolva, felhős szintellenőrzés, hibás lépések kiszűrve, szerveroldali Mexi-táblázat, mentés-ellenőrzés');
