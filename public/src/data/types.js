// Típusok és teljes hatékonysági mátrix.
// Szabály: a leírásban megadott "szuperhatékony" párok 2×.
// Kiegészítő szabályok (dokumentálva):
//  - Minden elemi típus 0,5× önmaga ellen (kivéve Semleges és Árnyék→Fény/Fény→Árnyék).
//  - Ahol egy típus "természetesen" ellenáll (pl. Tűz a Víznek/Földnek), 0,5×.
//  - Egyetlen immunitás: Villám → Föld = 0×.
//  - Minden más páros 1×.

export const TYPES = {
  semleges: { name: 'Semleges', color: '#b8b0a0' },
  tuz:      { name: 'Tűz',      color: '#f0703a' },
  viz:      { name: 'Víz',      color: '#4a90e8' },
  noveny:   { name: 'Növény',   color: '#5cbf4a' },
  villam:   { name: 'Villám',   color: '#f5d33a' },
  fold:     { name: 'Föld',     color: '#c49a5a' },
  jeg:      { name: 'Jég',      color: '#8fdcef' },
  arnyek:   { name: 'Árnyék',   color: '#7a5aa8' },
  feny:     { name: 'Fény',     color: '#ffe89a' },
  gep:      { name: 'Gép',      color: '#9aa8b8' },
};

const SUPER = {
  tuz: ['noveny', 'jeg', 'gep'],
  viz: ['tuz', 'fold'],
  noveny: ['viz', 'fold'],
  villam: ['viz', 'gep'],
  fold: ['tuz', 'villam', 'gep'],
  jeg: ['noveny', 'fold'],
  arnyek: ['feny', 'noveny'],
  feny: ['arnyek'],
  gep: ['jeg', 'feny'],
  semleges: [],
};

const RESIST = {
  tuz: ['tuz', 'viz', 'fold'],
  viz: ['viz', 'noveny'],
  noveny: ['tuz', 'noveny', 'gep'],
  villam: ['villam', 'noveny'],
  fold: ['noveny'],
  jeg: ['tuz', 'jeg', 'gep'],
  arnyek: ['arnyek', 'gep'],
  feny: ['feny', 'tuz', 'gep'],
  gep: ['tuz', 'gep', 'villam'],
  semleges: [],
};

const IMMUNE = { villam: ['fold'] };

export const TYPE_CHART = {};
for (const atk of Object.keys(TYPES)) {
  TYPE_CHART[atk] = {};
  for (const def of Object.keys(TYPES)) {
    let m = 1;
    if (SUPER[atk].includes(def)) m = 2;
    else if ((IMMUNE[atk] || []).includes(def)) m = 0;
    else if (RESIST[atk].includes(def)) m = 0.5;
    TYPE_CHART[atk][def] = m;
  }
}

/** Szorzó egy támadás típusára a védekező (egy- vagy kéttípusú) Mexi ellen. */
export function effectiveness(moveType, defenderTypes) {
  return defenderTypes.reduce((m, t) => m * TYPE_CHART[moveType][t], 1);
}

export function effectivenessText(mult) {
  if (mult === 0) return 'Nincs hatása...';
  if (mult >= 2) return 'Szuperhatékony!';
  if (mult < 1) return 'Nem túl hatékony...';
  return '';
}
