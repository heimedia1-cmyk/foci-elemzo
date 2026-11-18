// Android app (Capacitor) integráció: vissza gomb, teljes képernyő, háttérbe kerülés, indítóképernyő.
// Böngészőben is fut a háttérbe kerülés kezelése (mentés + renderelés szüneteltetése).
import { IS_APP, plugin } from './api.js';
import { G, save } from './state.js';
import { UI, choose } from '../ui/ui.js';

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
let paused = false;

function pauseGame(game) {
  if (paused) return; paused = true;
  try { if (G.state) save(); } catch { /* */ }
  window.dispatchEvent(new Event('mexi-app-pause'));   // pl. a joystick elengedése
  try { game.loop.sleep(); } catch { /* */ }            // nincs renderelés a háttérben → kíméli az akkumulátort
  try { game.sound?.pauseAll?.(); } catch { /* */ }
}
function resumeGame(game) {
  if (!paused) return; paused = false;
  try { game.loop.wake(); } catch { /* */ }
  for (const s of game.scene.getScenes(true)) { try { s.input?.keyboard?.resetKeys(); } catch { /* */ } }
  window.dispatchEvent(new Event('mexi-app-resume'));
}

export async function initNative(game) {
  // böngészőben és appban is: láthatóság-váltás
  document.addEventListener('visibilitychange', () => (document.hidden ? pauseGame(game) : resumeGame(game)));
  window.addEventListener('pagehide', () => { try { if (G.state) save(); } catch { /* */ } });
  if (!IS_APP) { initBrowserFullscreen(); return; }
  document.body.classList.add('is-app');

  const StatusBar = plugin('StatusBar');
  try { await StatusBar?.setOverlaysWebView({ overlay: true }); await StatusBar?.hide(); } catch { /* */ }

  const App = plugin('App');
  App?.addListener('pause', () => pauseGame(game));
  App?.addListener('resume', () => resumeGame(game));
  App?.addListener('backButton', async () => {
    // ha van nyitott ablak / párbeszéd / választás: az Esc ugyanazt teszi, mint a B gomb
    if (document.querySelector('#dialog') && !document.querySelector('.choices, .win')) { key('Enter'); return; } // párbeszéd: tovább
    const openWin = document.querySelector('.win, .choices, .go-catch, #go');
    if (openWin || UI.busy) { key('Escape'); return; }
    const battle = game.scene.isActive('Battle') || game.scene.isActive('CoopBattle');
    if (battle) { key('Escape'); return; }
    if (window._exitAsk) return; window._exitAsk = true;
    const c = await choose(['Kilépés', 'Maradok'], { question: 'Kilépsz a MexiVerse-ből? (A játékot elmentjük.)' });
    window._exitAsk = false;
    if (c === 0) { try { if (G.state) save(); } catch { /* */ } App.exitApp(); }
  });
}

/** Az indítóképernyő eltüntetése, ha betöltött a játék. */
export function hideSplash() { try { plugin('SplashScreen')?.hide({ fadeOutDuration: 250 }); } catch { /* */ } }

// ---- Böngésző: teljes képernyő (első érintésre magától, utána a ⛶ gombbal ki/be) ----
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOk = () => !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
export async function toggleFullscreen(on = !fsEl()) {
  try {
    if (on && !fsEl()) {
      const d = document.documentElement;
      await (d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen());
    } else if (!on && fsEl()) await (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen());
  } catch { /* a böngésző elutasította (pl. nem felhasználói mozdulatból) */ }
}
function initBrowserFullscreen() {
  if (!fsOk()) return;   // pl. iPhone Safari: nincs Fullscreen API
  const btn = document.createElement('button');
  btn.id = 'fsbtn'; btn.title = 'Teljes képernyő (F)'; btn.setAttribute('aria-label', 'Teljes képernyő');
  const sync = () => { btn.textContent = fsEl() ? '🗗' : '⛶'; btn.classList.toggle('on', !!fsEl()); setTimeout(() => window.dispatchEvent(new Event('resize')), 120); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
  document.body.appendChild(btn); sync();
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  window.addEventListener('keydown', (e) => { if ((e.key === 'f' || e.key === 'F') && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) toggleFullscreen(); });
  // első érintés/kattintás: automatikusan teljes képernyő (a böngésző csak felhasználói mozdulatra engedi)
  let asked = false;
  const first = () => { if (asked) return; asked = true; toggleFullscreen(true); };
  document.addEventListener('pointerup', first, { capture: true });
  document.addEventListener('keyup', first, { capture: true });
}
