// Harci látványelemek kódból (új kép nélkül): bevezető, árnyék, légzés, környezeti részecskék,
// becsapódás-szikrák, sebzésszámok, ájulási por, szintlépési fényoszlop.
// „Csökkentett effektek” beállításnál a folyamatos és díszítő elemek kimaradnak.
import { getControls } from '../ui/touch.js';
import { TYPES } from '../data/types.js';

export const fxLow = () => getControls().fx === 'low';
export const typeColor = (t) => parseInt((TYPES[t]?.color || '#ffffff').slice(1), 16);

/** Harc eleji átmenet: két fekete sáv nyílik szét, rövid villanással. */
export async function introBars(scene) {
  const { width: W, height: H } = scene.scale;
  const top = scene.add.rectangle(0, 0, W, H / 2, 0x000000).setOrigin(0).setDepth(1000);
  const bot = scene.add.rectangle(0, H / 2, W, H / 2, 0x000000).setOrigin(0).setDepth(1000);
  scene.cameras.main.flash(220, 255, 255, 255);
  await new Promise(r => scene.tweens.add({ targets: top, y: -H / 2, duration: 480, ease: 'Cubic.in', delay: 120 }) && scene.tweens.add({ targets: bot, y: H, duration: 480, ease: 'Cubic.in', delay: 120, onComplete: r }));
  top.destroy(); bot.destroy();
}

/** Környezeti részecskék a háttér szerint (virágpor, levelek, szentjánosbogarak, kristálycsillanás). */
export function ambient(scene, bg) {
  scene._amb?.forEach(o => o.destroy()); scene._amb = [];
  if (fxLow()) return;
  const W = scene.scale.width, H = scene.fieldH, u = Math.max(2, scene.sc / 2);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const kind = bg.endsWith('_night') ? 'firefly' : bg === 'forest' ? 'leaf' : bg === 'crystal' ? 'twinkle' : 'pollen';
  const n = kind === 'twinkle' ? 16 : 14;
  for (let i = 0; i < n; i++) {
    let o;
    if (kind === 'firefly') {
      o = scene.add.rectangle(rnd(0, W), rnd(H * 0.15, H * 0.8), u * 1.5, u * 1.5, 0xe8ff80).setDepth(-8).setAlpha(0);
      scene.tweens.add({ targets: o, alpha: { from: 0, to: 0.9 }, duration: rnd(900, 1600), yoyo: true, repeat: -1, delay: rnd(0, 2000) });
      scene.tweens.add({ targets: o, x: o.x + rnd(-40, 40), y: o.y + rnd(-25, 25), duration: rnd(3000, 5000), yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else if (kind === 'twinkle') {
      o = scene.add.star(rnd(0, W), rnd(H * 0.05, H * 0.75), 4, u * 0.6, u * 2, Math.random() < 0.5 ? 0xa0f0ff : 0xe0a8ff).setDepth(-8).setScale(0);
      scene.tweens.add({ targets: o, scale: 1, angle: 45, duration: rnd(500, 900), yoyo: true, repeat: -1, repeatDelay: rnd(800, 3000), delay: rnd(0, 3000) });
    } else {
      const leaf = kind === 'leaf';
      const col = leaf ? (Math.random() < 0.5 ? 0x7cc050 : 0xe0a040) : (Math.random() < 0.6 ? 0xfff6c0 : 0xffffff);
      o = scene.add.rectangle(rnd(-20, W), rnd(-20, H * 0.6), u * (leaf ? 2.5 : 1.2), u * (leaf ? 1.5 : 1.2), col).setDepth(-8).setAlpha(leaf ? 0.9 : 0.7);
      const fall = () => {
        o.setPosition(rnd(-40, W * 0.8), rnd(-30, H * 0.3));
        scene.tweens.add({ targets: o, x: o.x + rnd(80, 220), y: o.y + rnd(H * 0.5, H * 0.9), angle: leaf ? rnd(180, 540) : 0, duration: rnd(6000, 11000), onComplete: fall });
      };
      scene.time.delayedCall(rnd(0, 5000), fall);
    }
    scene._amb.push(o);
  }
}

/** Minden képkockában: lágy árnyék a Mexik alatt és finom „légzés”. */
export function tickMons(scene, time) {
  const low = fxLow();
  for (const [side, spr, pos] of [['f', scene.foeSpr, scene.foePos], ['p', scene.meSpr, scene.mePos]]) {
    const key = '_shadow_' + side;
    if (!spr || !spr.active) { scene[key]?.setVisible(false); continue; }
    let sh = scene[key];
    if (!sh || !sh.active) sh = scene[key] = scene.add.ellipse(0, 0, 10, 4, 0x000000, 1).setDepth(-4);
    const w = Math.max(0, spr.displayWidth) * 0.55;
    sh.setVisible(spr.visible && spr.scaleX > 0.01).setPosition(spr.x, pos.y - 1).setSize(w, w * 0.22).setDisplaySize(w, w * 0.22).setAlpha(0.28 * spr.alpha);
    if (!low && spr.scaleX > 0.01 && !scene.tweens.isTweening(spr) && spr.alpha > 0.5) {
      spr.scaleY = spr.scaleX * (1 + 0.022 * Math.sin(time / 280 + (side === 'f' ? 0 : 1.7)));
    }
  }
}

/** Belépéskor fehér sziluettből kiszíneződik. */
export function enterFlash(scene, spr) {
  if (!spr) return;
  spr.setTintFill(0xffffff);
  scene.time.delayedCall(160, () => spr.active && spr.clearTint());
}

/** Szikrák a becsapódás helyén a támadás típusszínében. */
export function burst(scene, x, y, color, n = 10) {
  if (fxLow()) n = 5;
  const u = scene.sc;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = (14 + Math.random() * 16) * u;
    const p = scene.add.rectangle(x, y, u * 1.6, u * 1.6, i % 3 ? color : 0xffffff).setDepth(28);
    scene.tweens.add({ targets: p, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, scale: 0.3, duration: 380 + Math.random() * 200, ease: 'Cubic.out', onComplete: () => p.destroy() });
  }
}

/** Sebzésszám, ami felúszik és elhalványul. */
export function popNumber(scene, x, y, text, { crit = false, eff = 1, heal = false } = {}) {
  const col = heal ? '#7dff8a' : crit ? '#ffd23a' : eff > 1 ? '#ff7a4a' : eff < 1 ? '#c8c8c8' : '#ffffff';
  const t = scene.add.text(x, y, text, { fontFamily: 'monospace', fontStyle: 'bold', fontSize: Math.round(7 * scene.sc * (crit ? 1.35 : 1)) + 'px', color: col, stroke: '#1a1020', strokeThickness: Math.max(3, scene.sc) }).setOrigin(0.5).setDepth(40);
  scene.tweens.add({ targets: t, y: y - 16 * scene.sc, alpha: { from: 1, to: 0 }, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  if (crit) scene.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 220, ease: 'Back.out' });
}

/** Hatásos/kritikus találatnál: rövid színes villanás és kamera-„ütés”. */
export function impact(scene, { crit, eff, color }) {
  if (fxLow()) return;
  const cam = scene.cameras.main;
  if (eff > 1 || crit) {
    const { width: W, height: H } = scene.scale;
    const ov = scene.add.rectangle(0, 0, W, H, color, 0.22).setOrigin(0).setDepth(35);
    scene.tweens.add({ targets: ov, alpha: 0, duration: 260, onComplete: () => ov.destroy() });
  }
  if (crit) { cam.zoomTo(1.06, 80); scene.time.delayedCall(140, () => cam.zoomTo(1, 160)); }
}

/** Ájuláskor porfelhő a Mexi lábánál. */
export function dust(scene, x, y) {
  const n = fxLow() ? 3 : 7, u = scene.sc;
  for (let i = 0; i < n; i++) {
    const c = scene.add.circle(x + (i - n / 2) * 4 * u, y, (3 + Math.random() * 3) * u, 0xd8d0c0, 0.8).setDepth(-3);
    scene.tweens.add({ targets: c, y: y - (6 + Math.random() * 8) * u, x: c.x + (i - n / 2) * 3 * u, alpha: 0, scale: 1.6, duration: 600 + Math.random() * 300, onComplete: () => c.destroy() });
  }
}

/** Szintlépés: felfelé szálló fényoszlop. */
export function lightColumn(scene, x, y) {
  if (fxLow()) return;
  const h = scene.fieldH, w = 26 * scene.sc;
  const col = scene.add.rectangle(x, y, w, h, 0xfff2a0, 0.55).setOrigin(0.5, 1).setDepth(21).setBlendMode('ADD').setScale(0, 1);
  scene.tweens.add({ targets: col, scaleX: 1, duration: 200, yoyo: true, hold: 350, ease: 'Sine.out', onComplete: () => col.destroy() });
}
