// Android frissítési csatornák: a teszt soha nem juthat az élesbe
globalThis.window = globalThis.window || {}; globalThis.navigator ??= {};
const { acceptUpdate } = await import('../public/src/systems/liveUpdate.js').catch(async () => {
  // a modul böngészős függőségei miatt csak a tiszta függvényt töltjük be
  const src = (await import('node:fs')).readFileSync(new URL('../public/src/systems/liveUpdate.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('const BASE'), src.indexOf('let readySent'));
  return { acceptUpdate: new Function(fn.replace('export function acceptUpdate', 'function acceptUpdate').replace(/export const CHANNEL.*\n/, '') + '\nreturn acceptUpdate;')() };
});
const B = 'https://raw.githubusercontent.com/heimedia1-cmyk/foci-elemzo/mexiverse-apk/';
const sha = 'a'.repeat(64);
const mk = (ch, v, extra = {}) => ({ channel: ch, version: v, url: `${B}${ch}/bundles/${v}.zip`, checksum: sha, minNative: 2, ...extra });
const ok = (c, m) => { if (!c) throw new Error(m); };
ok(acceptUpdate(mk('test', 'b20'), { channel: 'stable', current: 'b10', native: 2 }) === 'wrong-channel', 'teszt csomag az élesbe jutott!');
ok(acceptUpdate({ ...mk('stable', 'b20'), url: `${B}test/bundles/b20.zip` }, { channel: 'stable', current: 'b10', native: 2 }) === 'bad-url', 'éles leírás teszt csomagra mutathatott');
ok(acceptUpdate(mk('stable', 'b20'), { channel: 'stable', current: 'b10', native: 2 }) === 'ok', 'jó éles frissítés elutasítva');
ok(acceptUpdate(mk('test', 'b20'), { channel: 'test', current: 'b10', native: 2 }) === 'ok', 'jó teszt frissítés elutasítva');
ok(acceptUpdate(mk('test', 'b20'), { channel: 'dev', current: 'b10', native: 2 }) === 'no-channel', 'fejlesztői build frissült');
ok(acceptUpdate(mk('test', 'b9'), { channel: 'test', current: 'b10', native: 2 }) === 'older', 'visszafelé frissített');
ok(acceptUpdate(mk('test', 'b10'), { channel: 'test', current: 'b10', native: 2 }) === 'same', 'ugyanazt újra letöltötte');
ok(acceptUpdate(mk('test', 'b20', { checksum: 'xyz' }), { channel: 'test', current: 'b10', native: 2 }) === 'invalid', 'ellenőrzőösszeg nélkül elfogadta');
ok(acceptUpdate(mk('test', 'b20', { minNative: 3 }), { channel: 'test', current: 'b10', native: 2 }) === 'needs-apk', 'natív verzió-őr hiányzik');
console.log('✓ frissítési csatornák: teszt → éles kizárva, verzió/ellenőrzőösszeg/URL/natív verzió ellenőrizve');
