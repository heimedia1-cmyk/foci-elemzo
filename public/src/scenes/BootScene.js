import { hideSplash } from '../systems/native.js';
import { preloadArt, registerArt } from '../art/registerArt.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const { width: W, height: H } = this.scale;
    const bar = this.add.rectangle(W / 2 - 150, H / 2, 0, 14, 0xf0a030).setOrigin(0, 0.5);
    this.add.rectangle(W / 2, H / 2, 304, 18).setStrokeStyle(2, 0xffffff);
    this.add.text(W / 2, H / 2 - 30, 'MexiVerse betöltése...', { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '18px', color: '#fff' }).setOrigin(0.5);
    this.load.on('progress', (v) => { bar.width = 300 * v; });
    preloadArt(this);
  }
  create() {
    registerArt(this);
    hideSplash();
    this.scene.start('Title');
  }
}
