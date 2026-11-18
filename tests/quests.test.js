// Napi és heti küldetések: forduló napok, dupla jutalom kizárása
globalThis.window = { addEventListener() {}, dispatchEvent() {} }; globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.document = { addEventListener() {} };
const { dayId, weekId, dailyQuests, claimQuest, questEvent, questDef } = await import('../public/src/systems/quests.js');
const { G, newGameState } = await import('../public/src/systems/state.js');
const ok = (c, m) => { if (!c) throw new Error(m); };
// 2026-11-16 hétfő, 11-21 szombat, 11-22 vasárnap, 11-23 hétfő
const D = (y, mo, d, h = 12) => new Date(y, mo - 1, d, h);
ok(weekId(D(2026, 11, 16, 0)) === weekId(D(2026, 11, 22, 23)), 'a hét közben (pl. szombaton) váltott');
ok(weekId(D(2026, 11, 22, 23)) !== weekId(D(2026, 11, 23, 0)), 'hétfőn nem váltott');
ok(weekId(D(2026, 11, 21)) === 'W2026-11-16', 'rossz hétazonosító: ' + weekId(D(2026, 11, 21)));
ok(weekId(D(2027, 1, 1)) === 'W2026-12-28', 'évfordulón rossz hét');
ok(dayId(D(2026, 11, 18, 0)) === '2026-11-18' && dayId(D(2026, 11, 18, 23)) === '2026-11-18', 'a nap közben váltott');
// dupla jutalom: átvétel után ugyanaz a nap/hét újra előkerülve sem adható át
G.state = newGameState('Teszt');
const q = dailyQuests(); const it = q.list[0]; const def = questDef(it.id);
it.prog = def.goal; const m0 = G.state.money;
ok(claimQuest(it.id), 'teljesített küldetés nem vehető át');
ok(!claimQuest(it.id), 'kétszer átvehető');
const saved = q.date; G.state.quests.date = '2000-01-01'; dailyQuests(); // pl. időzóna-váltás, majd vissza
G.state.quests = null; const again = dailyQuests();
ok(again.date === saved && again.list.find(x => x.id === it.id).claimed, 'nap újrakezdésekor újra átvehető lett');
G.state.weekly.prog = 25; ok(claimQuest('weekly'), 'heti cél nem vehető át'); G.state.weekly = null; dailyQuests();
ok(G.state.weekly.claimed && !claimQuest('weekly'), 'heti cél kétszer átvehető');
console.log('✓ küldetések: napi forduló helyi éjfélkor, heti hétfőn, dupla jutalom kizárva');
