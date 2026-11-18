// Automatikus frissítés az Android appban: induláskor megnézi, van-e újabb játékverzió,
// letölti a háttérben, és újraindítja a játékot (a mentések maradnak – ugyanaz a helyi tár).
// Ha nincs internet, a meglévő verzió indul. Hibás új verzió esetén az app magától visszaáll.
import { IS_APP, plugin } from './api.js';
import { G, save } from './state.js';
import { toast } from '../ui/ui.js';

const INFO_URL = 'https://raw.githubusercontent.com/heimedia1-cmyk/foci-elemzo/mexiverse-apk/version.json';

export async function initLiveUpdate(game) {
  if (!IS_APP) return;
  const U = plugin('CapacitorUpdater'); if (!U) return;
  try { await U.notifyAppReady(); } catch { /* */ } // jelzés: ez a verzió rendben elindult
  if (navigator.onLine === false) return;
  try {
    const r = await fetch(INFO_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const info = await r.json();
    const mine = window.MEXI_BUILD_ID || '';
    if (!info?.version || !info.url || info.version === mine) return;
    if (info.minNative && +info.minNative > +(window.MEXI_NATIVE || 0)) { toast('Új app-verzió érhető el – töltsd le az oldalról a legújabb APK-t.', 6000); return; }
    toast('⬇️ Frissítés letöltése...', 4000);
    const b = await U.download({ url: info.url, version: info.version });
    const inGame = game.scene.isActive('World') || game.scene.isActive('Battle') || game.scene.isActive('CoopBattle');
    if (!inGame) { toast('✨ Frissítve! Újraindítás...', 1500); await new Promise(r => setTimeout(r, 900)); await U.set(b); }
    else { try { if (G.state) save(); } catch { /* */ } await U.next(b); toast('✨ Frissítés letöltve – a következő indításkor érvényes.', 4000); }
  } catch (e) { console.warn('Frissítés kihagyva', e); }
}
