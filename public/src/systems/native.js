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
  if (!IS_APP) return;
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
