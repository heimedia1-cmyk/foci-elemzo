// MexiVerse – belépési pont.
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { CoopBattleScene } from './scenes/CoopBattleScene.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
window.MEXI_TOUCH = isTouch;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1430',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  powerPreference: 'high-performance',
  fps: { target: 60, min: 20, smoothStep: true },
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, TitleScene, WorldScene, BattleScene, CoopBattleScene],
});
window.MEXI_GAME = game;
import { initNative } from './systems/native.js';
initNative(game);
import { initLiveUpdate } from './systems/liveUpdate.js';
initLiveUpdate(game);

// Mobilon a böngésző görgetése ne zavarjon
document.addEventListener('gesturestart', (e) => e.preventDefault());
// hosszú nyomásra ne jöjjön böngészős helyi menü, dupla koppintásra ne nagyítson
document.addEventListener('contextmenu', (e) => { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault(); });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

// Fejlesztői segédlet (konzolból / automata tesztekhez)
import { G } from './systems/state.js';
window.MEXI_DEBUG = { G, game };

import { toast } from './ui/ui.js';
window.addEventListener('mexi-auth-expired', () => toast('Lejárt a belépésed – a mentés csak ezen az eszközön van. Lépj be újra a főmenüben.', 5000));

// Szövegmezőbe íráskor a játék billentyűkezelése szünetel (különben a W, A, S, D, E, I, J, P betűk nem íródnak be).
const isField = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
document.addEventListener('focusin', (e) => {
  if (!isField(e.target)) return;
  for (const sc of game.scene.getScenes(true)) { const kb = sc.input?.keyboard; if (kb) { kb.enabled = false; kb.disableGlobalCapture?.(); kb.resetKeys?.(); } }
});
document.addEventListener('focusout', (e) => {
  if (!isField(e.target)) return;
  for (const sc of game.scene.getScenes(true)) { const kb = sc.input?.keyboard; if (kb) { kb.enabled = true; kb.enableGlobalCapture?.(); } }
});
