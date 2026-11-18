// MexiVerse – a nagy világ: 6 város (mindegyikben gym), az őket összekötő utak és a Holdmancs-aréna.
// Továbbjutás: minden város kijáratánál őr áll, aki csak az adott gym-vezető legyőzése után enged tovább.
// A tájak (biome) saját csempéket használnak: assets/tiles2.png (mocsár, vulkán, neonváros, szentély).

// ---------- segédfüggvények ----------
function grid(w, h, ch = '.') { return Array.from({ length: h }, () => Array(w).fill(ch)); }
function rect(g, x, y, w, h, ch) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j] && g[j][i] !== undefined) g[j][i] = ch; }
function border(g, t = 2, ch = 'T') { const H = g.length, W = g[0].length; rect(g, 0, 0, W, t, ch); rect(g, 0, H - t, W, t, ch); rect(g, 0, 0, t, H, ch); rect(g, W - t, 0, t, H, ch); }
const dots = (g, list, ch) => { for (const [x, y] of list) if (g[y] && g[y][x] !== undefined) g[y][x] = ch; };

// ---------- tájak: karakter → csempe ----------
// Közös jelek: .  talaj   "  magas fű (vad Mexik)   =  út   ~  víz/láva (tömör)   B/V  híd (vízsz./függ.)
//   T  szegély (táj szerinti fa/szikla/díszlet, tömör)   X Y Z Q R U J M N O  tömör díszletek
//   a m o k l s g f p v z n y G S w  járható díszburkolatok
export const BIOME_SOLID = new Set(['#', '~', 'T', 'X', 'Y', 'Z', 'Q', 'R', 'U', 'J', 'M', 'N', 'O', 'K', 'b', 'r']);
const SW = 0, VO = 32, NE = 64, SH = 96;
export const BIOMES = {
  swamp: {
    base: SW, ground: [0, 0, 0, 1, 2], tall: [3, 4], path: 7, water: [8, 9], shore: [16, 17, 18, 19, 20, 21, 22, 23], fill: 0, treeProp: 'tree',
    map: { m: 5, s: 6, k: 28, l: 30, B: 13, V: 14, G: 15, X: 24, Y: 25, Z: 26, Q: 27, R: 29, U: 31, J: 10, M: 11, N: 12 },
  },
  volcano: {
    base: VO, ground: [0, 0, 1, 2], tall: [7], path: 6, water: [8, 9], shore: [16, 17, 18, 19, 20, 21, 22, 23], fill: 0, border: [30, 28],
    map: { a: 3, s: 4, o: 5, G: 15, B: 13, V: 14, X: 24, Y: 25, Z: 26, f: 27, R: 28, S: 29, K: 30, O: 31, M: 12, N: 11, J: 10 },
  },
  neon: {
    base: NE, ground: [4], tall: [7], path: 0, water: [8, 9], shore: [20, 21, 22, 23, 20, 20, 21, 21], fill: 0, border: [30, 25, 28],
    map: { h: 1, v: 2, z: 3, n: 5, m: 6, o: 10, M: 11, s: 12, B: 13, V: 14, y: 15, X: 24, Y: 25, Z: 26, Q: 27, R: 28, U: 29, J: 30, N: 31 },
  },
  shrine: {
    base: SH, ground: [0, 0, 1], tall: [4], path: 6, water: [8, 9], shore: [16, 17, 18, 19, 20, 21, 22, 23], fill: 0, border: [25, 24, 30],
    map: { p: 1, g: 2, f: 3, w: 5, o: 7, k: 10, l: 11, B: 12, V: 13, X: 14, Y: 15, Z: 24, Q: 25, R: 26, U: 27, J: 28, M: 29, N: 30, F: 31 },
  },
  snow: { snow: true, treeProp: 'tree' },
};
/** Egy biome-térkép karakteréhez tartozó csempe: ['tiles2', index] vagy ['tiles', név]. */
export function biomeFrame(biome, ch, x, y, nb) {
  const B = BIOMES[biome]; const v = (x * 7 + y * 13) % 17;
  if (B.snow) {
    switch (ch) {
      case '"': return ['tiles', 'tall0'];
      case '=': return ['tiles', 'stonetile'];
      case '~': return ['tiles', 'water0'];
      case 'i': return ['tiles', v % 4 ? 'ice' : 'icecrack'];
      case 'B': return ['tiles', 'bridge2'];
      case 'c': return ['tiles', 'cobble'];
      default: return ['tiles', v % 5 === 0 ? 'snow2' : 'snow'];
    }
  }
  const t = (i) => ['tiles2', B.base + i];
  if (ch === '~') {
    // part: ha a víz mellett szárazföld van, peremcsempe
    const [n, s, w, e] = nb;
    const S = B.shore;
    if (n && w) return t(S[4]); if (n && e) return t(S[5]); if (s && w) return t(S[6]); if (s && e) return t(S[7]);
    if (n) return t(S[0]); if (s) return t(S[1]); if (w) return t(S[2]); if (e) return t(S[3]);
    return t(B.water[0]);
  }
  if (ch === '"') return t(B.tall[(x + y) % B.tall.length]);
  if (ch === '=') return t(B.path);
  if (ch === 'T' && B.border) return t(B.border[(x * 3 + y * 5) % B.border.length]);
  if (B.map[ch] !== undefined) return t(B.map[ch]);
  return t(B.ground[v % B.ground.length]);
}
export const isWaterFrame = (biome, frame) => !BIOMES[biome].snow && frame[0] === 'tiles2' && frame[1] === BIOMES[biome].base + BIOMES[biome].water[0];

// ---------- edzők ----------
export const TRAINERS2 = {
  // gym-vezetők: 3 Mexi, azonos típus
  bodza: { name: 'Bodza, Mancsfalva gym-vezetője', sprite: 'ldr_bodza', reward: 1200, sight: 3, leader: true, badge: 'Napmancs-jelvény',
    team: [['alap', 11], ['szakacs', 12], ['rocker', 13]],
    intro: 'Szia! Én vagyok Bodza, a Semleges Mexik mestere. Mutasd, mennyit tanultál!', lose: 'Ez igen! Megérdemelted a Napmancs-jelvényt! 🌞 Most már Holdtisztás keleti kapuján is átengednek.', after: 'A Nádas-mocsárban Lotti vár rád. A Víz Mexik ellen a Villám és a Növény jó választás!' },
  lotti: { name: 'Lotti, Nádas gym-vezetője', sprite: 'ldr_lotti', reward: 1800, sight: 3, leader: true, badge: 'Cseppmancs-jelvény',
    team: [['beka', 18], ['kaloz', 19], ['viharkacsa', 20]],
    intro: 'Csobb! Itt a mocsárban a víz az úr. Állod a hullámokat?', lose: 'Elmosott a hullám... Tiéd a Cseppmancs-jelvény! 💧', after: 'Neonvárosban Volt vár rád. A Föld Mexik nem félnek a villámtól!' },
  volt: { name: 'Volt, Neonváros gym-vezetője', sprite: 'ldr_volt', reward: 2400, sight: 3, leader: true, badge: 'Villámmancs-jelvény',
    team: [['szikra', 24], ['kiborg', 25], ['viharfarkas', 26]],
    intro: 'Yo! Érzed a feszültséget? Ma szikrázni fog a pálya!', lose: 'Rövidzárlat... Oké, a Villámmancs-jelvény a tiéd! ⚡', after: 'Északra, Sakura-ligetben Kaori, az Árnyék Mexik mestere vár.' },
  kaori: { name: 'Kaori, Sakura-liget gym-vezetője', sprite: 'ldr_kaori', reward: 3000, sight: 3, leader: true, badge: 'Szellemmancs-jelvény',
    team: [['szellem', 30], ['vampirgrof', 31], ['arnyekmester', 32]],
    intro: 'A szellemek suttognak... azt mondják, erős vagy. Lássuk.', lose: 'A fény elűzte az árnyékot. Fogadd el a Szellemmancs-jelvényt. 🔮', after: 'A Fagyos hágón túl Jégvár vár. Öltözz melegen!' },
  frida: { name: 'Frida, Jégvár gym-vezetője', sprite: 'ldr_frida', reward: 3600, sight: 3, leader: true, badge: 'Hópehely-jelvény',
    team: [['jeg', 35], ['kristaly', 36], ['gleccser', 37]],
    intro: 'Hideg a szívem és hideg a csapatom. Kibírod a fagyot?', lose: 'Elolvadt a jég... A Hópehely-jelvény a tiéd! ❄️', after: 'A Hamu-úton túl Sárkányhegy. Ott Parázs Pál kovácsolja a legforróbb Mexiket.' },
  pal: { name: 'Parázs Pál, Sárkányhegy gym-vezetője', sprite: 'ldr_pal', reward: 4200, sight: 3, leader: true, badge: 'Lángmancs-jelvény',
    team: [['vulkan', 40], ['langvezer', 41], ['lavakiraly', 42]],
    intro: 'HAHÓ! Itt a hegy gyomrában kovácsolódnak a bajnokok. Készen állsz a tűzre?', lose: 'Kihűlt a kohó! Megérdemelted a Lángmancs-jelvényt! 🔥', after: 'Északon a Holdmancs-aréna. Luna, a bajnok vár rád!' },
  luna: { name: 'Luna, a Holdmancs-bajnok', sprite: 'ldr_luna', reward: 8000, sight: 3, leader: true, badge: 'Holdmancs-korona',
    team: [['angyal', 45], ['fomagus', 46], ['arkangyal', 48]],
    intro: 'Hat jelvény... Szép út áll mögötted. Én vagyok Luna, a Holdmancs-bajnok. Mutasd meg a fényed!', lose: 'Ragyogó harc volt. Mostantól TE vagy a MexiVerse bajnoka! 🌙👑', after: 'Gyere vissza bármikor egy visszavágóra, bajnok!' },
  // sima edzők az utakon: 1–2 Mexi
  u1_peti: { name: 'Peti, a horgász', sprite: 'kisfiu', reward: 500, sight: 4, team: [['beka', 14], ['kacsa', 15]], intro: 'Pszt, elijeszted a halakat! Na jó, harcoljunk!', lose: 'Ma nem harap semmi...', after: 'A nádasban Gomba Mexik is teremnek.' },
  u1_zsofi: { name: 'Zsófi, a mocsárjáró', sprite: 'edzo2', art: 'lili', reward: 550, sight: 4, team: [['gomba', 16]], intro: 'Csizma nélkül ne gyere a mocsárba!', lose: 'Bokáig süllyedtem...', after: 'Nádas falu keletre van.' },
  u2_robi: { name: 'Robi, a robotépítő', sprite: 'gyujto', art: 'kristof', reward: 700, sight: 4, team: [['kiber', 20], ['lovag', 21]], intro: 'Bip-bup! Tesztharc indul!', lose: 'Hiba 404: győzelem nem található.', after: 'Neonvárosban minden áramból van.' },
  u2_nina: { name: 'Nina, a gördeszkás', sprite: 'edzo2', art: 'hanna', reward: 750, sight: 4, team: [['rocker', 22]], intro: 'Csekkold a trükkjeimet!', lose: 'Leestem a deszkáról...', after: 'A csatorna mellett éjjel Űrhajós Mexik bukkannak fel.' },
  u3_hiro: { name: 'Hiro, a kardforgató', sprite: 'edzo1', art: 'bence', reward: 900, sight: 4, team: [['nindzsa', 26], ['lovag', 27]], intro: 'A penge útja a csend útja. Harc!', lose: 'Tanulnom kell még a mestertől.', after: 'A bambuszosban Szellem Mexik suhannak.' },
  u3_yuki: { name: 'Yuki, a papnő-tanonc', sprite: 'edzo2', art: 'lili', reward: 950, sight: 4, team: [['virag', 28]], intro: 'A cseresznyevirág alatt harcolni szerencsét hoz!', lose: 'A szirmok neked hullanak.', after: 'Kaori szenszei a liget szívében vár.' },
  u4_bela: { name: 'Béla, a hegymászó', sprite: 'bacsi', reward: 1100, sight: 4, team: [['kristaly', 31], ['banyasz', 32]], intro: 'Ilyen hidegben csak a kemények bírják!', lose: 'Megfagyott a bajszom...', after: 'Jégvár a hágó tetején van.' },
  u4_emma: { name: 'Emma, a síelő', sprite: 'edzo2', art: 'hanna', reward: 1150, sight: 4, team: [['jeg', 33]], intro: 'Fagyos csata jön!', lose: 'Elcsúsztam a jégen...', after: 'Gleccser Mexiket a hágó tetején láttam.' },
  u5_marci: { name: 'Marci, a vulkanológus', sprite: 'gyujto', art: 'kristof', reward: 1300, sight: 4, team: [['vulkan', 36], ['banyasz', 37]], intro: 'A hamu alatt izzik a föld. Mérjük össze!', lose: 'Kitört a vereség...', after: 'Sárkányhegy keletre van, a láva mögött.' },
  u5_dora: { name: 'Dóra, a tűzrajongó', sprite: 'edzo2', art: 'lili', reward: 1350, sight: 4, team: [['langvezer', 38]], intro: 'Égjen minden!', lose: 'Kialudt a lángom.', after: 'Pál mester a gymben kovácsol.' },
};

// ---------- épület-készletek tájanként ----------
const KIT = {
  swamp: { heal: 'sw_heal', shop: 'sw_shop', house: 'sw_house' },
  neon: { heal: 'neon_heal', shop: 'neon_shop', house: 'neon_house' },
  shrine: { heal: 'jp_heal', shop: 'jp_shop', house: 'jp_house' },
  snow: { heal: 'heal', shop: 'shop', house: 'snow_house' },
  volcano: { heal: 'vol_heal', shop: 'shop', house: 'vol_house' },
};

/**
 * Egységes városalaprajz (32×24): felül gyógyító – gym – bolt, alul két ház; a főutca a 12–13. sorban fut.
 * exits: { w, e, n, s } → { to, tx, ty, dir, gate? }
 */
function town({ key, name, greet, biome, gym, leader, exits, deco = [], npcs = [], signs = [], hidden = [], groundCh = '.' }) {
  const W = 32, H = 24, g = grid(W, H, groundCh); border(g, 2, 'T');
  rect(g, 2, 12, 28, 2, '=');                          // főutca
  rect(g, 15, 14, 2, 6, '=');                           // le a házakhoz
  rect(g, 5, 18, 22, 2, '=');                           // alsó utca
  for (const x of [5, 15, 26]) rect(g, x, 10, 1, 2, '=');  // a felső ajtók elé
  for (const x of [6, 25]) rect(g, x, 20, 1, 1, '=');
  for (const [x, y, ch] of deco) if (g[y]) g[y][x] = ch;
  const warps = [];
  const gates = [];
  const open = (side, ex) => {
    const pts = side === 'w' ? [[0, 12], [1, 12], [0, 13], [1, 13]] : side === 'e' ? [[W - 1, 12], [W - 2, 12], [W - 1, 13], [W - 2, 13]]
      : side === 'n' ? [[20, 0], [21, 0], [20, 1], [21, 1]] : [[15, H - 1], [16, H - 1], [15, H - 2], [16, H - 2]];
    for (const [x, y] of pts) g[y][x] = '=';
    if (side === 'n') rect(g, 20, 2, 2, 10, '=');
    if (side === 's') rect(g, 15, 20, 2, 2, '=');
    const edge = side === 'w' ? [[0, 12], [0, 13]] : side === 'e' ? [[W - 1, 12], [W - 1, 13]] : side === 'n' ? [[20, 0], [21, 0]] : [[15, H - 1], [16, H - 1]];
    edge.forEach(([x, y], i) => warps.push({ x, y, to: ex.to, tx: ex.tx + (side === 'n' || side === 's' ? i : 0), ty: ex.ty + (side === 'w' || side === 'e' ? i : 0), dir: ex.dir }));
    if (ex.gate) {
      const tr = side === 'w' ? { x: 2, y: 12, w: 1, h: 2 } : side === 'e' ? { x: W - 3, y: 12, w: 1, h: 2 } : side === 'n' ? { x: 20, y: 2, w: 2, h: 1 } : { x: 15, y: H - 3, w: 2, h: 1 };
      gates.push({ ...tr, id: 'gate', need: ex.gate, who: ex.who || 'Kapuőr', text: ex.text, back: { w: 'right', e: 'left', n: 'down', s: 'up' }[side] });
    }
  };
  for (const [side, ex] of Object.entries(exits)) open(side, ex);
  const K = KIT[biome];
  const npcList = [
    { id: key + '_apolo', sprite: 'apolo', x: 8, y: 14, dir: 'down', wander: 1, talk: [`Üdv ${greet}! A gyógyítóállomás balra fent van.`] },
    ...npcs,
  ];
  return {
    name, biome, tiles: g,
    buildings: [
      { key: K.heal, interior: 'heal', x: 3, y: 9, action: 'heal', name: name + ' – gyógyítóállomás' },
      { key: gym, interior: 'gym_' + key, x: 12, y: 9, action: 'gym', name: name + ' – Gym' },
      { key: K.shop, interior: 'shop', x: 24, y: 9, doorDx: 0, action: 'shop', name: name + ' – bolt' },
      { key: K.house, interior: 'house', x: 4, y: 17, action: 'house', name: 'Lakóház' },
      { key: K.house, interior: 'house2', x: 23, y: 17, action: 'house2', name: 'Lakóház' },
    ],
    props: [], signs: [{ x: 18, y: 14, text: name.toUpperCase() + `\nGym-vezető: ${TRAINERS2[leader].name.split(',')[0]}` }, ...signs],
    npcs: npcList, warps, triggers: gates, hidden, encounters: null, roamers: [],
  };
}

/** Vízszintes út (44×18): nyugat → kelet, kanyargó ösvény, magas fű, tavacska, két edző. */
function routeH({ name, biome, from, to, trainers, enc, roamers = [], deco = [], hidden = [], requires }) {
  const W = 44, H = 18, g = grid(W, H); border(g, 2, 'T');
  rect(g, 0, 8, 12, 2, '='); rect(g, 10, 4, 2, 6, '='); rect(g, 10, 4, 14, 2, '='); rect(g, 22, 4, 2, 9, '=');
  rect(g, 22, 11, 12, 2, '='); rect(g, 32, 7, 2, 6, '='); rect(g, 32, 7, 12, 2, '=');
  rect(g, 3, 3, 6, 4, '"'); rect(g, 13, 7, 7, 7, '"'); rect(g, 25, 5, 6, 5, '"'); rect(g, 36, 10, 6, 5, '"'); rect(g, 3, 11, 5, 4, '"');
  rect(g, 26, 14, 6, 2, '~'); rect(g, 14, 2, 4, 1, '~');
  for (const [x, y, ch] of deco) if (g[y]) g[y][x] = ch;
  return {
    name, biome, requires, tiles: g, buildings: [], props: [],
    signs: [{ x: 3, y: 7, text: `${name.toUpperCase()}\nNyugat: ${from.label} ←   Kelet: ${to.label} →` }],
    npcs: trainers.map(([id, x, y, dir]) => ({ id: 'n_' + id, sprite: TRAINERS2[id].sprite, x, y, dir, wander: 0, trainer: id })),
    warps: [
      { x: 0, y: 8, to: from.map, tx: from.tx, ty: from.ty, dir: 'left' }, { x: 0, y: 9, to: from.map, tx: from.tx, ty: from.ty + 1, dir: 'left' },
      { x: W - 1, y: 7, to: to.map, tx: to.tx, ty: to.ty, dir: 'right' }, { x: W - 1, y: 8, to: to.map, tx: to.tx, ty: to.ty + 1, dir: 'right' },
    ],
    triggers: [], hidden, roamers, encounters: enc,
  };
}
/** Függőleges út (22×44): dél → észak. */
function routeV({ name, biome, from, to, trainers, enc, roamers = [], deco = [], hidden = [], requires }) {
  const W = 22, H = 44, g = grid(W, H); border(g, 2, 'T');
  rect(g, 10, 34, 2, 10, '='); rect(g, 4, 34, 8, 2, '='); rect(g, 4, 22, 2, 14, '='); rect(g, 4, 22, 12, 2, '=');
  rect(g, 14, 10, 2, 14, '='); rect(g, 10, 10, 6, 2, '='); rect(g, 10, 0, 2, 12, '=');
  rect(g, 13, 26, 6, 6, '"'); rect(g, 6, 13, 6, 7, '"'); rect(g, 3, 3, 6, 5, '"'); rect(g, 15, 3, 4, 5, '"'); rect(g, 13, 37, 5, 4, '"');
  rect(g, 2, 27, 1, 5, '~'); rect(g, 16, 13, 3, 5, '~');
  for (const [x, y, ch] of deco) if (g[y]) g[y][x] = ch;
  return {
    name, biome, requires, tiles: g, buildings: [], props: [],
    signs: [{ x: 12, y: 40, text: `${name.toUpperCase()}\nDél: ${from.label} ↓   Észak: ${to.label} ↑` }],
    npcs: trainers.map(([id, x, y, dir]) => ({ id: 'n_' + id, sprite: TRAINERS2[id].sprite, x, y, dir, wander: 0, trainer: id })),
    warps: [
      { x: 10, y: H - 1, to: from.map, tx: from.tx, ty: from.ty, dir: 'down' }, { x: 11, y: H - 1, to: from.map, tx: from.tx + 1, ty: from.ty, dir: 'down' },
      { x: 10, y: 0, to: to.map, tx: to.tx, ty: to.ty, dir: 'up' }, { x: 11, y: 0, to: to.map, tx: to.tx + 1, ty: to.ty, dir: 'up' },
    ],
    triggers: [], hidden, roamers, encounters: enc,
  };
}

// ---------- gym-belsők ----------
function room(rows) { return rows.map(r => r.split('')); }
function gymRoom(key, name, leader, floor = 'fu_g_floorpaw') {
  return {
    name, interior: true,
    theme: { floor: 'wood1', wall: 'hwall', win: 'hwall', pic: 'hwall', tiles: { '.': 'fu_g_floorwood', o: floor, e: 'fu_g_edge' } },
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
      { k: 'leaderpodium', x: 5, y: 1, w: 3, solid: false },
      { k: 'torch', x: 3, y: 1 }, { k: 'torch', x: 9, y: 1 },
      { k: 'pillar', x: 1, y: 4 }, { k: 'pillar', x: 11, y: 4 }, { k: 'pillar', x: 1, y: 8 }, { k: 'pillar', x: 11, y: 8 },
      { k: 'trophy', x: 12, y: 1, act: `${name} trófeája. Aki legyőzi a vezetőt, megkapja a jelvényt!` },
    ],
    signs: [], props: [], buildings: [], hidden: [], triggers: [], encounters: null,
    npcs: [
      { id: 'ldr_' + leader, sprite: TRAINERS2[leader].sprite, x: 6, y: 2, dir: 'down', wander: 0, trainer: leader },
      { id: 'gymor_' + key, sprite: 'edzo1', x: 4, y: 9, dir: 'right', wander: 0, talk: [`Gym-őr: Üdv a ${name}ben!`, `A vezető, ${TRAINERS2[leader].name.split(',')[0]}, ${TYPE_HINT[leader]}`] },
    ],
    warps: [{ x: 6, y: 11, to: 'mancsfalva', tx: 0, ty: 0, dir: 'down', back: true }, { x: 7, y: 11, to: 'mancsfalva', tx: 0, ty: 0, dir: 'down', back: true }].slice(0, 1),
  };
}
const TYPE_HINT = {
  bodza: 'Semleges Mexikkel harcol. Nincs különösebb gyengéjük – az erő számít!',
  lotti: 'Víz Mexikkel harcol. Villám és Növény támadásokkal jól jársz.',
  volt: 'Villám Mexikkel harcol. A Föld Mexik szinte meg sem érzik az áramot.',
  kaori: 'Árnyék Mexikkel harcol. A Fény a legjobb ellenszer.',
  frida: 'Jég Mexikkel harcol. Tűzzel olvaszd meg őket!',
  pal: 'Tűz Mexikkel harcol. Víz és Föld Mexikkel győzhetsz.',
  luna: 'Fény Mexikkel harcol. Az Árnyék Mexik bírják a legjobban.',
};

// ---------- vad Mexik ----------
const E = (day, night, levels, zones = []) => ({ default: { day, night, levels }, zones });

export const MAPS2 = {
  // 1. út: Holdtisztás (erdő) → Nádas – mocsár
  ut_nadas: routeH({
    name: 'Nádas-mocsár', biome: 'swamp', requires: { trainer: 'bodza', text: 'előbb győzd le Bodzát (Mancsfalva Gym)' },
    from: { map: 'erdo', tx: 32, ty: 11, label: 'Holdtisztás' }, to: { map: 'nadas', tx: 1, ty: 12, label: 'Nádas' },
    trainers: [['u1_peti', 16, 6, 'up'], ['u1_zsofi', 30, 13, 'up']],
    deco: [[6, 13, 'X'], [19, 3, 'Y'], [29, 9, 'Z'], [38, 4, 'Q'], [9, 12, 'U'], [24, 14, 'J'], [33, 15, 'R'], [20, 15, 'm'], [21, 15, 's'], [40, 13, 'l']],
    hidden: [{ id: 'u1_a', x: 5, y: 14, item: 'profi_labda', qty: 2 }, { id: 'u1_b', x: 40, y: 3, item: 'nagy_ital', qty: 1 }],
    roamers: [{ species: 'beka', area: [14, 8, 5, 4], level: [13, 15] }, { species: 'gomba', area: [26, 6, 4, 3], level: [14, 16] }],
    enc: E([['beka', 22], ['kacsa', 18], ['gomba', 14], ['virag', 12], ['mehecske', 10], ['kaloz', 10], ['viharkacsa', 6], ['rozsakert', 4], ['gombakiraly', 4]],
      [['gomba', 20], ['beka', 18], ['szellem', 14], ['kaloz', 12], ['kacsa', 12], ['vampir', 10], ['viharkacsa', 8], ['gombakiraly', 6]], [13, 16]),
  }),
  nadas: town({
    key: 'nadas', name: 'Nádas', greet: 'Nádason', biome: 'swamp', gym: 'gym_nadas', leader: 'lotti',
    exits: { w: { to: 'ut_nadas', tx: 42, ty: 7, dir: 'left' }, e: { to: 'ut_neon', tx: 1, ty: 8, dir: 'right', gate: 'lotti', who: 'Hídőr', text: ['Állj! A Neon-sztráda veszélyes.', 'Csak az mehet tovább, akinek megvan a Cseppmancs-jelvény. Győzd le Lottit a gymben!'] } },
    deco: [[3, 15, '~'], [4, 15, '~'], [3, 16, '~'], [4, 16, '~'], [9, 15, 'X'], [27, 15, 'Y'], [21, 21, 'Z'], [10, 21, 'Q'], [12, 15, 'J'], [28, 21, 'U'], [20, 15, 'k']],
    npcs: [{ id: 'nd_bacsi', sprite: 'bacsi', x: 20, y: 14, dir: 'left', wander: 1, talk: ['Nádason a házak is lábakon állnak, nehogy elvigye őket a víz.', 'Lotti a gymben Víz Mexikkel harcol. Villám vagy Növény támadás kell ellene!'] }],
    hidden: [{ id: 'nd_a', x: 28, y: 20, item: 'arany_labda', qty: 1 }],
  }),
  // 2. út: Nádas → Neonváros
  ut_neon: routeH({
    name: 'Neon-sztráda', biome: 'neon', requires: { trainer: 'lotti', text: 'előbb győzd le Lottit (Nádas Gym)' },
    from: { map: 'nadas', tx: 30, ty: 12, label: 'Nádas' }, to: { map: 'neonvaros', tx: 1, ty: 12, label: 'Neonváros' },
    trainers: [['u2_robi', 16, 6, 'up'], ['u2_nina', 30, 13, 'up']],
    deco: [[6, 13, 'X'], [19, 3, 'Y'], [29, 9, 'Z'], [38, 4, 'Q'], [9, 12, 'U'], [24, 13, 'N'], [20, 15, 'o'], [40, 13, 'M'], [8, 8, 'z'], [9, 8, 'z']],
    hidden: [{ id: 'u2_a', x: 4, y: 14, item: 'profi_labda', qty: 3 }, { id: 'u2_b', x: 41, y: 3, item: 'ebreszto', qty: 2 }],
    roamers: [{ species: 'szikra', area: [14, 8, 5, 4], level: [19, 21] }, { species: 'kiber', area: [26, 6, 4, 3], level: [20, 22] }],
    enc: E([['szikra', 20], ['kiber', 18], ['rocker', 16], ['lovag', 12], ['urhajos', 10], ['kiborg', 8], ['viharfarkas', 6], ['rocksztar', 5], ['pancellovag', 5]],
      [['urhajos', 20], ['rocker', 18], ['szikra', 14], ['kiber', 12], ['vampir', 10], ['csillagjaro', 8], ['kiborg', 8], ['rocksztar', 6]], [19, 23]),
  }),
  neonvaros: town({
    key: 'neonvaros', name: 'Neonváros', greet: 'Neonvárosban', biome: 'neon', gym: 'gym_neon', leader: 'volt',
    exits: { w: { to: 'ut_neon', tx: 42, ty: 7, dir: 'left' }, n: { to: 'ut_sakura', tx: 10, ty: 42, dir: 'up', gate: 'volt', who: 'Biztonsági robot', text: ['BIP! Hozzáférés megtagadva.', 'A Sakura-ösvényre csak Villámmancs-jelvénnyel léphetsz. Győzd le Voltot a gymben!'] } },
    deco: [[9, 15, 'X'], [22, 15, 'X'], [27, 15, 'Q'], [21, 21, 'Z'], [10, 21, 'Y'], [12, 15, 'R'], [28, 21, 'N'], [3, 15, '~'], [4, 15, '~'], [3, 16, '~'], [4, 16, '~'], [13, 12, 'z'], [14, 12, 'z'], [13, 13, 'z'], [14, 13, 'z']],
    npcs: [{ id: 'nv_kisfiu', sprite: 'kisfiu', x: 20, y: 14, dir: 'left', wander: 2, talk: ['Neonvárosban sosem sötét – minden világít!', 'Volt a gymben Villám Mexikkel harcol. Föld Mexivel könnyebb dolgod lesz!'] }],
    hidden: [{ id: 'nv_a', x: 28, y: 20, item: 'nagy_ital', qty: 2 }],
  }),
  // 3. út: Neonváros → Sakura-liget
  ut_sakura: routeV({
    name: 'Sakura-ösvény', biome: 'shrine', requires: { trainer: 'volt', text: 'előbb győzd le Voltot (Neonváros Gym)' },
    from: { map: 'neonvaros', tx: 20, ty: 1, label: 'Neonváros' }, to: { map: 'sakura', tx: 15, ty: 22, label: 'Sakura-liget' },
    trainers: [['u3_hiro', 7, 25, 'left'], ['u3_yuki', 13, 8, 'down']],
    deco: [[3, 38, 'Z'], [17, 33, 'Q'], [8, 30, 'R'], [16, 21, 'U'], [3, 10, 'M'], [18, 9, 'X'], [12, 30, 'p'], [12, 31, 'p'], [8, 37, 'o'], [9, 37, 'o']],
    hidden: [{ id: 'u3_a', x: 3, y: 18, item: 'arany_labda', qty: 1 }, { id: 'u3_b', x: 18, y: 38, item: 'nagy_ital', qty: 2 }],
    roamers: [{ species: 'nindzsa', area: [6, 14, 5, 5], level: [25, 27] }, { species: 'virag', area: [13, 27, 5, 4], level: [25, 27] }],
    enc: E([['nindzsa', 18], ['virag', 16], ['rozsakert', 12], ['lovag', 12], ['magus', 10], ['angyal', 10], ['gomba', 10], ['pancellovag', 6], ['fomagus', 3]],
      [['szellem', 22], ['vampir', 18], ['nindzsa', 16], ['kisertet', 12], ['magus', 10], ['vampirgrof', 8], ['gombakiraly', 6], ['fomagus', 4]], [25, 29]),
  }),
  sakura: town({
    key: 'sakura', name: 'Sakura-liget', greet: 'Sakura-ligetben', biome: 'shrine', gym: 'gym_sakura', leader: 'kaori',
    exits: { s: { to: 'ut_sakura', tx: 10, ty: 1, dir: 'down' }, n: { to: 'ut_jeg', tx: 10, ty: 42, dir: 'up', gate: 'kaori', who: 'Szerzetes', text: ['Megállj, vándor! A Fagyos hágó csak a méltókat engedi át.', 'Szerezd meg a Szellemmancs-jelvényt Kaori szenszeitől!'] } },
    deco: [[9, 15, 'Z'], [22, 15, 'Z'], [27, 15, 'X'], [21, 21, 'Q'], [10, 21, 'R'], [12, 15, 'Y'], [28, 21, 'M'], [3, 15, '~'], [4, 15, '~'], [3, 16, '~'], [4, 16, '~'], [26, 13, 'U'], [6, 21, 'p'], [24, 21, 'p']],
    npcs: [{ id: 'sk_anya', sprite: 'anya', x: 20, y: 14, dir: 'left', wander: 1, talk: ['Tavasszal az egész liget rózsaszín a cseresznyevirágtól.', 'Kaori szenszei Árnyék Mexikkel harcol. Fény Mexi kell ellene!'] }],
    hidden: [{ id: 'sk_a', x: 28, y: 20, item: 'csodabalzsam', qty: 1 }],
    groundCh: 'g',
  }),
  // 4. út: Sakura-liget → Jégvár (havas hágó)
  ut_jeg: routeV({
    name: 'Fagyos hágó', biome: 'snow', requires: { trainer: 'kaori', text: 'előbb győzd le Kaorit (Sakura-liget Gym)' },
    from: { map: 'sakura', tx: 20, ty: 1, label: 'Sakura-liget' }, to: { map: 'jegvar', tx: 15, ty: 22, label: 'Jégvár' },
    trainers: [['u4_bela', 7, 25, 'left'], ['u4_emma', 13, 8, 'down']],
    deco: [[8, 30, 'r'], [17, 33, 'r'], [3, 10, 'i'], [4, 10, 'i'], [18, 21, 'i'], [7, 37, 'i'], [8, 37, 'i']],
    hidden: [{ id: 'u4_a', x: 3, y: 18, item: 'arany_labda', qty: 1 }, { id: 'u4_b', x: 18, y: 38, item: 'nagy_ital', qty: 2 }],
    roamers: [{ species: 'jeg', area: [6, 14, 5, 5], level: [30, 32] }, { species: 'kristaly', area: [13, 27, 5, 4], level: [30, 32] }],
    enc: E([['jeg', 24], ['kristaly', 18], ['banyasz', 14], ['alap', 10], ['kacsa', 10], ['gleccser', 8], ['kofalo', 8], ['gyemant', 4], ['bajnok', 4]],
      [['jeg', 22], ['szellem', 16], ['kristaly', 16], ['kisertet', 12], ['gleccser', 10], ['banyasz', 10], ['gyemant', 6], ['vampirgrof', 4], ['fomagus', 4]], [30, 34]),
  }),
  jegvar: town({
    key: 'jegvar', name: 'Jégvár', greet: 'Jégváron', biome: 'snow', gym: 'gym_jeg', leader: 'frida',
    exits: { s: { to: 'ut_jeg', tx: 10, ty: 1, dir: 'down' }, e: { to: 'ut_sarkany', tx: 1, ty: 8, dir: 'right', gate: 'frida', who: 'Hegyi vezető', text: ['A Hamu-út izzó lávamezőkön át vezet.', 'Csak Hópehely-jelvénnyel kísérlek át. Győzd le Fridát a gymben!'] } },
    deco: [[9, 15, 'r'], [22, 15, 'r'], [3, 15, 'i'], [4, 15, 'i'], [3, 16, 'i'], [4, 16, 'i'], [27, 15, 'b'], [10, 21, 'b']],
    npcs: [{ id: 'jv_bacsi', sprite: 'bacsi', x: 20, y: 14, dir: 'left', wander: 1, talk: ['Brrr! Jégváron egész évben hó esik.', 'Frida a gymben Jég Mexikkel harcol. Hozz Tűz Mexit!'] }],
    hidden: [{ id: 'jv_a', x: 28, y: 20, item: 'nagy_ital', qty: 2 }],
  }),
  // 5. út: Jégvár → Sárkányhegy (vulkán)
  ut_sarkany: routeH({
    name: 'Hamu-út', biome: 'volcano', requires: { trainer: 'frida', text: 'előbb győzd le Fridát (Jégvár Gym)' },
    from: { map: 'jegvar', tx: 30, ty: 12, label: 'Jégvár' }, to: { map: 'sarkanyhegy', tx: 1, ty: 12, label: 'Sárkányhegy' },
    trainers: [['u5_marci', 16, 6, 'up'], ['u5_dora', 30, 13, 'up']],
    deco: [[6, 13, 'X'], [19, 3, 'Y'], [29, 9, 'Z'], [38, 4, 'R'], [9, 12, 'f'], [24, 14, 'G'], [33, 15, 'X'], [20, 15, 'a'], [21, 15, 's'], [40, 13, 'a']],
    hidden: [{ id: 'u5_a', x: 5, y: 14, item: 'arany_labda', qty: 2 }, { id: 'u5_b', x: 40, y: 3, item: 'csodabalzsam', qty: 1 }],
    roamers: [{ species: 'vulkan', area: [14, 8, 5, 4], level: [35, 37] }, { species: 'lang', area: [26, 6, 4, 3], level: [35, 37] }],
    enc: E([['vulkan', 20], ['lang', 18], ['banyasz', 14], ['kofalo', 12], ['langvezer', 10], ['lavakiraly', 8], ['mesterszakacs', 8], ['gyemant', 5], ['bajnok', 5]],
      [['vulkan', 18], ['lang', 16], ['szellem', 14], ['langvezer', 12], ['kofalo', 12], ['lavakiraly', 10], ['vampirgrof', 10], ['arnyekmester', 8]], [35, 39]),
  }),
  sarkanyhegy: town({
    key: 'sarkanyhegy', name: 'Sárkányhegy', greet: 'Sárkányhegyen', biome: 'volcano', gym: 'gym_sarkany', leader: 'pal',
    exits: { w: { to: 'ut_sarkany', tx: 42, ty: 7, dir: 'left' }, n: { to: 'holdmancs', tx: 11, ty: 18, dir: 'up', gate: 'pal', who: 'Aréna-őr', text: ['A Holdmancs-aréna csak a hat jelvény birtokosainak nyílik meg.', 'Előbb győzd le Parázs Pált a gymben!'] } },
    deco: [[9, 15, 'X'], [22, 15, 'Z'], [27, 15, 'Y'], [21, 21, 'R'], [10, 21, 'X'], [12, 15, 'f'], [28, 21, 'Z'], [3, 15, '~'], [4, 15, '~'], [3, 16, '~'], [4, 16, '~'], [13, 12, 'G'], [14, 12, 'G']],
    npcs: [{ id: 'sh_gyujto', sprite: 'gyujto', x: 20, y: 14, dir: 'left', wander: 1, talk: ['A hegy gyomrában régen sárkányok éltek, mondják...', 'Pál mester a gymben Tűz Mexikkel harcol. Víz vagy Föld kell ellene!'] }],
    hidden: [{ id: 'sh_a', x: 28, y: 20, item: 'arany_labda', qty: 2 }],
  }),
  // Holdmancs-aréna (a bajnok)
  holdmancs: (() => {
    const W = 24, H = 20, g = grid(W, H, 'c'); border(g, 2, 'T');
    rect(g, 11, 10, 2, 10, '='); rect(g, 4, 3, 2, 2, 'f'); rect(g, 18, 3, 2, 2, 'w');
    return {
      name: 'Holdmancs-aréna', biome: 'shrine', requires: { trainer: 'pal', text: 'előbb győzd le Parázs Pált (Sárkányhegy Gym)' },
      tiles: g.map(r => r.map(c => (c === 'c' ? 'o' : c === 'f' ? 'p' : c === 'w' ? 'g' : c))),
      buildings: [{ key: 'arena', interior: 'gym_holdmancs', x: 9, y: 9, action: 'gym', name: 'Holdmancs-aréna' }],
      props: [], signs: [{ x: 14, y: 15, text: 'HOLDMANCS-ARÉNA\nCsak a hat jelvény birtokosai léphetnek be. Bent Luna, a bajnok vár.' }],
      npcs: [{ id: 'hm_apolo', sprite: 'apolo', x: 9, y: 14, dir: 'right', wander: 0, talk: 'heal' }],
      warps: [{ x: 11, y: H - 1, to: 'sarkanyhegy', tx: 20, ty: 1, dir: 'down' }, { x: 12, y: H - 1, to: 'sarkanyhegy', tx: 21, ty: 1, dir: 'down' }],
      triggers: [], hidden: [], roamers: [], encounters: null,
    };
  })(),
  // gym-belsők
  gym_mancs: gymRoom('mancs', 'Mancsfalva Gym', 'bodza'),
  gym_nadas: gymRoom('nadas', 'Nádas Gym', 'lotti'),
  gym_neonvaros: gymRoom('neonvaros', 'Neonváros Gym', 'volt'),
  gym_sakura: gymRoom('sakura', 'Sakura-liget Gym', 'kaori'),
  gym_jegvar: gymRoom('jegvar', 'Jégvár Gym', 'frida'),
  gym_sarkanyhegy: gymRoom('sarkanyhegy', 'Sárkányhegy Gym', 'pal'),
  gym_holdmancs: gymRoom('holdmancs', 'Holdmancs-aréna', 'luna'),
};
// a belső térképek „int_” előtaggal élnek a játékban
for (const k of Object.keys(MAPS2)) if (k.startsWith('gym_')) { MAPS2['int_' + k] = MAPS2[k]; delete MAPS2[k]; }

/** A gym-vezetők sorrendje (célkijelzőhöz, jelvényekhez). */
export const LEADER_ORDER = ['bodza', 'lotti', 'volt', 'kaori', 'frida', 'pal', 'luna'];
