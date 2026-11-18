// Séta mód logika tesztjei
import { spawnsNear, stopsNear, dist, offset, goCatchChance, stopRewards, GO } from '../public/src/go/goLogic.js';
import { createMexi } from '../public/src/systems/mexi.js';
const BP = { lat: 47.4979, lng: 19.0402 };
const now = Date.UTC(2026, 10, 18, 10, 0);
const a = spawnsNear(BP, now, 12), b = spawnsNear(BP, now, 12);
if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('nem determinisztikus');
if (a.length < 5 || a.length > 60) throw new Error('furcsa Mexi-szám: ' + a.length);
const later = spawnsNear(BP, now + GO.slotMs, 12);
if (JSON.stringify(a.map(x => x.id)) === JSON.stringify(later.map(x => x.id))) throw new Error('nem frissül');
const st = stopsNear(BP);
if (st.length < 3) throw new Error('kevés Mancs-pont');
const d = dist(BP, offset(BP, 300, 400)); if (Math.abs(d - 500) > 3) throw new Error('távolság hibás ' + d);
const ch = goCatchChance(createMexi('alap', 10), 'sima_labda'), ch2 = goCatchChance(createMexi('jeg', 10), 'sima_labda', 2);
if (ch < 0.3 || ch > 0.6 || ch2 < 0.15 || ch2 > 0.45) throw new Error(`elkapási esély furcsa ${ch} ${ch2}`);
if (!stopRewards('x', 1, 5).sima_labda) throw new Error('nincs jutalom');
console.log(`✓ séta mód: ${a.length} Mexi 320 m-en belül, ${st.length} Mancs-pont, elkapás: Alap ${Math.round(ch * 100)}%, Jég (kiváló) ${Math.round(ch2 * 100)}%`);
