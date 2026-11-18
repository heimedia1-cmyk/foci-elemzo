// Automatikus frissítés az Android appban – csatornánként elkülönítve.
//  • Az app csak a SAJÁT csatornája (test / stable) frissítéseit tölti le; 'dev' build sosem frissít.
//  • A csomag SHA-256 ellenőrzőösszeggel érkezik; sérült vagy hiányos letöltést a frissítő elutasít.
//  • A frissített verzió csak a sikeres indulás (grafika betöltve, címképernyő kész) után jelzi, hogy rendben van
//    (markAppReady). Ha ez elmarad, a frissítő a következő indításkor visszaáll az előző működő verzióra.
//  • A mentés a helyi tárban van, a frissítés nem érinti; csere előtt még egyszer mentünk.
import { IS_APP, plugin } from './api.js';
import { G, save } from './state.js';
import { toast } from '../ui/ui.js';

const BASE = 'https://raw.githubusercontent.com/heimedia1-cmyk/foci-elemzo/mexiverse-apk/';
export const CHANNEL = window.MEXI_CHANNEL || (IS_APP ? 'test' : 'dev'); // régi teszt-buildek csatorna nélkül: test
const BUNDLE_RE = /^b\d{1,7}$/;

/** Eldönti, hogy egy version.json elfogadható-e ehhez az apphoz (tesztelhető, tiszta függvény). */
export function acceptUpdate(info, { channel, current, native }) {
  if (!info || typeof info !== 'object') return 'invalid';
  if (channel !== 'test' && channel !== 'stable') return 'no-channel';
  if (info.channel !== channel) return 'wrong-channel';
  if (!BUNDLE_RE.test(info.version || '') || !/^[a-f0-9]{64}$/.test(info.checksum || '')) return 'invalid';
  if (!String(info.url || '').startsWith(BASE + channel + '/bundles/' + info.version + '.zip')) return 'bad-url';
  if (info.version === current) return 'same';
  const n = (v) => +String(v || 'b0').slice(1);
  if (n(info.version) < n(current)) return 'older';
  if (info.minNative && +info.minNative > +(native || 0)) return 'needs-apk';
  return 'ok';
}

let readySent = false;
/** A játék sikeresen elindult → ez a verzió jó (különben a frissítő visszaáll). */
export async function markAppReady() {
  if (!IS_APP || readySent) return; readySent = true;
  try { await plugin('CapacitorUpdater')?.notifyAppReady(); } catch { /* */ }
}

export async function initLiveUpdate(game) {
  if (!IS_APP) return;
  const U = plugin('CapacitorUpdater'); if (!U) return;
  if (CHANNEL !== 'test' && CHANNEL !== 'stable') return;
  if (navigator.onLine === false) return;
  try {
    const r = await fetch(BASE + CHANNEL + '/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const info = await r.json();
    const verdict = acceptUpdate(info, { channel: CHANNEL, current: window.MEXI_BUILD_ID, native: window.MEXI_NATIVE });
    if (verdict === 'needs-apk') { toast('Új app-verzió érhető el – töltsd le a legújabb APK-t a játék oldaláról.', 6000); return; }
    if (verdict !== 'ok') return;
    toast('⬇️ Frissítés letöltése...', 4000);
    const b = await U.download({ url: info.url, version: info.version, checksum: info.checksum });
    const inGame = game.scene.isActive('World') || game.scene.isActive('Battle') || game.scene.isActive('CoopBattle');
    try { if (G.state) save(); } catch { /* */ }
    if (!inGame) { toast('✨ Frissítve! Újraindítás...', 1500); await new Promise(res => setTimeout(res, 900)); await U.set(b); }
    else { await U.next(b); toast('✨ Frissítés letöltve – a következő indításkor érvényes.', 4000); }
  } catch (e) { console.warn('Frissítés kihagyva', e); }
}
