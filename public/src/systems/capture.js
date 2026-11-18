// CaptureSystem – teniszlabdás befogás.
// Az esély függ: ritkaság (catchRate), HP-arány, státusz, labdatípus.
import { MEXIS } from '../data/mexis.js';
import { ITEMS } from '../data/items.js';
import { CONFIG } from '../data/config.js';
import { rand } from './mexi.js';

export function captureValue(target, ballId) {
  const sp = MEXIS[target.species];
  const ball = ITEMS[ballId];
  let mult = ball.ballMult;
  if (ball.rareBonus && ['ritka', 'epikus', 'legendas', 'titkos'].includes(sp.rarity)) mult *= ball.rareBonus;
  const statusMult = target.status ? (CONFIG.statusCatchBonus[target.status] || 1) : 1;
  const max = target.stats.hp, hp = target.hp;
  const a = ((3 * max - 2 * hp) * sp.catchRate * mult) / (3 * max) * statusMult;
  return Math.min(255, a);
}

/** Egy billegés sikerének esélye (0..1). Három sikeres billegés = elkapva. */
export function shakeChance(a) {
  if (a >= 255) return 1;
  return Math.min(1, (65536 / Math.pow(255 / a, 0.25)) / 65536);
}

/** Becsült teljes befogási esély (teszteléshez, kijelzéshez). */
export function captureChance(target, ballId) {
  return Math.pow(shakeChance(captureValue(target, ballId)), 4);
}

/**
 * Dobás eredménye: shakes 0–3, caught: bool.
 * 0 = azonnal kiugrik, 1–2 = "majdnem sikerült", 3 + siker = megvan.
 */
export function throwBall(target, ballId, bonus = 1) {
  const p = shakeChance(captureValue(target, ballId) * bonus);
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (rand() < p) shakes++;
    else break;
  }
  const caught = shakes === 4;
  return { shakes: Math.min(3, shakes), caught };
}
