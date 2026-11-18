// Mentésszinkron: melyik mentés maradjon (revízió alapú, kliensóra-független)
globalThis.window = { addEventListener() {}, dispatchEvent() {} }; globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; globalThis.document = { addEventListener() {} };
const { pickSave } = await import('../public/src/systems/state.js');
const ok = (c, m) => { if (!c) throw new Error(m); };
const T = 1_800_000_000_000;
ok(pickSave(null, null) === 'none' && pickSave({}, null) === 'local' && pickSave(null, {}) === 'cloud', 'alapesetek');
ok(pickSave({ rev: 5, savedAt: T, syncedAt: T }, { rev: 7 }) === 'cloud', 'másik eszköz újabb mentése nem jött le');
ok(pickSave({ rev: 5, savedAt: T + 60000, syncedAt: T }, { rev: 7 }) === 'conflict', 'két eszköz párhuzamos haladása nem ütközés');
ok(pickSave({ rev: 7, savedAt: T + 60000, syncedAt: T }, { rev: 7 }) === 'local', 'fel nem töltött helyi haladás elveszett volna');
// kliensóra hiba: a helyi óra évekkel előrébb jár – a revízió dönt, nem az óra
ok(pickSave({ rev: 3, savedAt: T * 2, syncedAt: T * 2 }, { rev: 9, savedAt: 1 }) === 'cloud', 'rossz kliensóra felülírta az újabb felhős mentést');
// régi, revízió nélküli mentések
ok(pickSave({ savedAt: 10 }, { savedAt: 20 }) === 'cloud' && pickSave({ savedAt: 30 }, { savedAt: 20 }) === 'local', 'régi mentések kezelése');
console.log('✓ mentésszinkron: revízió alapú választás, ütközésfelismerés, kliensóra-független');
