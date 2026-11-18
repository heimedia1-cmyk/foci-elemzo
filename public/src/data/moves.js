// MoveRegistry – minden támadás adata.
// cat: 'fiz' (fizikai), 'spec' (speciális), 'stat' (státusz)
// effect: { status, chance } | { stat, stages, target:'self'|'foe' } | { heal } | { highCrit } | { priority }
export const MOVES = {
  harapas:      { name: 'Harapás',        type: 'semleges', cat: 'fiz',  power: 40, acc: 100, pp: 35, desc: 'Egy jó erős harapás.' },
  gyorsmancs:   { name: 'Gyors Mancs',    type: 'semleges', cat: 'fiz',  power: 40, acc: 100, pp: 30, priority: 1, desc: 'Mindig elsőként csap le.' },
  rohamugras:   { name: 'Rohamugrás',     type: 'semleges', cat: 'fiz',  power: 65, acc: 95,  pp: 20, desc: 'Nekiugrik az ellenfélnek.' },
  ugatas:       { name: 'Ugatás',         type: 'semleges', cat: 'stat', power: 0,  acc: 100, pp: 30, effect: { stat: 'atk', stages: -1, target: 'foe' }, desc: 'Csökkenti az ellenfél támadását.' },
  farokcsovalas:{ name: 'Farokcsóválás',  type: 'semleges', cat: 'stat', power: 0,  acc: 100, pp: 30, effect: { stat: 'def', stages: -1, target: 'foe' }, desc: 'Csökkenti az ellenfél védekezését.' },
  kutyanez:     { name: 'Kutyanéz',       type: 'semleges', cat: 'stat', power: 0,  acc: 100, pp: 20, effect: { stat: 'atk', stages: 1, target: 'self' }, desc: 'Bociszemek: növeli a saját támadást.' },

  parazs:       { name: 'Parázs',         type: 'tuz', cat: 'spec', power: 40, acc: 100, pp: 25, effect: { status: 'eges', chance: 10 }, desc: 'Kis tűzcsóva, megégethet.' },
  langmancs:    { name: 'Lángmancs',      type: 'tuz', cat: 'fiz',  power: 65, acc: 100, pp: 15, effect: { status: 'eges', chance: 10 }, desc: 'Lángoló mancsütés.' },
  tuzlehelet:   { name: 'Tűzlehelet',     type: 'tuz', cat: 'spec', power: 85, acc: 90,  pp: 10, effect: { status: 'eges', chance: 10 }, desc: 'Hatalmas lángnyelv.' },

  vizpermet:    { name: 'Vízpermet',      type: 'viz', cat: 'spec', power: 40, acc: 100, pp: 25, desc: 'Vízsugarat lő.' },
  bekaugras:    { name: 'Békaugrás',      type: 'viz', cat: 'fiz',  power: 55, acc: 100, pp: 20, desc: 'Nagyot ugrik és rácsobban.' },
  hullamcsapas: { name: 'Hullámcsapás',   type: 'viz', cat: 'spec', power: 75, acc: 95,  pp: 15, desc: 'Hullámot zúdít az ellenfélre.' },
  nyalkapajzs:  { name: 'Nyálkapajzs',    type: 'viz', cat: 'stat', power: 0,  acc: 100, pp: 20, effect: { stat: 'def', stages: 1, target: 'self' }, desc: 'Növeli a saját védekezést.' },

  fullank:      { name: 'Fullánk',        type: 'noveny', cat: 'fiz',  power: 35, acc: 100, pp: 30, effect: { status: 'mereg', chance: 30 }, desc: 'Megszúrja, megmérgezheti.' },
  viragpor:     { name: 'Virágpor',       type: 'noveny', cat: 'stat', power: 0,  acc: 75,  pp: 15, effect: { status: 'alvas', chance: 100 }, desc: 'Elaltatja az ellenfelet.' },
  levelvihar:   { name: 'Levélvihar',     type: 'noveny', cat: 'spec', power: 60, acc: 100, pp: 20, desc: 'Éles levelek forgószele.' },
  mez:          { name: 'Mézcsepp',       type: 'noveny', cat: 'stat', power: 0,  acc: 100, pp: 10, effect: { heal: 0.5 }, desc: 'Visszaad a HP feléből.' },

  szikra:       { name: 'Szikra',         type: 'villam', cat: 'spec', power: 40, acc: 100, pp: 30, effect: { status: 'benitas', chance: 10 }, desc: 'Megrázza, megbéníthatja.' },
  villamcsapas: { name: 'Villámcsapás',   type: 'villam', cat: 'spec', power: 80, acc: 95,  pp: 15, effect: { status: 'benitas', chance: 10 }, desc: 'Villám csap le.' },

  csakany:      { name: 'Csákánycsapás',  type: 'fold', cat: 'fiz',  power: 55, acc: 100, pp: 25, desc: 'Lecsap a csákánnyal.' },
  kozapor:      { name: 'Kőzápor',        type: 'fold', cat: 'fiz',  power: 75, acc: 90,  pp: 10, desc: 'Köveket zúdít.' },
  sziklapajzs:  { name: 'Sziklapajzs',    type: 'fold', cat: 'stat', power: 0,  acc: 100, pp: 20, effect: { stat: 'def', stages: 2, target: 'self' }, desc: 'Nagyon növeli a védekezést.' },

  jegszilank:   { name: 'Jégszilánk',     type: 'jeg', cat: 'spec', power: 40, acc: 100, pp: 25, effect: { status: 'fagyas', chance: 10 }, desc: 'Jégszilánkot lő, lefagyaszthat.' },
  fagyoslehelet:{ name: 'Fagyos Lehelet', type: 'jeg', cat: 'spec', power: 65, acc: 100, pp: 15, effect: { stat: 'spe', stages: -1, target: 'foe', chance: 50 }, desc: 'Lelassíthatja az ellenfelet.' },

  arnyekkarom:  { name: 'Árnyékkarom',    type: 'arnyek', cat: 'fiz',  power: 50, acc: 100, pp: 25, effect: { highCrit: true }, desc: 'Gyakran kritikus találat.' },
  fustbomba:    { name: 'Füstbomba',      type: 'arnyek', cat: 'stat', power: 0,  acc: 100, pp: 20, effect: { stat: 'spe', stages: 1, target: 'self' }, desc: 'Növeli a saját sebességet.' },
  remkep:       { name: 'Rémkép',         type: 'arnyek', cat: 'spec', power: 55, acc: 100, pp: 20, effect: { status: 'alvas', chance: 10 }, desc: 'Ijesztő látomás.' },
  nindzsavagas: { name: 'Nindzsavágás',   type: 'arnyek', cat: 'fiz',  power: 75, acc: 95,  pp: 15, effect: { highCrit: true }, desc: 'Villámgyors kardvágás.' },

  fenysugar:    { name: 'Fénysugár',      type: 'feny', cat: 'spec', power: 50, acc: 100, pp: 25, desc: 'Ragyogó fénynyaláb.' },
  gyogyitofeny: { name: 'Gyógyító Fény',  type: 'feny', cat: 'stat', power: 0,  acc: 100, pp: 10, effect: { heal: 0.5 }, desc: 'Visszaad a HP feléből.' },
  csillagpor:   { name: 'Csillagpor',     type: 'feny', cat: 'spec', power: 70, acc: 95,  pp: 15, desc: 'Csillagzáport idéz.' },

  lezer:        { name: 'Lézer',          type: 'gep', cat: 'spec', power: 55, acc: 100, pp: 20, desc: 'Precíz lézersugár.' },
  fogaskerek:   { name: 'Fogaskerék',     type: 'gep', cat: 'fiz',  power: 50, acc: 100, pp: 25, desc: 'Pörgő fogaskereket dob.' },

  // --- erős, későbbi támadások (20+ szint) ---
  oriasharapas: { name: 'Óriás Harapás',  type: 'semleges', cat: 'fiz', power: 80, acc: 100, pp: 15, desc: 'Teljes erővel belemar.' },
  vadroham:     { name: 'Vad Roham',      type: 'semleges', cat: 'fiz', power: 100, acc: 90, pp: 10, desc: 'Mindent beleadó, vad ugrás.' },
  pokoltuz:     { name: 'Pokoltűz',       type: 'tuz', cat: 'spec', power: 110, acc: 85, pp: 5, effect: { status: 'eges', chance: 30 }, desc: 'Perzselő lángtenger, gyakran megéget.' },
  aradat:       { name: 'Áradat',         type: 'viz', cat: 'spec', power: 105, acc: 90, pp: 5, desc: 'Hatalmas vízfal zúdul az ellenfélre.' },
  tovisostor:   { name: 'Tövisostor',     type: 'noveny', cat: 'fiz', power: 80, acc: 100, pp: 15, desc: 'Tüskés indával csap le.' },
  tuskeerdo:    { name: 'Tüskeerdő',      type: 'noveny', cat: 'spec', power: 100, acc: 90, pp: 5, desc: 'Tüskés növények törnek elő a földből.' },
  viharcsapas:  { name: 'Viharcsapás',    type: 'villam', cat: 'spec', power: 110, acc: 80, pp: 5, effect: { status: 'benitas', chance: 30 }, desc: 'Egész vihar sújt le, megbéníthat.' },
  foldindulas:  { name: 'Földindulás',    type: 'fold', cat: 'fiz', power: 100, acc: 100, pp: 10, desc: 'Megremeg és megindul a föld.' },
  hofuvas:      { name: 'Hófúvás',        type: 'jeg', cat: 'spec', power: 105, acc: 85, pp: 5, effect: { status: 'fagyas', chance: 10 }, desc: 'Jeges hóvihar, megfagyaszthat.' },
  jegagyar:     { name: 'Jégagyar',       type: 'jeg', cat: 'fiz', power: 75, acc: 100, pp: 15, effect: { status: 'fagyas', chance: 10 }, desc: 'Jéghideg harapás.' },
  arnyekzuhatag:{ name: 'Árnyékzuhatag',  type: 'arnyek', cat: 'spec', power: 95, acc: 100, pp: 10, desc: 'Sötét energia zúdul alá.' },
  holdsugar:    { name: 'Holdsugár',      type: 'feny', cat: 'spec', power: 95, acc: 100, pp: 10, desc: 'A Hold ezüst fénye.' },
  acelokol:     { name: 'Acélököl',       type: 'gep', cat: 'fiz', power: 80, acc: 100, pp: 15, desc: 'Fémmancs ütés.' },
  plazmaagyu:   { name: 'Plazmaágyú',     type: 'gep', cat: 'spec', power: 110, acc: 90, pp: 5, desc: 'Izzó plazmasugár.' },
  szivosag:     { name: 'Szívósság',      type: 'semleges', cat: 'stat', power: 0, acc: 100, pp: 15, effect: { stat: 'def', stages: 2, target: 'self' }, desc: 'Erősen növeli a saját védekezést.' },

  villamharapas:{ name: 'Villámharapás',  type: 'villam', cat: 'fiz', power: 65, acc: 100, pp: 15, effect: { status: 'benitas', chance: 10 }, desc: 'Elektromos harapás, megbéníthat.' },
  gitarszolo:   { name: 'Gitárszóló',     type: 'villam', cat: 'spec', power: 70, acc: 100, pp: 15, effect: { status: 'benitas', chance: 20 }, desc: 'Fülsiketítő elektromos szóló.' },
  fakanal:      { name: 'Fakanálcsapás',  type: 'semleges', cat: 'fiz', power: 50, acc: 100, pp: 25, desc: 'Egy jól irányzott fakanál.' },
  lakoma:       { name: 'Lakoma',         type: 'semleges', cat: 'stat', power: 0, acc: 100, pp: 10, effect: { heal: 0.5 }, desc: 'Eszik egy jót: visszaad a HP feléből.' },
  kardvagas:    { name: 'Kardvágás',      type: 'gep', cat: 'fiz', power: 70, acc: 100, pp: 15, effect: { highCrit: true }, desc: 'Éles kardcsapás, gyakran kritikus.' },
  pajzsfal:     { name: 'Pajzsfal',       type: 'gep', cat: 'stat', power: 0, acc: 100, pp: 20, effect: { stat: 'def', stages: 2, target: 'self' }, desc: 'Pajzs mögé bújik: erősen nő a védekezés.' },
  deneverraj:   { name: 'Denevérraj',     type: 'arnyek', cat: 'spec', power: 65, acc: 100, pp: 15, desc: 'Denevérek csapata ront az ellenfélre.' },
  sporafelho:   { name: 'Spórafelhő',     type: 'noveny', cat: 'stat', power: 0, acc: 85, pp: 15, effect: { status: 'mereg', chance: 100 }, desc: 'Mérgező spórák: megmérgezi az ellenfelet.' },
  kristalytuske:{ name: 'Kristálytüske',  type: 'fold', cat: 'fiz', power: 70, acc: 100, pp: 15, desc: 'Éles kristályokat lő ki.' },
  lavafolyam:   { name: 'Lávafolyam',     type: 'tuz', cat: 'fiz', power: 80, acc: 95, pp: 10, effect: { status: 'eges', chance: 20 }, desc: 'Izzó láva önti el a terepet.' },
  kalozkard:    { name: 'Kalózkard',      type: 'viz', cat: 'fiz', power: 65, acc: 100, pp: 20, effect: { highCrit: true }, desc: 'Sós vízzel edzett kard.' },
  csillagszor:  { name: 'Csillagszór',    type: 'feny', cat: 'spec', power: 40, acc: 100, pp: 25, desc: 'Apró csillagokat szór.' },
  glorialang:   { name: 'Glórialáng',     type: 'tuz', cat: 'spec', power: 120, acc: 85, pp: 5, effect: { status: 'eges', chance: 30 }, desc: 'Szent tűz – a Főnix legendás támadása.' },
  melytengeri:  { name: 'Mélytengeri ár', type: 'viz', cat: 'spec', power: 120, acc: 85, pp: 5, desc: 'Az óceán mélyének ereje – a Tengerúr legendás támadása.' },
  aranyfeny:    { name: 'Aranyfény',      type: 'feny', cat: 'spec', power: 90, acc: 100, pp: 10, desc: 'Vakító arany ragyogás.' },
  tultoltes:    { name: 'Túltöltés',      type: 'gep', cat: 'stat', power: 0,  acc: 100, pp: 20, effect: { stat: 'spa', stages: 2, target: 'self' }, desc: 'Nagyon növeli a spec. támadást.' },
};

export const STATUS = {
  eges:    { name: 'Égés',     short: 'ÉG',  color: '#f0703a' },
  mereg:   { name: 'Mérgezés', short: 'MÉR', color: '#a35ad0' },
  benitas: { name: 'Bénítás',  short: 'BÉN', color: '#e8c830' },
  alvas:   { name: 'Alvás',    short: 'ALV', color: '#8a8aa0' },
  fagyas:  { name: 'Lefagyás', short: 'FAG', color: '#7fd4f0' },
};
