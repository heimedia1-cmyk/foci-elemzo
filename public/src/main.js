// MexiVerse – belépési pont.
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { WorldScene } from './scenes/WorldScene.js';
import { BattleScene } from './scenes/BattleScene.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
window.MEXI_TOUCH = isTouch;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1b1430',
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, TitleScene, WorldScene, BattleScene],
});
window.MEXI_GAME = game;

// Mobilon a böngésző görgetése ne zavarjon
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Fejlesztői segédlet (konzolból / automata tesztekhez)
import { G } from './systems/state.js';
window.MEXI_DEBUG = { G, game };

import { toast } from './ui/ui.js';
window.addEventListener('mexi-auth-expired', () => toast('Lejárt a belépésed – a mentés csak ezen az eszközön van. Lépj be újra a főmenüben.', 5000));
