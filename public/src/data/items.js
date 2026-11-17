// Tárgyak. kind: 'ball' | 'heal' | 'cure' | 'revive' | 'evo' | 'misc'
export const ITEMS = {
  sima_labda:  { name: 'Sima Teniszlabda', kind: 'ball', ballMult: 1,   price: 100, desc: 'Alap befogási esély. Olcsó.', color: '#d8f040' },
  profi_labda: { name: 'Profi Teniszlabda', kind: 'ball', ballMult: 1.6, price: 300, desc: 'Jobb befogási esély.', color: '#40a0f0' },
  arany_labda: { name: 'Arany Teniszlabda', kind: 'ball', ballMult: 2, rareBonus: 1.5, price: 0, desc: 'Ritka Mexiknél még erősebb.', color: '#f0c030' },
  hos_labda:   { name: 'Hős Teniszlabda', kind: 'ball', ballMult: 4, price: 0, desc: 'Legendás labda. Szinte biztos fogás.', color: '#e84040' },

  kis_ital:    { name: 'Csontital', kind: 'heal', heal: 20, price: 150, desc: '20 HP-t gyógyít.' },
  nagy_ital:   { name: 'Nagy Csontital', kind: 'heal', heal: 60, price: 450, desc: '60 HP-t gyógyít.' },
  ebreszto:    { name: 'Ébresztő Keksz', kind: 'revive', price: 800, desc: 'Felébreszti a harcképtelen Mexit (fél HP).' },
  csodabalzsam:{ name: 'Csodabalzsam', kind: 'cure', cures: 'all', price: 250, desc: 'Minden státuszhatást eltávolít.' },
  egeskenocs:  { name: 'Hűsítő Kenőcs', kind: 'cure', cures: 'eges', price: 100, desc: 'Gyógyítja az égést.' },
  ellenmereg:  { name: 'Ellenméreg', kind: 'cure', cures: 'mereg', price: 100, desc: 'Gyógyítja a mérgezést.' },

  jutalomfalat:{ name: 'Jutalomfalat', kind: 'misc', price: 0, sell: 200, desc: 'Finom keksz. Eladható a boltban.' },
  ritka_szor:  { name: 'Csillogó Szőrcsomó', kind: 'misc', price: 0, sell: 500, desc: 'Ritka fejlődési alapanyag.' },
};

export const SHOP_STOCK = ['sima_labda', 'profi_labda', 'kis_ital', 'nagy_ital', 'egeskenocs', 'ellenmereg', 'csodabalzsam', 'ebreszto'];

// Ikonok (assets/ui)
export const ITEM_ICON = {"sima_labda": "ball_sima", "profi_labda": "ball_profi", "arany_labda": "ball_arany", "hos_labda": "ball_hos", "kis_ital": "kis_ital", "nagy_ital": "nagy_ital", "ebreszto": "ebreszto", "csodabalzsam": "csodabalzsam", "egeskenocs": "egeskenocs", "ellenmereg": "ellenmereg", "jutalomfalat": "ebreszto", "ritka_szor": "ritka_szor"};
export const itemIcon = (id) => `assets/ui/${ITEM_ICON[id] || 'coin'}.png`;
