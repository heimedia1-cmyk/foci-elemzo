// Térképek – kézzel tervezett, összefüggő elrendezés (semmi véletlenszerű elhelyezés).
// Csempekódok:
//  .  fű          "  magas fű (vad Mexik)    =  földút     c  kőburkolat
//  ~  víz         s  homok           f  rózsaszín virág         w  fehér virág
//  T  fa          b  bokor           r  szikla                  F  kerítés
//  h  gyanús bokor (szimatolással nyitható)                     p  feltárt ösvény
export const SOLID = new Set(['~', 'T', 'b', 'r', 'F', 'h', '#', 'W', 'w', 'P']);

function grid(w, h, ch = '.') { return Array.from({ length: h }, () => Array(w).fill(ch)); }
function rect(g, x, y, w, h, ch) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = ch; }
function border(g, t = 2, ch = 'T') { const H = g.length, W = g[0].length; rect(g, 0, 0, W, t, ch); rect(g, 0, H - t, W, t, ch); rect(g, 0, 0, t, H, ch); rect(g, W - t, 0, t, H, ch); }

// ===================== MANCSFALVA (34 × 28) =====================
function buildMancsfalva() {
  const g = grid(34, 28);
  border(g);
  // utak
  rect(g, 17, 0, 2, 22, '=');          // főút észak felé
  rect(g, 3, 11, 29, 2, '=');          // felső utca
  rect(g, 3, 20, 29, 2, '=');          // alsó utca
  // kőburkolatos főtér a két utca között
  rect(g, 15, 13, 6, 7, 'c');
  // északi rét: virágágyások
  rect(g, 4, 3, 5, 2, 'f'); rect(g, 23, 3, 5, 2, 'w'); rect(g, 11, 3, 3, 1, 'w');
  // déli rész: tó homokparttal
  rect(g, 3, 22, 11, 4, 's'); rect(g, 4, 23, 9, 2, '~');
  // bekerített virágoskert
  rect(g, 21, 23, 10, 1, 'F'); g[23][25] = '.'; g[23][26] = '.';
  rect(g, 21, 24, 5, 2, 'f'); rect(g, 26, 24, 5, 2, 'w');
  // díszbokrok a házak között (szimmetrikusan)
  for (const [x, y] of [[3, 14], [9, 14], [21, 14], [31, 14], [3, 5], [31, 5]]) g[y][x] = 'b';
  return g;
}

// ===================== MEXI-ÖSVÉNY (30 × 56) =====================
function buildOsveny() {
  const g = grid(30, 56);
  border(g);
  // ligetek, fasorok – ezek adják az útvonal „falait”
  rect(g, 2, 48, 7, 3, 'T');           // bal alsó liget
  rect(g, 16, 47, 6, 3, 'T');          // jobb alsó liget
  rect(g, 24, 44, 4, 6, 'T');          // jobb alsó sarok
  rect(g, 9, 24, 5, 5, 'T');           // középső liget
  rect(g, 2, 14, 9, 2, 'T');           // északi fasor
  rect(g, 24, 2, 1, 12, 'T'); rect(g, 24, 12, 4, 2, 'T'); // a titkos rét fala
  // magas füves területek (vad Mexik)
  rect(g, 9, 48, 4, 5, '"');           // A – a bejárat mellett
  rect(g, 10, 34, 6, 9, '"');          // C – középen
  rect(g, 18, 36, 9, 7, '"');          // B – nagy mező
  rect(g, 15, 20, 5, 9, '"');          // E – a kanyar mellett
  rect(g, 3, 4, 8, 8, '"');            // F – északnyugati mező (erősebb Mexik)
  rect(g, 16, 4, 5, 7, '"');           // G – északkeleti mező
  rect(g, 25, 3, 3, 9, '"');           // titkos rét
  // tó homokparttal
  rect(g, 23, 21, 5, 9, 's'); rect(g, 24, 22, 3, 7, '~');
  // virágos rét
  rect(g, 2, 34, 3, 6, 'f'); rect(g, 3, 36, 1, 2, 'w');
  // az ösvény (2 széles, kanyarog dél → észak)
  rect(g, 14, 46, 2, 10, '=');
  rect(g, 6, 45, 10, 2, '=');
  rect(g, 6, 32, 2, 15, '=');
  rect(g, 6, 31, 17, 2, '=');
  rect(g, 21, 17, 2, 16, '=');
  rect(g, 13, 16, 10, 2, '=');
  rect(g, 13, 0, 2, 17, '=');
  // sziklák és a gyanús bokor
  for (const [x, y] of [[17, 44], [4, 21], [19, 13], [27, 33]]) g[y][x] = 'r';
  g[7][24] = 'h';
  return g;
}

export const MAPS = {
  mancsfalva: {
    name: 'Mancsfalva',
    tiles: buildMancsfalva(),
    // x: bal szél, y: az ajtó sora (az épület alja)
    buildings: [
      { key: 'lab',    x: 4,  y: 10,  action: 'lab',   name: 'Mexi-kutató labor' },
      { key: 'gym',    x: 10, y: 10, action: 'gym',   name: 'Mexi Gym' },
      { key: 'heal',   x: 22, y: 10, action: 'heal',  name: 'Mexi-gyógyítóállomás' },
      { key: 'house2', x: 27, y: 10, action: 'house2', name: 'Kék ház' },
      { key: 'home',   x: 4,  y: 19, action: 'home',  name: 'Otthon' },
      { key: 'house',  x: 10, y: 19, action: 'house', name: 'Szomszéd háza' },
      { key: 'shop',   x: 22, y: 19, doorDx: 1, action: 'shop',  name: 'Teniszlabda- és felszerelésbolt' },
    ],
    props: [
      { k: 'tree_pink', x: 10, y: 3 }, { k: 'tree_pink', x: 15, y: 3 }, { k: 'tree_pink', x: 21, y: 3 },
      { k: 'well', x: 19, y: 16 }, { k: 'bench', x: 15, y: 14 }, { k: 'bench', x: 15, y: 18 },
      { k: 'flowerbox', x: 20, y: 14 }, { k: 'flowerbox', x: 20, y: 18 },
      { k: 'lamp', x: 14, y: 13 }, { k: 'lamp', x: 21, y: 13 }, { k: 'lamp', x: 14, y: 19 }, { k: 'lamp', x: 21, y: 19 },
      { k: 'doghouse', x: 29, y: 16 }, { k: 'hay', x: 31, y: 18 }, { k: 'crate', x: 27, y: 18 },
      { k: 'stump', x: 31, y: 25 }, { k: 'mushroom', x: 2, y: 22, solid: false },
    ],
    signs: [
      { x: 19, y: 3, text: 'Észak: Mexi-ösvény ↑\nVigyázat, a magas fűben vad Mexik élnek!' },
      { x: 16, y: 10, text: 'MANCSFALVA\nA Mexi-kalandok kezdőpontja.' },
    ],
    npcs: [
      { id: 'prof', sprite: 'professzor', x: 8, y: 13, dir: 'down', wander: 0, talk: 'prof' },
      { id: 'anya', sprite: 'anya', x: 6, y: 13, dir: 'down', wander: 1, talk: ['Szia kincsem! Ha elfáradtál, gyere haza pihenni.', 'A Mexik a gyógyítóállomáson ingyen meggyógyulnak!'] },
      { id: 'bacsi', sprite: 'bacsi', x: 16, y: 16, dir: 'right', wander: 0, talk: ['Fiatal koromban én is Mexiket gyűjtöttem...', 'Mondják, a magas fűben éjjel Szellem Mexik suhannak át.', 'Próbáltál már szimatolni? (Space / mobilon a mancs gomb)'] },
      { id: 'kisfiu', sprite: 'kisfiu', x: 15, y: 23, dir: 'left', wander: 2, talk: ['Ha egy vad Mexinek kevés a HP-ja, könnyebb elkapni!', 'A Profi Teniszlabda sokkal jobban tapad!'] },
      { id: 'boltos_kint', sprite: 'boltos', x: 28, y: 13, dir: 'down', wander: 2, talk: ['A bolt nyitva! Teniszlabdák, gyógyitalok, minden, ami kell.'] },
      { id: 'apolo_kint', sprite: 'apolo', x: 25, y: 13, dir: 'down', wander: 1, talk: ['Ha megsérültek a Mexijeid, gyere be a gyógyítóállomásra!'] },
    ],
    warps: [
      { x: 17, y: 0, to: 'osveny', tx: 14, ty: 54, dir: 'up' },
      { x: 18, y: 0, to: 'osveny', tx: 15, ty: 54, dir: 'up' },
    ],
    triggers: [{ x: 17, y: 2, w: 2, h: 1, id: 'needStarter' }],
    hidden: [{ id: 'mf_labda', x: 31, y: 3, item: 'sima_labda', qty: 3 }],
    encounters: null,
  },
  osveny: {
    name: 'Mexi-ösvény',
    tiles: buildOsveny(),
    buildings: [],
    props: [
      { k: 'cave_closed', x: 4, y: 18 }, { k: 'forestarch', x: 13.5, y: 1, solid: false }, { k: 'log', x: 11, y: 30 }, { k: 'mushroom', x: 12, y: 29, solid: false },
      { k: 'stump', x: 26, y: 33 }, { k: 'pawstone', x: 22, y: 9 }, { k: 'tree_orange', x: 3, y: 31 },
      { k: 'tree_orange', x: 27, y: 18 }, { k: 'flowers', x: 2, y: 40, solid: false }, { k: 'tree', x: 20, y: 52 },
    ],
    signs: [
      { x: 16, y: 52, text: 'MEXI-ÖSVÉNY\nDél: Mancsfalva ↓   Észak: Titokzatos Erdő ↑' },
      { x: 15, y: 2, text: 'TITOKZATOS ERDŐ\nAz út még le van zárva. Hamarosan megnyílik!' },
      { x: 6, y: 19, text: 'KRISTÁLYBARLANG\nA bejáratot beomlott kövek zárják el. (Hamarosan!)' },
      { x: 22, y: 9, text: 'Egy mancsnyomos kő. Ez áll rajta:\n„Aki szimatol, az utat talál.”', noPost: true },
    ],
    npcs: [
      { id: 'edzo_bence', sprite: 'edzo1', x: 8, y: 40, dir: 'left', wander: 0, trainer: 'bence' },
      { id: 'edzo_lili', sprite: 'edzo2', x: 20, y: 24, dir: 'right', wander: 0, trainer: 'lili' },
      { id: 'gyujto', sprite: 'gyujto', x: 11, y: 18, dir: 'down', wander: 2, talk: ['Ritka Mexiket keresek... Azt beszélik, valahol errefelé van egy titkos rét.', 'Északkeleten, a fák mögött egy bokor furcsa szagot áraszt. Próbálj meg szimatolni mellette!'] },
      { id: 'erdo_or', sprite: 'bacsi', x: 14, y: 1, dir: 'down', wander: 0, talk: ['Állj! A Titokzatos Erdő még veszélyes.', 'Gyere vissza a következő frissítés után!'] },
    ],
    warps: [
      { x: 14, y: 55, to: 'mancsfalva', tx: 17, ty: 1, dir: 'down' },
      { x: 15, y: 55, to: 'mancsfalva', tx: 18, ty: 1, dir: 'down' },
    ],
    triggers: [{ x: 13, y: 2, w: 2, h: 1, id: 'forestClosed' }],
    hidden: [
      { id: 'os_labda1', x: 3, y: 36, item: 'sima_labda', qty: 2 },
      { id: 'os_ital', x: 27, y: 40, item: 'nagy_ital', qty: 1 },
      { id: 'os_profi', x: 4, y: 6, item: 'profi_labda', qty: 2 },
      { id: 'os_arany', x: 26, y: 5, item: 'arany_labda', qty: 1 },
      { id: 'os_falat', x: 10, y: 29, item: 'jutalomfalat', qty: 1 },
    ],
    secretBush: { x: 24, y: 7 },
    roamers: [
      { species: 'kacsa', area: [23, 30, 5, 3], level: [4, 6] },
      { species: 'alap', area: [2, 41, 3, 4], level: [3, 5] },
      { species: 'beka', area: [18, 30, 4, 3], level: [3, 6] },
      { species: 'mehecske', area: [2, 26, 4, 4], level: [4, 6] },
      { species: 'alap', area: [14, 12, 6, 3], level: [5, 7] },
      { species: 'banyasz', area: [2, 17, 5, 2], level: [5, 7] },
    ],
    encounters: {
      default: {
        day:   [['alap', 30], ['beka', 30], ['mehecske', 18], ['kacsa', 12], ['nindzsa', 6], ['lang', 4]],
        night: [['alap', 25], ['beka', 25], ['mehecske', 10], ['nindzsa', 20], ['szellem', 15], ['kacsa', 5]],
        levels: [2, 5],
      },
      zones: [
        { rect: [3, 4, 8, 8], levels: [5, 8] },
        { rect: [16, 4, 5, 7], levels: [5, 8] },
        { rect: [25, 3, 3, 9], id: 'titkos', day: [['kiber', 40], ['banyasz', 45], ['lang', 15]], night: [['kiber', 35], ['banyasz', 35], ['szellem', 30]], levels: [6, 9] },
      ],
    },
  },
};

export const TRAINERS = {
  bence: {
    name: 'Bence, a kezdő edző', sprite: 'edzo1', reward: 300, sight: 4,
    team: [['alap', 5], ['beka', 6]],
    intro: 'Hé! Te is Mexi-edző vagy? Mérkőzzünk meg!', lose: 'Jaj, ez gyors volt! Még gyakorolnom kell.', after: 'A Béka Mexi ellen a Növény-támadások nagyon hatékonyak!',
  },
  lili: {
    name: 'Lili, a kalandor', sprite: 'edzo2', reward: 450, sight: 4,
    team: [['mehecske', 6], ['nindzsa', 6], ['kacsa', 7]],
    intro: 'Az én csapatom gyors és trükkös! Készen állsz?', lose: 'Hűha, ügyes vagy! A Titokzatos Erdőben találkozunk.', after: 'Az alvó Mexit sokkal könnyebb elkapni!',
  },
};

// ===================== BELSŐ TEREK =====================
// Csempekódok: W fal, w fal ablakkal, P fal képpel, . padló, E kijárati lábtörlő, 1–9 szőnyeg (3×3)
// furniture: { k: bútor, x, y: a lábnyom bal alsó csempéje, w, h: méret csempében, solid, act }
// act: 'heal' | 'shop' | 'pc' | 'bed' | szöveg
function room(rows) { return rows.map(r => r.split('')); }
const exitTo = (x, H, tx, ty) => [{ x, y: H, to: 'mancsfalva', tx, ty, dir: 'down' }, { x: x + 1, y: H, to: 'mancsfalva', tx, ty, dir: 'down' }];

Object.assign(MAPS, {
  int_home: {
    name: 'Otthon', interior: true,
    theme: { floor: 'wood1', wall: 'hwall', win: 'hwall_win', pic: 'hwall_pic' },
    tiles: room([
      'WwWWPWWwWW',
      '..........',
      '..........',
      '....123...',
      '....456...',
      '....789...',
      '..........',
      '.....E....',
    ]),
    furniture: [
      { k: 'wardrobe', x: 0, y: 1 }, { k: 'bed', x: 1, y: 2, w: 2, h: 2, act: 'bed' }, { k: 'nightstand', x: 3, y: 1 },
      { k: 'plant2', x: 4, y: 1 }, { k: 'stove', x: 5, y: 1 }, { k: 'kcounter', x: 6, y: 1, w: 2 }, { k: 'fridge', x: 8, y: 1 }, { k: 'sink', x: 9, y: 1 },
      { k: 'clock', x: 2, y: 0, solid: false, wall: true },
      { k: 'tv', x: 1, y: 4, act: 'Egy Mexi-dokumentumfilm megy: „A Sárkányhegy legendái”.' }, { k: 'sofa', x: 1, y: 6, w: 2 }, { k: 'floorlamp', x: 0, y: 4 },
      { k: 'dining', x: 7, y: 4, w: 2, h: 2 }, { k: 'plant', x: 9, y: 3 },
      { k: 'dogbed', x: 8, y: 6, w: 2, act: 'Mexi kedvenc fekhelye. Puha és meleg!' }, { k: 'bowls', x: 7, y: 6 }, { k: 'toybox', x: 0, y: 6, act: 'Tele van teniszlabdákkal és rágócsontokkal.' },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'anya_bent', sprite: 'anya', x: 3, y: 3, dir: 'down', wander: 1, talk: 'mom' }],
    warps: exitTo(5, 8, 6, 20).slice(0, 1),
  },
  int_house: {
    name: 'Szomszéd háza', interior: true,
    theme: { floor: 'parquet', wall: 'hwall', win: 'hwall_win', pic: 'hwall_pic' },
    tiles: room([
      'WWwWWWPWW',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '....E....',
    ]),
    furniture: [
      { k: 'bookshelf', x: 0, y: 1, act: 'Régi könyvek: „Mexi-gondozás kezdőknek”, „A teniszlabda titkai”...' }, { k: 'fireplace', x: 3, y: 1, w: 2 },
      { k: 'armchair', x: 5, y: 2 }, { k: 'bed', x: 7, y: 2, w: 2, h: 2, act: 'bed' }, { k: 'table', x: 1, y: 4, w: 2 }, { k: 'chair', x: 3, y: 4 },
      { k: 'plant', x: 8, y: 5 }, { k: 'picture', x: 6, y: 0, solid: false, wall: true },
      { k: 'roundrug', x: 5, y: 5, w: 2, h: 2, solid: false },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'szomszed', sprite: 'bacsi', x: 2, y: 2, dir: 'down', wander: 1, talk: ['Szomszéd: Hallottad? Az ösvényen túl van egy Titokzatos Erdő...', 'Állítólag ott Mágus Mexik varázsolnak a fák között!'] }],
    warps: exitTo(4, 7, 12, 20).slice(0, 1),
  },
  int_house2: {
    name: 'Kék ház', interior: true,
    theme: { floor: 'wood2', wall: 'hwall', win: 'hwall_win', pic: 'hwall_pic' },
    tiles: room([
      'WWWWWWWWW',
      '.........',
      '.........',
      '.........',
      '.........',
      '.........',
      '....E....',
    ]),
    furniture: [
      { k: 'window2', x: 3, y: 0, solid: false, wall: true }, { k: 'clock2', x: 6, y: 0, solid: false, wall: true },
      { k: 'bed2', x: 0, y: 2, w: 2, h: 2, act: 'bed' }, { k: 'nightstand2', x: 2, y: 1 }, { k: 'tv2', x: 4, y: 1, act: 'Mexi-rajzfilm megy. A kisfiú imádja!' },
      { k: 'floorlamp2', x: 5, y: 1 }, { k: 'bookshelf2', x: 7, y: 1 }, { k: 'toybox2', x: 8, y: 1, act: 'Plüss Mexik és egy kopott teniszlabda.' },
      { k: 'sofa2', x: 4, y: 3, w: 2 }, { k: 'roundrug2', x: 4, y: 5, w: 2, h: 1, solid: false },
      { k: 'dogbed2', x: 7, y: 5, w: 2 }, { k: 'bowls2', x: 6, y: 5 }, { k: 'plant3', x: 0, y: 5 }, { k: 'plant4', x: 8, y: 3 },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'kisfiu_bent', sprite: 'kisfiu', x: 2, y: 4, dir: 'down', wander: 1, talk: ['Ha nagy leszek, én leszek a legjobb Mexi-edző!', 'Tudtad? A Kacsa Mexi az egyik leggyorsabb!'] }],
    warps: exitTo(4, 7, 29, 11).slice(0, 1),
  },
  int_shop: {
    name: 'Teniszlabda- és felszerelésbolt', interior: true,
    theme: { floor: 'greencheck', wall: 'swall', win: 'swall2', pic: 'swall2' },
    tiles: room([
      'WWPWWWWWWW',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '.....E....',
    ]),
    furniture: [
      { k: 'packages', x: 0, y: 1 }, { k: 'counter', x: 1, y: 2, w: 3, act: 'shop' }, { k: 'poster', x: 2, y: 0, solid: false, wall: true },
      { k: 'shelf_balls', x: 5, y: 1 }, { k: 'shelf_balls', x: 6, y: 1 }, { k: 'shelf_potions', x: 7, y: 1 }, { k: 'shelf_potions', x: 8, y: 1 },
      { k: 'basket', x: 9, y: 2, act: 'Egy kosárnyi teniszlabda. A pultnál lehet venni!' }, { k: 'showcase', x: 8, y: 5, w: 2 },
      { k: 'pawrug', x: 4, y: 5, w: 2, solid: false }, { k: 'plant', x: 0, y: 4 }, { k: 'bin', x: 0, y: 6 }, { k: 'bell', x: 6, y: 0, solid: false, wall: true },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'boltos_bent', sprite: 'boltos', x: 2, y: 1, dir: 'down', wander: 0, talk: 'shop' }],
    warps: exitTo(5, 8, 25, 20).slice(0, 1),
  },
  int_heal: {
    name: 'Mexi-gyógyítóállomás', interior: true,
    theme: { floor: 'pinkcheck', wall: 'cwall', win: 'cwall2', pic: 'cwall2' },
    tiles: room([
      'WWWWWPWWWWW',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '.....E.....',
    ]),
    furniture: [
      { k: 'palm', x: 0, y: 2 }, { k: 'cabinet', x: 2, y: 1 }, { k: 'healcounter', x: 4, y: 2, w: 3, act: 'heal' },
      { k: 'healmachine', x: 7, y: 1, w: 2 }, { k: 'pc', x: 9, y: 1, act: 'pc' }, { k: 'water', x: 10, y: 2 },
      { k: 'bench_in', x: 1, y: 5, w: 2 }, { k: 'bench_in', x: 8, y: 5, w: 2 }, { k: 'pawrug', x: 5, y: 5, w: 2, solid: false },
      { k: 'stretcher', x: 0, y: 7, w: 2 }, { k: 'lamp_in', x: 10, y: 6 },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'apolo_bent', sprite: 'apolo', x: 5, y: 1, dir: 'down', wander: 0, talk: 'heal' }],
    warps: exitTo(5, 8, 24, 11).slice(0, 1),
  },
  int_lab: {
    name: 'Mexi-kutató labor', interior: true,
    theme: { floor: 'metal1', wall: 'lwall', win: 'lwall2', pic: 'lwall2' },
    tiles: room([
      'WWWWWWWWWWW',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '...........',
      '.....E.....',
    ]),
    furniture: [
      { k: 'blackboard', x: 1.5, y: 0, solid: false, wall: true }, { k: 'labcoat', x: 4, y: 0, solid: false, wall: true }, { k: 'worldmap', x: 7.5, y: 0, solid: false, wall: true },
      { k: 'labdesk', x: 0, y: 1, w: 2, act: 'pc' }, { k: 'scanner', x: 3, y: 1, act: 'Mexidex-szkenner. A Mexidexed adatai innen frissülnek.' },
      { k: 'labshelf', x: 5, y: 1, act: 'Kutatási jegyzetek: „A Mexik típusai és a típuselőnyök”.' },
      { k: 'analyzer', x: 6, y: 1, w: 2, act: 'Nagy elemzőgép: „Mexi-DNS vizsgálat folyamatban... 87%”.' },
      { k: 'aquarium', x: 9, y: 1, w: 2, act: 'Halak úszkálnak benne. A Béka Mexik imádják nézni.' },
      { k: 'capsules', x: 4, y: 3, w: 2, act: 'Három kapszula – a kezdő Mexiket a professzor már kiosztotta.' },
      { k: 'filing', x: 0, y: 3 }, { k: 'microscope', x: 1, y: 4 }, { k: 'testtubes', x: 2, y: 4 },
      { k: 'fan', x: 10, y: 3 }, { k: 'petri', x: 8, y: 4, w: 2, act: 'Kísérleti tál: csillogó szőrcsomók mintái.' },
      { k: 'robotarm', x: 10, y: 6 }, { k: 'teleport', x: 7, y: 6, w: 2, solid: false },
      { k: 'coffee', x: 0, y: 6, act: 'A professzor kávéja. Már kihűlt.' }, { k: 'globe', x: 3, y: 6 }, { k: 'bellplant', x: 2, y: 6 },
      { k: 'treatmachine', x: 9, y: 4, act: 'Kutyakeksz-adagoló. Ropp! Mexi kapott egy falatot.' },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'asszisztens', sprite: 'gyujto', x: 6, y: 4, dir: 'down', wander: 1, talk: ['Kutatóasszisztens: A professzor kint van a téren, ő adja a kezdő Mexiket.', 'Az asztali gépen eléred a Mexi-tárolódat!'] }],
    warps: exitTo(5, 8, 6, 11).slice(0, 1),
  },
  int_gym: {
    name: 'Mexi Gym', interior: true,
    theme: { floor: 'wood1', wall: 'hwall', win: 'hwall', pic: 'hwall', tiles: { '.': 'fu_g_floorwood', o: 'fu_g_floorpaw', e: 'fu_g_edge' } },
    tiles: room([
      'WWWWWWWWWWWWW',
      '.............',
      '.............',
      '...eeeeeee...',
      '...eoooooe...',
      '...eoooooe...',
      '...eoooooe...',
      '...eoooooe...',
      '...eeeeeee...',
      '.............',
      '......E......',
    ]),
    furniture: [
      { k: 'banner_sun', x: 3, y: 0, solid: false, wall: true }, { k: 'banner_moon', x: 6, y: 0, solid: false, wall: true }, { k: 'banner_storm', x: 9, y: 0, solid: false, wall: true },
      { k: 'leaderpodium', x: 5, y: 2, w: 3, act: 'A Gym-vezető trónja még üres. Hamarosan itt harcolhatsz a frakciókért!' },
      { k: 'torch', x: 3, y: 1 }, { k: 'torch', x: 9, y: 1 },
      { k: 'pillar', x: 1, y: 4 }, { k: 'pillar', x: 11, y: 4 }, { k: 'pillar', x: 1, y: 8 }, { k: 'pillar', x: 11, y: 8 },
      { k: 'trophy', x: 12, y: 1, act: 'A Mancsfalva-kupa. Egyszer talán a tiéd lesz!' }, { k: 'gymchest', x: 0, y: 1, act: 'Lezárt jutalomláda. Gym-győzelem után nyílik.' },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [{ id: 'gymor', sprite: 'edzo1', x: 4, y: 9, dir: 'down', wander: 0, talk: ['Gym-őr: Üdv a Mexi Gymben!', 'Hamarosan itt a Napmancs, Holdmancs és Viharmancs frakciók harcolnak az arénáért.', 'Addig is edzd a Mexijeidet az ösvényen!'] }],
    warps: exitTo(6, 11, 13, 11).slice(0, 1),
  },
});
