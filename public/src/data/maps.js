// Térképek – kézzel tervezett, összefüggő elrendezés (semmi véletlenszerű elhelyezés).
// Csempekódok:
//  .  fű          "  magas fű (vad Mexik)    =  földút     c  kőburkolat
//  ~  víz         s  homok           f  rózsaszín virág         w  fehér virág
//  T  fa          b  bokor           r  szikla                  F  kerítés
//  h  gyanús bokor (szimatolással nyitható)                     p  feltárt ösvény
//  :  barlangpadló (vad Mexik!)  K  sziklafal   g  kavics      d  sötét fű     B  híd
export const SOLID = new Set(['~', 'T', 'b', 'r', 'F', 'h', '#', 'W', 'w', 'P', 'K']);

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


// ===================== KRISTÁLYBARLANG (30 × 24) =====================
function buildBarlang() {
  const rows = [
    'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
    'KKKKKKKKKKKKKKKKKKKKK::::::KKK',
    'KK:::::KKKKKKKKKKKKKK::::::KKK',
    'KK:::::::::KKKK~~~~KK::::::KKK',
    'KK::g::::::::KK~~~~~K:::::::KK',
    'KKK::::KK:::::~~~~~~::::KK::KK',
    'KKK:::KKKK::::~~~~~:::::KK::KK',
    'KK::::KKKK:::::~~~::::::::::KK',
    'KK:::::KK::::::::::KKKK:::::KK',
    'KKK::::::::KKKK::::KKKK:::KKKK',
    'KKKKK:::::KKKKK:::::KK::::KKKK',
    'KKKKK::::::KKK::::::::::::KKKK',
    'KK::::::g:::::::KKK::::g:::KKK',
    'KK::KKKK::::::::KKK:::::::::KK',
    'KK::KKKK:::KKK:::::::KKKK:::KK',
    'KK:::::::::KKK::::::KKKKK:::KK',
    'KKK:::::::::::::KK::::::::::KK',
    'KKKK::::KKK:::::KK:::KKK:::KKK',
    'KK::::::KKK::::::::::KKK:::KKK',
    'KK::::::::::::KKKK:::::::::KKK',
    'KK::::::::::::KKKK::::KKKKKKKK',
    'KKK::::KKKK:::::::::::KKKKKKKK',
    'KKK::::KKKK::::::KKKKKKKKKKKKK',
    'KKK::KKKKKKKKKKKKKKKKKKKKKKKKK',
  ];
  return rows.map(r => r.split(''));
}

// ===================== TITOKZATOS ERDŐ + HOLDTISZTÁS (34 × 50) =====================
function buildErdo() {
  const g = grid(34, 50);
  border(g);
  // Holdtisztás falu (észak)
  rect(g, 3, 11, 28, 2, 'c');            // főutca a házak előtt
  rect(g, 16, 9, 2, 2, 'c');             // a templom elé
  rect(g, 10, 4, 3, 2, 'w'); rect(g, 21, 4, 3, 2, 'f');
  rect(g, 2, 14, 12, 3, 'T');            // a falu déli fasora (nyugat)
  rect(g, 20, 13, 12, 2, 'T');           // (kelet)
  // az ösvény dél felé kanyarog
  rect(g, 16, 13, 2, 8, '=');
  rect(g, 8, 19, 10, 2, '=');
  rect(g, 8, 21, 2, 10, '=');
  rect(g, 2, 31, 30, 2, '~');            // patak
  rect(g, 8, 31, 2, 2, 'B');             // fahíd
  rect(g, 8, 33, 2, 4, '=');
  rect(g, 8, 37, 18, 2, '=');
  rect(g, 24, 39, 2, 5, '=');
  rect(g, 16, 44, 10, 2, '=');
  rect(g, 16, 46, 2, 4, '=');
  // magas fű
  rect(g, 3, 22, 4, 8, '"');             // nyugati rét
  rect(g, 11, 22, 8, 7, '"');            // középső rét
  rect(g, 22, 16, 9, 10, '"');           // mély erdő (erősebb Mexik)
  rect(g, 3, 40, 10, 5, '"');            // déli rét
  rect(g, 19, 40, 4, 4, '"');            // kis rét az út mellett
  // fák, tó, sötét aljnövényzet
  rect(g, 20, 27, 11, 3, 'T');
  rect(g, 12, 33, 4, 3, 'T'); rect(g, 2, 46, 6, 2, 'T'); rect(g, 26, 46, 6, 2, 'T');
  rect(g, 26, 40, 5, 4, 's'); rect(g, 27, 41, 3, 2, '~');
  rect(g, 18, 33, 10, 3, 'd'); rect(g, 3, 34, 4, 3, 'd'); rect(g, 19, 22, 2, 5, 'd');
  for (const [x, y] of [[5, 38], [29, 34], [12, 41], [28, 18]]) g[y][x] = 'r';
  for (const [x, y] of [[20, 9], [31, 9]]) g[y][x] = 'b';
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
      { k: 'cave', x: 4, y: 18 }, { k: 'forestarch', x: 13.5, y: 1, solid: false }, { k: 'log', x: 11, y: 30 }, { k: 'mushroom', x: 12, y: 29, solid: false },
      { k: 'stump', x: 26, y: 33 }, { k: 'pawstone', x: 22, y: 9 }, { k: 'tree_orange', x: 3, y: 31 },
      { k: 'tree_orange', x: 27, y: 18 }, { k: 'flowers', x: 2, y: 40, solid: false }, { k: 'tree', x: 20, y: 52 },
    ],
    signs: [
      { x: 16, y: 52, text: 'MEXI-ÖSVÉNY\nDél: Mancsfalva ↓   Észak: Titokzatos Erdő ↑' },
      { x: 16, y: 3, text: 'TITOKZATOS ERDŐ ↑\nAz őr csak tapasztalt edzőket enged át.' },
      { x: 6, y: 19, text: 'KRISTÁLYBARLANG\nSötét és mély. Csak felkészült csapattal lépj be!' },
      { x: 22, y: 9, text: 'Egy mancsnyomos kő. Ez áll rajta:\n„Aki szimatol, az utat talál.”', noPost: true },
    ],
    npcs: [
      { id: 'edzo_bence', sprite: 'edzo1', x: 8, y: 40, dir: 'left', wander: 0, trainer: 'bence' },
      { id: 'edzo_lili', sprite: 'edzo2', x: 20, y: 24, dir: 'right', wander: 0, trainer: 'lili' },
      { id: 'gyujto', sprite: 'gyujto', x: 11, y: 18, dir: 'down', wander: 2, talk: ['Ritka Mexiket keresek... Azt beszélik, valahol errefelé van egy titkos rét.', 'Északkeleten, a fák mögött egy bokor furcsa szagot áraszt. Próbálj meg szimatolni mellette!'] },
      { id: 'erdo_or', sprite: 'bacsi', x: 14, y: 1, dir: 'down', wander: 0, talk: ['Állj! A Titokzatos Erdő veszélyes.', 'Csak az mehet tovább, aki legyőzte Lilit, a kalandort!'], unlock: 'lili', unlockAt: { x: 16, y: 1, dir: 'left', talk: ['Legyőzted Lilit? Akkor menj csak! Vigyázz az erdőben.', 'Az erdő túloldalán van Holdtisztás falu.'] } },
    ],
    warps: [
      { x: 14, y: 55, to: 'mancsfalva', tx: 17, ty: 1, dir: 'down' },
      { x: 15, y: 55, to: 'mancsfalva', tx: 18, ty: 1, dir: 'down' },
      { x: 13, y: 0, to: 'erdo', tx: 16, ty: 48, dir: 'up' },
      { x: 14, y: 0, to: 'erdo', tx: 17, ty: 48, dir: 'up' },
      { x: 4, y: 18, to: 'barlang', tx: 3, ty: 22, dir: 'up' },
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
      { species: 'banyasz', area: [2, 19, 3, 2], level: [5, 7] },
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
  barlang: {
    name: 'Kristálybarlang', cave: true,
    tiles: buildBarlang(),
    buildings: [],
    props: [
      { k: 'chest', x: 24, y: 2 }, { k: 'treasure', x: 22, y: 2 }, { k: 'rock2', x: 8, y: 4 }, { k: 'rock2', x: 26, y: 16 },
      { k: 'boulder', x: 12, y: 16 }, { k: 'boulder', x: 20, y: 11 }, { k: 'mushroom', x: 3, y: 18, solid: false }, { k: 'mushroom', x: 27, y: 13, solid: false },
    ],
    signs: [{ x: 5, y: 21, text: 'KRISTÁLYBARLANG\nA mélyben egy régi kincsesláda rejtőzik...' }],
    npcs: [
      { id: 'edzo_kristof', sprite: 'edzo4', x: 9, y: 12, dir: 'down', wander: 0, trainer: 'kristof' },
      { id: 'edzo_hanna', sprite: 'edzo2', x: 25, y: 12, dir: 'left', wander: 0, trainer: 'hanna' },
      { id: 'kutato', sprite: 'gyujto', x: 3, y: 19, dir: 'right', wander: 0, talk: ['Barlangkutató vagyok. Itt bent nincs magas fű – a vad Mexik bárhol rád ugorhatnak!', 'A föld alatti tó körül Jég és Szellem Mexik élnek.', 'Szimatolj sokat! Rengeteg elrejtett kincs van a kövek között.'] },
    ],
    warps: [
      { x: 3, y: 23, to: 'osveny', tx: 4, ty: 19, dir: 'down' },
      { x: 4, y: 23, to: 'osveny', tx: 4, ty: 19, dir: 'down' },
    ],
    triggers: [],
    hidden: [
      { id: 'bl_lada', x: 24, y: 2, item: 'arany_labda', qty: 2 },
      { id: 'bl_kincs', x: 22, y: 2, item: 'ebreszto', qty: 2 },
      { id: 'bl_profi', x: 4, y: 4, item: 'profi_labda', qty: 3 },
      { id: 'bl_ital', x: 27, y: 15, item: 'nagy_ital', qty: 2 },
      { id: 'bl_balzsam', x: 13, y: 21, item: 'csodabalzsam', qty: 1 },
    ],
    roamers: [
      { species: 'banyasz', area: [3, 15, 5, 3], level: [8, 10] },
      { species: 'szellem', area: [21, 5, 3, 3], level: [10, 12] },
    ],
    encounters: {
      cave: true,
      default: {
        day:   [['banyasz', 32], ['kiber', 20], ['szellem', 16], ['alap', 12], ['nindzsa', 10], ['jeg', 10]],
        night: [['banyasz', 28], ['szellem', 26], ['kiber', 16], ['nindzsa', 14], ['jeg', 10], ['alap', 6]],
        levels: [8, 11],
      },
      zones: [
        { rect: [10, 2, 18, 7], id: 'to', day: [['jeg', 35], ['szellem', 25], ['banyasz', 20], ['kiber', 20]], night: [['szellem', 40], ['jeg', 35], ['banyasz', 15], ['kiber', 10]], levels: [10, 13] },
      ],
    },
  },
  erdo: {
    name: 'Titokzatos Erdő',
    tiles: buildErdo(),
    buildings: [
      { key: 'heal',   x: 4,  y: 10, action: 'heal',   name: 'Holdtisztási gyógyítóállomás' },
      { key: 'temple', x: 14, y: 8,  action: 'temple', name: 'Holdmancs-templom' },
      { key: 'shop',   x: 24, y: 10, doorDx: 1, action: 'shop', name: 'Holdtisztási bolt' },
    ],
    props: [
      { k: 'lamp', x: 12, y: 10 }, { k: 'lamp', x: 21, y: 10 }, { k: 'well', x: 11, y: 7 }, { k: 'bench', x: 22, y: 7 },
      { k: 'flowerbox', x: 3, y: 4 }, { k: 'tree_pink', x: 30, y: 4 }, { k: 'pawstone', x: 26, y: 5 },
      { k: 'log', x: 5, y: 36 }, { k: 'stump', x: 14, y: 39 }, { k: 'mushroom', x: 21, y: 34, solid: false }, { k: 'mushroom', x: 4, y: 35, solid: false },
      { k: 'tree_orange', x: 30, y: 36 }, { k: 'tree_orange', x: 2, y: 20 }, { k: 'flowers', x: 28, y: 44, solid: false },
    ],
    signs: [
      { x: 18, y: 46, text: 'TITOKZATOS ERDŐ\nDél: Mexi-ösvény ↓   Észak: Holdtisztás ↑' },
      { x: 10, y: 34, text: 'Figyelem! A patak mentén a Kacsa Mexik csapatban járnak.' },
      { x: 15, y: 13, text: 'HOLDTISZTÁS\nA Holdmancs-rend faluja.' },
      { x: 17, y: 3, text: 'Észak: Kőmancs-hegység\nAz út még járhatatlan. (Hamarosan!)' },
    ],
    npcs: [
      { id: 'edzo_mate', sprite: 'edzo5', x: 12, y: 18, dir: 'down', wander: 0, trainer: 'mate' },
      { id: 'edzo_reka', sprite: 'edzo3', x: 27, y: 37, dir: 'left', wander: 0, trainer: 'reka' },
      { id: 'ht_apolo', sprite: 'apolo', x: 9, y: 12, dir: 'down', wander: 1, talk: ['Üdv Holdtisztáson! A gyógyítóállomás itt van mögöttem.'] },
      { id: 'ht_bacsi', sprite: 'bacsi', x: 19, y: 11, dir: 'down', wander: 0, talk: ['A Holdmancs-templom a rend szentélye.', 'Egyszer itt lesz a környék legerősebb arénája. Addig készülj fel!', 'Éjjel a Mágus Mexik is előmerészkednek az erdő mélyéről...'] },
      { id: 'ht_gyujto', sprite: 'gyujto', x: 28, y: 12, dir: 'left', wander: 2, talk: ['A keleti mély erdőben ritka Mexik élnek. Mágus Mexit láttam ott!', 'Az ösvényen lévő Kristálybarlangban Jég Mexik laknak.'] },
      { id: 'ht_kisfiu', sprite: 'kisfiu', x: 6, y: 24, dir: 'right', wander: 2, talk: ['A híd alatt néha valami csillog...'] },
    ],
    warps: [
      { x: 16, y: 49, to: 'osveny', tx: 13, ty: 1, dir: 'down' },
      { x: 17, y: 49, to: 'osveny', tx: 14, ty: 1, dir: 'down' },
    ],
    triggers: [],
    hidden: [
      { id: 'er_hid', x: 10, y: 33, item: 'profi_labda', qty: 3 },
      { id: 'er_mely', x: 30, y: 16, item: 'arany_labda', qty: 1 },
      { id: 'er_to', x: 26, y: 40, item: 'nagy_ital', qty: 1 },
      { id: 'er_falu', x: 31, y: 4, item: 'ebreszto', qty: 1 },
      { id: 'er_ret', x: 3, y: 39, item: 'sima_labda', qty: 5 },
    ],
    roamers: [
      { species: 'mehecske', area: [10, 22, 1, 6], level: [9, 11] },
      { species: 'kacsa', area: [18, 30, 6, 1], level: [9, 11] },
      { species: 'nindzsa', area: [22, 26, 6, 1], level: [10, 12] },
      { species: 'lang', area: [14, 40, 4, 3], level: [9, 11] },
    ],
    encounters: {
      default: {
        day:   [['mehecske', 24], ['beka', 18], ['kacsa', 14], ['nindzsa', 14], ['lang', 12], ['alap', 12], ['magus', 6]],
        night: [['szellem', 28], ['nindzsa', 24], ['magus', 10], ['beka', 14], ['kacsa', 12], ['mehecske', 12]],
        levels: [8, 11],
      },
      zones: [
        { rect: [22, 16, 9, 10], id: 'mely', day: [['nindzsa', 25], ['lang', 20], ['mehecske', 20], ['kiber', 20], ['magus', 15]], night: [['szellem', 35], ['nindzsa', 30], ['magus', 20], ['jeg', 15]], levels: [10, 13] },
      ],
    },
  },
};

export const TRAINERS = {
  bence: {
    name: 'Bence, a kezdő edző', sprite: 'edzo1', reward: 300, sight: 4,
    team: [['alap', 6], ['beka', 7]],
    intro: 'Hé! Te is Mexi-edző vagy? Mérkőzzünk meg!', lose: 'Jaj, ez gyors volt! Még gyakorolnom kell.', after: 'A Béka Mexi ellen a Növény-támadások nagyon hatékonyak!',
  },
  lili: {
    name: 'Lili, a kalandor', sprite: 'edzo2', reward: 450, sight: 4,
    team: [['mehecske', 7], ['nindzsa', 7], ['kacsa', 8]],
    intro: 'Az én csapatom gyors és trükkös! Készen állsz?', lose: 'Hűha, ügyes vagy! Mostantól az erdő őre téged is átenged.', after: 'Az alvó Mexit sokkal könnyebb elkapni! Az erdő északon van, a barlang nyugaton.',
  },
  kristof: {
    name: 'Kristóf, a bányász', sprite: 'edzo4', reward: 650, sight: 4,
    team: [['banyasz', 10], ['kiber', 10], ['banyasz', 11]],
    intro: 'Ebben a barlangban én vagyok a főnök! Lássuk, mit tudsz!', lose: 'Kő kövön nem marad... legyőztél!', after: 'A Víz és a Növény támadások ellen a Bányász Mexim gyenge.',
  },
  hanna: {
    name: 'Hanna, a barlangkutató', sprite: 'edzo2', reward: 750, sight: 4,
    team: [['szellem', 11], ['jeg', 11], ['nindzsa', 12]],
    intro: 'Pszt! A tó körül a Mexik nagyon erősek. Készen állsz egy próbára?', lose: 'Hihetetlen! A kincsesláda a tó mögött vár rád.', after: 'A ládához a tó északi partján jutsz el.',
  },
  mate: {
    name: 'Máté, a mágus-tanonc', sprite: 'edzo5', reward: 600, sight: 4,
    team: [['mehecske', 11], ['lang', 12], ['beka', 12]],
    intro: 'Az erdő szellemei megsúgták, hogy jössz! Harcoljunk!', lose: 'Ezt nem jósolták meg a szellemek...', after: 'A mély erdőben, keletre, Mágus Mexik is élnek.',
  },
  reka: {
    name: 'Réka, az erdőjáró', sprite: 'edzo3', reward: 700, sight: 4,
    team: [['nindzsa', 11], ['kacsa', 11], ['szellem', 12]],
    intro: 'Senki sem jut át az erdőn úgy, hogy ne mérkőzne meg velem!', lose: 'Rendben, átengedlek. Holdtisztás északra van.', after: 'Éjjel a Szellem Mexik sokkal gyakoribbak.',
  },
};

// ===================== BELSŐ TEREK =====================
// Csempekódok: W fal, w fal ablakkal, P fal képpel, . padló, E kijárati lábtörlő, 1–9 szőnyeg (3×3)
// furniture: { k: bútor, x, y: a lábnyom bal alsó csempéje, w, h: méret csempében, solid, act }
// act: 'heal' | 'shop' | 'pc' | 'bed' | szöveg
function room(rows) { return rows.map(r => r.split('')); }
const exitTo = (x, H, tx, ty) => [{ x, y: H, to: 'mancsfalva', tx, ty, dir: 'down', back: true }, { x: x + 1, y: H, to: 'mancsfalva', tx, ty, dir: 'down', back: true }];

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
