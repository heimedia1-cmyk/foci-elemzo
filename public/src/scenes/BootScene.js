import { registerArt } from '../art/registerArt.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    registerArt(this);
    this.scene.start('Title');
  }
}
