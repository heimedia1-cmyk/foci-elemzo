// MexiRegistry – fajták adatai.
// base: hp, atk, def, spa, spd(spec. védekezés), spe(sebesség)
// learnset: [szint, támadás] – a kezdő támadások szint 1-en.
// art: a helyettesítő pixel grafika beállításai (a végleges sprite-ok cserélik).
export const RARITY = {
  gyakori:   { name: 'Gyakori',     color: '#a8a8a8', order: 0 },
  nemgyak:   { name: 'Nem gyakori', color: '#5cc85c', order: 1 },
  ritka:     { name: 'Ritka',       color: '#4a8cf0', order: 2 },
  epikus:    { name: 'Epikus',      color: '#b05ae8', order: 3 },
  legendas:  { name: 'Legendás',    color: '#f0c030', order: 4 },
  titkos:    { name: 'Titkos',      color: 'rainbow',  order: 5 },
};

export const MEXIS = {
  alap: {
    no: 1, name: 'Alap Mexi', types: ['semleges'], rarity: 'gyakori', role: 'Kiegyensúlyozott',
    base: { hp: 55, atk: 55, def: 50, spa: 45, spd: 50, spe: 60 }, catchRate: 190, xpYield: 60,
    learnset: [[1, 'harapas'], [1, 'ugatas'], [4, 'farokcsovalas'], [7, 'gyorsmancs'], [11, 'kutyanez'], [15, 'rohamugras']],
    desc: 'Az eredeti Mexi. Bátor, kíváncsi és mindig követi a gazdáját.',
    location: 'Mancsfalva (kezdő), Mexi-ösvény',
    art: { body: '#5a6a8a', tan: '#d9a35a', acc: null },
  },
  beka: {
    no: 2, name: 'Béka Mexi', types: ['viz'], rarity: 'gyakori', role: 'Védő',
    base: { hp: 65, atk: 45, def: 65, spa: 50, spd: 60, spe: 35 }, catchRate: 190, xpYield: 62,
    learnset: [[1, 'vizpermet'], [1, 'farokcsovalas'], [5, 'nyalkapajzs'], [9, 'bekaugras'], [14, 'hullamcsapas']],
    evolve: { to: 'mocsarkiraly', level: 16 },
    desc: 'Békajelmezben ugrál a pocsolyák között. Kemény, nehéz legyőzni.',
    location: 'Mexi-ösvény (magas fű, víz közelében)',
    art: { body: '#4f9a4a', tan: '#d9a35a', acc: 'frog' },
  },
  mehecske: {
    no: 3, name: 'Méhecske Mexi', types: ['noveny'], rarity: 'nemgyak', role: 'Gyors támogató',
    base: { hp: 45, atk: 50, def: 40, spa: 55, spd: 50, spe: 80 }, catchRate: 120, xpYield: 64,
    learnset: [[1, 'fullank'], [1, 'ugatas'], [6, 'viragpor'], [10, 'mez'], [13, 'levelvihar']],
    evolve: { to: 'mehkiralyno', level: 16 },
    desc: 'Zümmögve repked a virágok körül. Elaltat és gyógyít.',
    location: 'Mexi-ösvény (virágos rét)',
    art: { body: '#e8c030', tan: '#d9a35a', acc: 'bee' },
  },
  lang: {
    no: 4, name: 'Láng Mexi', types: ['tuz'], rarity: 'ritka', role: 'Támadó',
    base: { hp: 50, atk: 70, def: 45, spa: 70, spd: 45, spe: 65 }, catchRate: 60, xpYield: 75,
    learnset: [[1, 'parazs'], [1, 'harapas'], [8, 'langmancs'], [14, 'kutyanez'], [18, 'tuzlehelet']],
    desc: 'Lángoló farka sosem alszik ki. Forrófejű és erős.',
    location: 'Mexi-ösvény (nagyon ritka, napközben)',
    art: { body: '#d8502a', tan: '#f0a040', acc: 'flame' },
  },
  kacsa: {
    no: 5, name: 'Kacsa Mexi', types: ['viz'], rarity: 'nemgyak', role: 'Gyors',
    base: { hp: 48, atk: 55, def: 42, spa: 55, spd: 45, spe: 85 }, catchRate: 140, xpYield: 62,
    learnset: [[1, 'vizpermet'], [1, 'gyorsmancs'], [7, 'bekaugras'], [12, 'fustbomba'], [16, 'hullamcsapas']],
    desc: 'Hápog és fürgén totyog. Az egyik leggyorsabb Mexi.',
    location: 'Mexi-ösvény (tópart)',
    art: { body: '#f0d040', tan: '#d9a35a', acc: 'duck' },
  },
  nindzsa: {
    no: 6, name: 'Nindzsa Mexi', types: ['arnyek'], rarity: 'ritka', role: 'Gyors támadó',
    base: { hp: 45, atk: 75, def: 40, spa: 45, spd: 40, spe: 95 }, catchRate: 70, xpYield: 78,
    learnset: [[1, 'arnyekkarom'], [1, 'gyorsmancs'], [8, 'fustbomba'], [13, 'remkep'], [17, 'nindzsavagas']],
    evolve: { to: 'arnyekmester', level: 18 },
    desc: 'Csak az árnyéka látszik, mire észreveszed. Gyakran kritikusat üt.',
    location: 'Mexi-ösvény (ritka, főleg este)',
    art: { body: '#3a2a5a', tan: '#d9a35a', acc: 'ninja' },
  },
  kiber: {
    no: 7, name: 'Kiber Mexi', types: ['gep'], rarity: 'epikus', role: 'Speciális támadó',
    base: { hp: 50, atk: 45, def: 60, spa: 85, spd: 55, spe: 60 }, catchRate: 45, xpYield: 90,
    learnset: [[1, 'lezer'], [1, 'szikra'], [9, 'tultoltes'], [13, 'fogaskerek'], [18, 'villamcsapas']],
    desc: 'Neonfényben villódzó páncél. Technológiai titkokat szimatol ki.',
    location: 'Mexi-ösvény – titkos terület',
    art: { body: '#7a8aa0', tan: '#d9a35a', acc: 'cyber' },
  },
  banyasz: {
    no: 8, name: 'Bányász Mexi', types: ['fold'], rarity: 'nemgyak', role: 'Védő',
    base: { hp: 70, atk: 65, def: 75, spa: 30, spd: 45, spe: 30 }, catchRate: 120, xpYield: 70,
    learnset: [[1, 'csakany'], [1, 'ugatas'], [7, 'sziklapajzs'], [14, 'kozapor']],
    desc: 'Mindig ás valamit. Sisaklámpája a barlangban is utat mutat.',
    location: 'Mexi-ösvény – titkos terület',
    art: { body: '#8a6a4a', tan: '#d9a35a', acc: 'miner' },
  },
  jeg: {
    no: 9, name: 'Jég Mexi', types: ['jeg'], rarity: 'ritka', role: 'Speciális támadó',
    base: { hp: 55, atk: 40, def: 50, spa: 80, spd: 60, spe: 55 }, catchRate: 60, xpYield: 78,
    learnset: [[1, 'jegszilank'], [1, 'farokcsovalas'], [10, 'fagyoslehelet'], [15, 'gyorsmancs']],
    desc: 'Lehelete jégvirágot rajzol a levegőbe.',
    location: 'Kristálybarlang (később)',
    art: { body: '#9ad8f0', tan: '#e0f4ff', acc: 'ice' },
  },
  magus: {
    no: 10, name: 'Mágus Mexi', types: ['feny'], rarity: 'epikus', role: 'Támogató',
    base: { hp: 60, atk: 35, def: 50, spa: 75, spd: 75, spe: 50 }, catchRate: 45, xpYield: 88,
    learnset: [[1, 'fenysugar'], [1, 'gyogyitofeny'], [12, 'csillagpor']],
    desc: 'Csillagos süvege alatt ősi varázslatokat őriz.',
    location: 'Titokzatos Erdő (később)',
    art: { body: '#4a4aa8', tan: '#d9a35a', acc: 'wizard' },
  },
  szellem: {
    no: 11, name: 'Szellem Mexi', types: ['arnyek'], rarity: 'ritka', role: 'Trükkös támadó',
    base: { hp: 45, atk: 50, def: 45, spa: 75, spd: 70, spe: 70 }, catchRate: 60, xpYield: 80,
    learnset: [[1, 'remkep'], [1, 'ugatas'], [9, 'fustbomba'], [14, 'arnyekkarom']],
    desc: 'Éjjel suhan át a füvön. Rejtett szellemutakat érzékel.',
    location: 'Mexi-ösvény (csak éjjel, ritka)',
    art: { body: '#b8a8e0', tan: '#e8e0ff', acc: 'ghost' },
  },
  sarkany: {
    no: 12, name: 'Sárkány Mexi', types: ['tuz'], rarity: 'legendas', role: 'Legendás támadó',
    base: { hp: 80, atk: 95, def: 75, spa: 90, spd: 70, spe: 80 }, catchRate: 3, xpYield: 200,
    learnset: [[1, 'langmancs'], [1, 'harapas'], [20, 'tuzlehelet'], [25, 'kozapor']],
    desc: 'Legendák szerint a Sárkányhegy csúcsán alszik.',
    location: 'Sárkányhegy (később)',
    art: { body: '#b8302a', tan: '#f0c040', acc: 'dragon' },
  },
  // ---- Fejlődési alakok ----
  mocsarkiraly: {
    no: 13, name: 'Mocsárkirály Mexi', types: ['viz', 'noveny'], rarity: 'epikus', role: 'Nehéz védő',
    base: { hp: 90, atk: 65, def: 90, spa: 70, spd: 80, spe: 40 }, catchRate: 45, xpYield: 160,
    learnset: [[1, 'hullamcsapas'], [16, 'levelvihar'], [22, 'mez']],
    desc: 'A Béka Mexi fejlett alakja. Nádkoronája a mocsár ura.',
    location: 'Béka Mexi fejlődése (16. szint)',
    art: { body: '#2f7a3a', tan: '#c8a050', acc: 'frogking', big: true },
  },
  mehkiralyno: {
    no: 14, name: 'Méhkirálynő Mexi', types: ['noveny', 'feny'], rarity: 'epikus', role: 'Gyors támogató',
    base: { hp: 70, atk: 65, def: 60, spa: 85, spd: 75, spe: 100 }, catchRate: 45, xpYield: 160,
    learnset: [[1, 'levelvihar'], [16, 'fenysugar'], [22, 'gyogyitofeny']],
    desc: 'A Méhecske Mexi fejlett alakja. Egész raj engedelmeskedik neki.',
    location: 'Méhecske Mexi fejlődése (16. szint)',
    art: { body: '#e8b020', tan: '#d9a35a', acc: 'queen', big: true },
  },
  arnyekmester: {
    no: 15, name: 'Árnyékmester Mexi', types: ['arnyek'], rarity: 'epikus', role: 'Gyors támadó',
    base: { hp: 65, atk: 105, def: 55, spa: 60, spd: 55, spe: 115 }, catchRate: 45, xpYield: 170,
    learnset: [[1, 'nindzsavagas'], [18, 'remkep']],
    desc: 'A Nindzsa Mexi fejlett alakja. Két karddal harcol az árnyékból.',
    location: 'Nindzsa Mexi fejlődése (18. szint)',
    art: { body: '#24183a', tan: '#c8a050', acc: 'ninjamaster', big: true },
  },
};

export const SPECIES_ORDER = Object.keys(MEXIS).sort((a, b) => MEXIS[a].no - MEXIS[b].no);

export const NATURES = [
  { name: 'Bátor',     up: 'atk', down: 'spe' },
  { name: 'Játékos',   up: 'spe', down: 'def' },
  { name: 'Okos',      up: 'spa', down: 'atk' },
  { name: 'Nyugodt',   up: 'spd', down: 'spe' },
  { name: 'Makacs',    up: 'def', down: 'spa' },
  { name: 'Huncut',    up: 'atk', down: 'spd' },
  { name: 'Félénk',    up: 'spe', down: 'atk' },
  { name: 'Álmodozó',  up: 'spa', down: 'def' },
  { name: 'Kedves',    up: 'spd', down: 'atk' },
  { name: 'Kiegyensúlyozott', up: null, down: null },
];

export const STAT_NAMES = { hp: 'HP', atk: 'Támadás', def: 'Védekezés', spa: 'Spec. támadás', spd: 'Spec. védekezés', spe: 'Sebesség' };
