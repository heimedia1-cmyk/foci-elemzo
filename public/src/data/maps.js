// Térképek – kódból építve, hogy könnyű legyen bővíteni.
// Csempekódok:
//  .  fű            "  magas fű (vad Mexik)   _  út       ~  víz      s  homok
//  f  virág (piros) g  virág (kék)            T  fa       b  bokor     R  szikla
//  F  kerítés       S  tábla                  h  gyanús bokor (szimatolással nyitható)
//  p  feltárt átjáró
export const SOLID = new Set(['~', 'T', 'b', 'R', 'F', 'S', 'h', '#']);

function grid(w, h, ch = '.') { return Array.from({ length: h }, () => Array(w).fill(ch)); }
function rect(g, x, y, w, h, ch) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = ch; }
function border(g, t = 2, ch = 'T') { const H = g.length, W = g[0].length; rect(g, 0, 0, W, t, ch); rect(g, 0, H - t, W, t, ch); rect(g, 0, 0, t, H, ch); rect(g, W - t, 0, t, H, ch); }
function scatter(g, x, y, w, h, ch, density, seed) { let s = seed; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { s = (s * 9301 + 49297) % 233280; if (s / 233280 < density && g[j][i] === '.') g[j][i] = ch; } }

// ===================== MANCSFALVA =====================
function buildMancsfalva() {
  const W = 32, H = 26; const g = grid(W, H);
  border(g);
  rect(g, 15, 0, 2, 2, '_');               // északi kijárat
  rect(g, 15, 0, 2, 23, '_');              // főút
  rect(g, 3, 8, 26, 1, '_');               // felső utca
  rect(g, 3, 17, 26, 1, '_');              // alsó utca
  // ajtókhoz vezető kis utak
  rect(g, 6, 7, 1, 1, '_'); rect(g, 26, 7, 1, 1, '_'); rect(g, 6, 16, 1, 1, '_'); rect(g, 26, 16, 1, 1, '_'); rect(g, 11, 16, 1, 1, '_');
  // tó
  rect(g, 3, 20, 9, 4, 's'); rect(g, 4, 21, 7, 2, '~');
  // virágok, kerítés
  rect(g, 19, 20, 9, 1, 'F'); rect(g, 19, 21, 2, 2, 'f'); rect(g, 23, 21, 2, 2, 'g'); rect(g, 26, 21, 2, 2, 'f');
  rect(g, 18, 10, 2, 2, 'f'); rect(g, 12, 3, 2, 2, 'g'); rect(g, 19, 3, 2, 2, 'f');
  scatter(g, 2, 2, 28, 22, 'b', 0.015, 7);
  g[2][17] = 'S'; g[18][13] = 'S';
  // ne legyen akadály az utakon/ajtók előtt
  return g;
}

// ===================== MEXI-ÖSVÉNY =====================
function buildOsveny() {
  const W = 28, H = 50; const g = grid(W, H);
  border(g);
  // kanyargó út dél→észak
  rect(g, 13, 44, 2, 6, '_');
  rect(g, 8, 40, 7, 4, '_'); rect(g, 8, 30, 2, 10, '_'); rect(g, 8, 28, 12, 2, '_'); rect(g, 18, 16, 2, 12, '_'); rect(g, 11, 14, 9, 2, '_'); rect(g, 11, 2, 2, 12, '_'); rect(g, 11, 0, 2, 2, '_');
  // magas füves területek
  rect(g, 3, 42, 4, 5, '"'); rect(g, 16, 40, 8, 6, '"'); rect(g, 11, 31, 6, 6, '"'); rect(g, 3, 22, 7, 5, '"'); rect(g, 13, 18, 4, 8, '"'); rect(g, 21, 18, 4, 5, '"'); rect(g, 3, 4, 7, 7, '"'); rect(g, 14, 4, 6, 6, '"');
  // tó homokkal
  rect(g, 20, 30, 6, 6, 's'); rect(g, 21, 31, 4, 4, '~');
  // virágos rét
  rect(g, 3, 32, 4, 4, 'f'); rect(g, 4, 33, 2, 2, 'g'); rect(g, 21, 25, 4, 2, 'g');
  // fasorok, sziklák
  rect(g, 2, 37, 5, 1, 'T'); rect(g, 10, 22, 3, 1, 'T'); rect(g, 14, 12, 12, 1, 'T'); rect(g, 2, 15, 7, 2, 'T');
  g[39][17] = 'R'; g[27][4] = 'R'; g[10][17] = 'R'; g[20][11] = 'R';
  scatter(g, 2, 2, 24, 46, 'b', 0.02, 13);
  // titkos terület (jobb felső), csak a gyanús bokron át
  rect(g, 21, 2, 5, 10, 'T'); rect(g, 22, 3, 3, 8, '"'); g[6][21] = 'h'; g[6][20] = '.'; g[6][19] = '.';
  rect(g, 22, 3, 1, 1, '.');
  // táblák
  g[46][15] = 'S'; g[2][13] = 'S';
  // az útvonalak maradjanak szabadok
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === 'b' && [[13, 44, 2, 6], [8, 40, 7, 4], [8, 30, 2, 10], [8, 28, 12, 2], [18, 16, 2, 12], [11, 14, 9, 2], [11, 2, 2, 12]].some(([a, b2, w, h]) => x >= a && x < a + w && y >= b2 && y < b2 + h)) g[y][x] = '_';
  return g;
}

export const MAPS = {
  mancsfalva: {
    name: 'Mancsfalva',
    tiles: buildMancsfalva(),
    music: 'village',
    buildings: [
      { key: 'lab',  x: 3,  y: 3,  door: { x: 6, y: 6 },  action: 'lab',  name: 'Mexi-kutató labor' },
      { key: 'heal', x: 23, y: 3,  door: { x: 26, y: 6 }, action: 'heal', name: 'Mexi-gyógyítóállomás' },
      { key: 'home', x: 3,  y: 12, door: { x: 6, y: 15 }, action: 'home', name: 'Otthon' },
      { key: 'house',x: 9,  y: 12, door: { x: 11, y: 15 }, action: 'house', name: 'Szomszéd háza' },
      { key: 'shop', x: 23, y: 12, door: { x: 26, y: 15 }, action: 'shop', name: 'Teniszlabda- és felszerelésbolt' },
    ],
    signs: [
      { x: 17, y: 2, text: 'Észak: Mexi-ösvény ↑\nVigyázat, magas fűben vad Mexik élnek!' },
      { x: 13, y: 18, text: 'MANCSFALVA\nA Mexi-kalandok kezdőpontja.' },
    ],
    npcs: [
      { id: 'prof', sprite: 'professzor', x: 8, y: 9, dir: 'down', wander: 0, talk: 'prof' },
      { id: 'anya', sprite: 'anya', x: 4, y: 18, dir: 'right', wander: 2, talk: ['Szia kincsem! Ha elfáradtál, gyere haza pihenni.', 'A Mexik a gyógyítóállomáson ingyen meggyógyulnak!'] },
      { id: 'bacsi', sprite: 'bacsi', x: 20, y: 9, dir: 'left', wander: 3, talk: ['Fiatal koromban én is Mexiket gyűjtöttem...', 'Mondják, a magas fűben éjjel Szellem Mexik suhannak át.', 'Próbáltál már szimatolni? (Space / mobilon a mancs gomb)'] },
      { id: 'kisfiu', sprite: 'kisfiu', x: 13, y: 21, dir: 'up', wander: 3, talk: ['Ha egy vad Mexinek kevés a HP-ja, könnyebb elkapni!', 'A Profi Teniszlabda sokkal jobban tapad!'] },
      { id: 'boltos_kint', sprite: 'boltos', x: 28, y: 18, dir: 'left', wander: 2, talk: ['A bolt nyitva! Teniszlabdák, gyógyitalok, minden, ami kell.'] },
    ],
    warps: [
      { x: 15, y: 0, to: 'osveny', tx: 13, ty: 48, dir: 'up' },
      { x: 16, y: 0, to: 'osveny', tx: 14, ty: 48, dir: 'up' },
    ],
    triggers: [
      { x: 15, y: 2, w: 2, h: 1, id: 'needStarter' },
    ],
    hidden: [
      { id: 'mf_labda', x: 29, y: 10, item: 'sima_labda', qty: 3 },
    ],
    encounters: null,
  },
  osveny: {
    name: 'Mexi-ösvény',
    tiles: buildOsveny(),
    music: 'route',
    buildings: [],
    signs: [
      { x: 15, y: 46, text: 'MEXI-ÖSVÉNY\nDél: Mancsfalva ↓   Észak: Titokzatos Erdő ↑' },
      { x: 13, y: 2, text: 'TITOKZATOS ERDŐ\nAz út még le van zárva. Hamarosan megnyílik!' },
    ],
    npcs: [
      { id: 'edzo_bence', sprite: 'edzo1', x: 10, y: 35, dir: 'left', wander: 0, trainer: 'bence' },
      { id: 'edzo_lili', sprite: 'edzo2', x: 20, y: 22, dir: 'left', wander: 0, trainer: 'lili' },
      { id: 'gyujto', sprite: 'gyujto', x: 10, y: 15, dir: 'down', wander: 2, talk: ['Ritka Mexiket keresek... Azt beszélik, valahol errefelé van egy titkos rét.', 'Egy bokor itt északkeleten furcsa szagot áraszt. Próbálj meg szimatolni!'] },
      { id: 'erdo_or', sprite: 'bacsi', x: 12, y: 1, dir: 'down', wander: 0, talk: ['Állj! A Titokzatos Erdő még veszélyes.', 'Gyere vissza a következő frissítés után!'] },
    ],
    warps: [
      { x: 13, y: 49, to: 'mancsfalva', tx: 15, ty: 1, dir: 'down' },
      { x: 14, y: 49, to: 'mancsfalva', tx: 16, ty: 1, dir: 'down' },
    ],
    triggers: [
      { x: 11, y: 2, w: 2, h: 1, id: 'forestClosed' },
    ],
    hidden: [
      { id: 'os_labda1', x: 4, y: 34, item: 'sima_labda', qty: 2 },
      { id: 'os_ital', x: 24, y: 41, item: 'nagy_ital', qty: 1 },
      { id: 'os_profi', x: 4, y: 12, item: 'profi_labda', qty: 2 },
      { id: 'os_arany', x: 24, y: 10, item: 'arany_labda', qty: 1 },
      { id: 'os_falat', x: 22, y: 27, item: 'jutalomfalat', qty: 1 },
    ],
    secretBush: { x: 21, y: 6 },
    roamers: [
      { species: 'kacsa', area: [20, 36, 6, 4], level: [4, 6] },
      { species: 'alap', area: [3, 28, 5, 3], level: [3, 5] },
    ],
    encounters: {
      default: {
        day:   [['alap', 30], ['beka', 30], ['mehecske', 18], ['kacsa', 12], ['nindzsa', 6], ['lang', 4]],
        night: [['alap', 25], ['beka', 25], ['mehecske', 10], ['nindzsa', 20], ['szellem', 15], ['kacsa', 5]],
        levels: [2, 5],
      },
      zones: [
        { rect: [3, 4, 7, 7], levels: [5, 8] },
        { rect: [14, 4, 6, 6], levels: [5, 8] },
        { rect: [22, 3, 3, 8], id: 'titkos', day: [['kiber', 40], ['banyasz', 45], ['lang', 15]], night: [['kiber', 35], ['banyasz', 35], ['szellem', 30]], levels: [6, 9] },
      ],
    },
  },
};

export const TRAINERS = {
  bence: {
    name: 'Bence, a kezdő edző', sprite: 'edzo1', reward: 300, sight: 4,
    team: [['alap', 4], ['beka', 5]],
    intro: 'Hé! Te is Mexi-edző vagy? Mérkőzzünk meg!', lose: 'Jaj, ez gyors volt! Még gyakorolnom kell.', after: 'A Béka Mexi ellen a Növény-támadások nagyon hatékonyak!',
  },
  lili: {
    name: 'Lili, a kalandor', sprite: 'edzo2', reward: 450, sight: 4,
    team: [['mehecske', 6], ['nindzsa', 6], ['kacsa', 7]],
    intro: 'Az én csapatom gyors és trükkös! Készen állsz?', lose: 'Hűha, ügyes vagy! A Titokzatos Erdőben találkozunk.', after: 'Az alvó Mexit sokkal könnyebb elkapni!',
  },
};
