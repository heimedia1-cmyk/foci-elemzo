// Csont-rendszer (Pokémon GO cukorka mintájára): fajcsaládonként gyűjtött csontok.
// Elkapás: +3 csont • Átadás a Professzornak: +1 (+1 / 10 szint, shiny +2)
// Felhasználás: szintlépés (csont + érme), fejlődés csontokból.
import { G } from './state.js';
import { MEXIS } from '../data/mexis.js';
import { CONFIG } from '../data/config.js';
import { xpForLevel, gainXp, ivPercent } from './mexi.js';
import { questEvent } from './quests.js';

export const BONES = { catch: 3, transfer: 1, evolveCost: 25, levelCap: 40 };

/** A fejlődési lánc kiinduló faja (a család „neve”). */
export function familyOf(species) {
  for (const [k, d] of Object.entries(MEXIS)) if (d.evolve && d.evolve.to === species) return familyOf(k);
  return species;
}
export function bonesOf(species) { const b = G.state.bones || {}; return b[familyOf(species)] || 0; }
export function addBones(species, n) {
  const s = G.state; s.bones ??= {};
  const f = familyOf(species); s.bones[f] = (s.bones[f] || 0) + n; return s.bones[f];
}
export function transferReward(m) { return BONES.transfer + Math.floor(m.level / 10) + (m.shiny ? 2 : 0); }

/** Erősítés ára az adott szintről. */
export function powerUpCost(m) { return { bones: 1 + Math.floor(m.level / 8), coins: 10 + m.level * 15 }; }
/** Csonttal legfeljebb a csapat (és tároló) legerősebb Mexijének szintjéig lehet erősíteni. */
export function powerUpCap() { const s = G.state; return Math.min(BONES.levelCap, CONFIG.maxLevel, Math.max(1, ...[...s.party, ...s.storage].map(x => x.level))); }
export function canPowerUp(m) {
  if (m.level >= powerUpCap()) return m.level >= BONES.levelCap ? `Csonttal legfeljebb ${BONES.levelCap}. szintig erősíthető.` : 'Csonttal csak a legerősebb Mexid szintjéig erősíthetsz – őt harcban fejleszd tovább!';
  const c = powerUpCost(m);
  if (bonesOf(m.species) < c.bones) return `Kell ${c.bones} csont (van: ${bonesOf(m.species)}).`;
  if (G.state.money < c.coins) return `Kell ${c.coins} érme.`;
  return null;
}
/** +1 szint. Visszaadja a gainXp eseményeit (learned/canLearn). */
export function powerUp(m) {
  const err = canPowerUp(m); if (err) return { err };
  const c = powerUpCost(m);
  G.state.bones[familyOf(m.species)] -= c.bones; G.state.money -= c.coins;
  const events = gainXp(m, Math.max(1, xpForLevel(m.level + 1) - m.xp));
  return { events, cost: c };
}
export function evolveCost(m) { return MEXIS[m.species].evolve ? BONES.evolveCost : null; }
export function canBoneEvolve(m) { const e = MEXIS[m.species].evolve; if (!e) return 'Nincs fejlett formája.'; if (m.level < e.level - 4) return `Előbb érje el a(z) ${e.level - 4}. szintet.`; if (bonesOf(m.species) < BONES.evolveCost) return `Kell ${BONES.evolveCost} csont.`; return null; }

/** Átadható-e (a csapat utolsó Mexije nem). */
export function canTransfer(m) {
  const s = G.state;
  if (s.party.includes(m) && s.party.length <= 1) return 'Az utolsó csapattagodat nem adhatod át.';
  if (s.party.includes(m) && !s.party.some(x => x !== m && x.hp > 0) ) return 'Kell legalább egy harcképes Mexi a csapatban.';
  if (m.locked) return 'Ez a Mexi le van zárva (🔒).';
  return null;
}
export function transfer(m) {
  const err = canTransfer(m); if (err) return { err };
  const s = G.state; const n = transferReward(m);
  const pi = s.party.indexOf(m); if (pi >= 0) s.party.splice(pi, 1);
  const si = s.storage.indexOf(m); if (si >= 0) s.storage.splice(si, 1);
  addBones(m.species, n); s.stats.transferred = (s.stats.transferred || 0) + 1; questEvent('transfers');
  return { bones: n };
}

/** Tömeges átadás javaslat: fajonként a legjobbat (szint+adottság) megtartja; shiny/zárolt/csapattag marad. */
export function duplicatePlan() {
  const s = G.state; const by = {};
  for (const m of [...s.party, ...s.storage]) (by[m.species] ??= []).push(m);
  const out = [];
  for (const list of Object.values(by)) {
    if (list.length < 2) continue;
    const score = (m) => m.level * 3 + ivPercent(m) + (m.shiny ? 1e4 : 0) + (s.party.includes(m) ? 500 : 0);
    const [, ...rest] = [...list].sort((a, b) => score(b) - score(a));
    for (const m of rest) if (!m.shiny && !m.locked && !s.party.includes(m)) out.push(m);
  }
  return out;
}
