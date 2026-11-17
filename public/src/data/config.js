// Konfigurálható játékbeállítások (balanszolás egy helyen).
export const CONFIG = {
  shinyChance: 1 / 512,
  encounterChanceTallGrass: 0.12,   // lépésenként a magas fűben
  encounterCooldownSteps: 3,         // ennyi lépés védett idő harc után
  maxLevel: 50,                      // később 100-ig bővíthető
  partySize: 6,
  critChance: 1 / 16,
  highCritChance: 1 / 4,
  stab: 1.5,
  startMoney: 1000,
  starterLevel: 5,
  saveVersion: 1,
  nightHours: [20, 6],               // 20:00 – 06:00 éjszaka
  sniffDurationMs: 5000,
  sniffRadius: 6,
  statusCatchBonus: { alvas: 2, fagyas: 2, benitas: 1.5, mereg: 1.5, eges: 1.5 },
};
