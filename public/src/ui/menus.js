// Játékmenük: Mexidex, csapat, tároló, táska, bolt, Mexi-adatlap.
import { el, openWindow, choose, dialog, toast, hpBar, UI } from './ui.js';
import { G, save } from '../systems/state.js';
import { MEXIS, RARITY, SPECIES_ORDER, NATURES, STAT_NAMES } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS, SHOP_STOCK } from '../data/items.js';
import { TYPES } from '../data/types.js';
import { CONFIG } from '../data/config.js';
import { displayName, ivPercent, xpForLevel } from '../systems/mexi.js';
import { mexiIconDataURL } from '../art/placeholders.js';
import { getArtURL } from '../art/registerArt.js';

const iconCache = {};
export function iconFor(species, shiny = false) {
  const k = species + (shiny ? '_s' : '');
  return iconCache[k] ??= (getArtURL(species, shiny) || mexiIconDataURL(species, shiny));
}
export const typeBadge = (t) => el('span', { class: 'type', style: `background:${TYPES[t].color}` }, TYPES[t].name);
export function rarityBadge(r) { const R = RARITY[r]; return el('span', { class: 'rar' + (R.color === 'rainbow' ? ' rainbow' : ''), style: R.color === 'rainbow' ? '' : `background:${R.color}` }, R.name); }
const statusBadge = (s) => s ? el('span', { class: 'rar', style: `background:${STATUS[s].color}` }, STATUS[s].short) : null;

function xpBar(m) {
  const a = xpForLevel(m.level), b = xpForLevel(m.level + 1);
  const pct = m.level >= CONFIG.maxLevel ? 100 : Math.round(((m.xp - a) / (b - a)) * 100);
  return el('div', { class: 'xpbar' }, el('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));
}

function mexiRow(m, onClick, extra = null) {
  return el('div', { class: 'row' + (m.hp <= 0 ? ' fainted' : ''), onclick: onClick },
    el('img', { src: iconFor(m.species, m.shiny) }),
    el('div', { class: 'grow' },
      el('div', { style: 'display:flex;justify-content:space-between;font-weight:800;gap:6px' },
        el('span', {}, displayName(m), m.shiny ? ' ✨' : '', ' ', statusBadge(m.status)), el('span', {}, `Szint ${m.level}`)),
      el('div', { style: 'margin:3px 0' }, ...MEXIS[m.species].types.map(typeBadge), ' ', rarityBadge(MEXIS[m.species].rarity)),
      hpBar(m.hp, m.stats.hp), el('div', { style: 'font-size:12px;text-align:right;font-weight:700' }, `${m.hp} / ${m.stats.hp} HP`), xpBar(m)),
    extra);
}

// ===================== FŐMENÜ (Esc) =====================
export function openMainMenu(world) {
  openWindow('Menü', (w) => {
    const s = G.state;
    const b = (label, fn) => el('button', { class: 'btn', onclick: () => { w.close(); fn(); } }, label);
    w.body.append(
      el('div', { style: 'margin-bottom:10px;font-weight:700' }, `${s.player.name} • 💰 ${s.money} • Mexidex: ${Object.keys(s.dex.caught).length}/${SPECIES_ORDER.length} • Elkapva: ${s.stats.caught}`),
      el('div', { class: 'mainmenu' },
        b('📖 Mexidex (J)', () => openDex()),
        b('🐶 Csapat (P)', () => openParty()),
        b('🎒 Táska (I)', () => openBag()),
        b('📦 Mexi-tároló', () => openStorage()),
        b('💾 Mentés', () => { save() ? toast('Játék elmentve!') : toast('Mentés sikertelen'); }),
        b('❓ Irányítás', () => dialog(['WASD / nyilak: mozgás\nE: beszélgetés, interakció\nSpace: szimatolás', 'I: táska • J: Mexidex • P: csapat\nEsc: menü\nMobilon: joystick + A gomb + 🐾 + ☰'])),
        b('🏠 Főmenü', () => world.scene.start('Title')),
      ));
  });
}

// ===================== CSAPAT =====================
/** mode: 'view' | 'pick' – pick esetén Promise<index|-1> */
export function openParty({ mode = 'view', title = 'Csapat', canPick = () => true, forced = false } = {}) {
  return new Promise((resolve) => {
    let result = -1;
    openWindow(title, (w) => {
      const draw = () => w.render((body) => {
        const s = G.state;
        if (!s.party.length) body.append(el('p', {}, 'Még nincs Mexid.'));
        s.party.forEach((m, i) => body.append(mexiRow(m, () => {
          if (mode === 'pick') { if (!canPick(m, i)) { toast('Ezt a Mexit most nem választhatod.'); return; } result = i; w.close(); }
          else openMexiDetail(m, { inParty: true, index: i, onChange: draw });
        })));
        if (mode === 'view' && s.party.length > 1) body.append(el('p', { style: 'font-size:13px;opacity:.75' }, 'Tipp: az adatlapon a „Csapat élére” gombbal választhatod ki, ki harcoljon elsőként.'));
      });
      draw();
    }, { onClose: () => { if (forced && result === -1) { setTimeout(() => openParty({ mode, title, canPick, forced }).then(resolve), 50); return; } resolve(result); } });
  });
}

// ===================== MEXI-ADATLAP =====================
export function openMexiDetail(m, { inParty = false, inStorage = false, index = 0, onChange } = {}) {
  const sp = MEXIS[m.species];
  openWindow(displayName(m), (w) => {
    const draw = () => w.render((body) => {
      const nat = NATURES[m.nature];
      const maxStat = 200;
      body.append(el('div', { class: 'detail' },
        el('div', { class: 'pic' },
          el('img', { src: iconFor(m.species, m.shiny) }),
          el('div', { style: 'font-weight:800;font-size:18px' }, displayName(m), m.shiny ? ' ✨' : ''),
          m.nickname ? el('div', { style: 'font-size:12px' }, sp.name) : null,
          el('div', {}, ...sp.types.map(typeBadge)), el('div', { style: 'margin-top:4px' }, rarityBadge(sp.rarity)),
          el('div', { style: 'margin-top:6px;font-weight:700' }, `Szint ${m.level}`), hpBar(m.hp, m.stats.hp),
          el('div', { style: 'font-size:12px;font-weight:700' }, `${m.hp}/${m.stats.hp} HP`), xpBar(m),
          el('div', { style: 'font-size:11px;margin-top:2px' }, m.level >= CONFIG.maxLevel ? 'Max szint' : `Következő szintig: ${xpForLevel(m.level + 1) - m.xp} XP`)),
        el('div', {},
          el('div', { style: 'font-size:14px;margin-bottom:6px' }, el('b', {}, 'Szerep: '), sp.role, ' • ', el('b', {}, 'Természet: '), nat.name,
            nat.up ? ` (+${STAT_NAMES[nat.up]}, −${STAT_NAMES[nat.down]})` : '', ' • ', el('b', {}, 'Egyedi adottság: '), `${ivPercent(m)}%`),
          el('table', { class: 'stats' }, ...Object.entries(STAT_NAMES).map(([k, n]) => el('tr', {},
            el('td', { style: 'width:130px' }, n), el('td', { style: 'width:44px;font-weight:800' }, m.stats[k]),
            el('td', {}, el('div', { class: 'statbar' }, el('i', { style: `width:${Math.min(100, (m.stats[k] / maxStat) * 100)}%` }))),
            el('td', { style: 'width:52px;font-size:11px' }, `IV ${m.ivs[k]}`)))),
          el('h4', { style: 'margin:10px 0 4px' }, 'Támadások'),
          ...m.moves.map(mv => { const d = MOVES[mv.id]; return el('div', { style: 'display:flex;gap:6px;align-items:center;font-size:14px;margin:2px 0' }, typeBadge(d.type), el('b', {}, d.name), el('span', { style: 'opacity:.75' }, `${d.cat === 'fiz' ? 'Fizikai' : d.cat === 'spec' ? 'Speciális' : 'Státusz'} • Erő ${d.power || '–'} • Pont. ${d.acc}% • PP ${mv.pp}/${d.pp}`)); }),
          sp.evolve ? el('div', { style: 'margin-top:8px;font-size:14px' }, '🌟 Fejlődés: ', el('b', {}, MEXIS[sp.evolve.to].name), ` (${sp.evolve.level}. szinten)`) : null,
          m.caughtWhere ? el('div', { style: 'font-size:12px;margin-top:6px;opacity:.75' }, `Megszerezve: ${m.caughtWhere}, ${new Date(m.caughtAt).toLocaleString('hu-HU')}`) : null,
          el('div', { class: 'actions' },
            el('button', { class: 'btn', onclick: async () => { const n = prompt('Új becenév (üresen: eredeti név):', m.nickname || ''); if (n !== null) { m.nickname = n.trim().slice(0, 14) || null; save(); draw(); onChange?.(); } } }, '✏️ Becenév'),
            inParty && index > 0 ? el('button', { class: 'btn', onclick: () => { const p = G.state.party; p.splice(index, 1); p.unshift(m); index = 0; save(); toast(`${displayName(m)} a csapat élén!`); w.close(); onChange?.(); } }, '⬆️ Csapat élére') : null,
            inParty && G.state.party.length > 1 ? el('button', { class: 'btn', onclick: () => { const p = G.state.party; p.splice(p.indexOf(m), 1); G.state.storage.push(m); save(); toast('Tárolóba került.'); w.close(); onChange?.(); } }, '📦 Tárolóba') : null,
            inStorage ? el('button', { class: 'btn', onclick: () => { if (G.state.party.length >= CONFIG.partySize) { toast('A csapat tele van (6).'); return; } const st = G.state.storage; st.splice(st.indexOf(m), 1); G.state.party.push(m); save(); toast('Csapatba került!'); w.close(); onChange?.(); } }, '➕ Csapatba') : null,
          ))));
    });
    draw();
  });
}

// ===================== MEXIDEX =====================
export function openDex() {
  openWindow('Mexidex', (w) => {
    const f = { q: '', type: '', rarity: '', only: '' };
    const draw = () => w.render((body) => {
      const s = G.state;
      const caughtN = Object.keys(s.dex.caught).length, seenN = Object.keys(s.dex.seen).length;
      const tabs = el('div', { class: 'tabs' },
        el('input', { placeholder: 'Keresés...', value: f.q, oninput: (e) => { f.q = e.target.value; list(); } }),
        sel('type', [['', 'Minden típus'], ...Object.entries(TYPES).map(([k, v]) => [k, v.name])]),
        sel('rarity', [['', 'Minden ritkaság'], ...Object.entries(RARITY).map(([k, v]) => [k, v.name])]),
        sel('only', [['', 'Mind'], ['caught', 'Megszerzett'], ['missing', 'Hiányzó'], ['shiny', 'Shiny']]));
      const grid = el('div', { class: 'grid' });
      body.append(el('div', { style: 'font-weight:700;margin-bottom:8px' }, `Látott: ${seenN} • Megszerzett: ${caughtN} / ${SPECIES_ORDER.length} • Shiny: ${Object.keys(s.dex.shiny).length}`), tabs, grid);
      function sel(key, opts) { return el('select', { onchange: (e) => { f[key] = e.target.value; list(); } }, ...opts.map(([v, t]) => el('option', { value: v, selected: f[key] === v }, t))); }
      function list() {
        grid.innerHTML = '';
        for (const id of SPECIES_ORDER) {
          const sp = MEXIS[id]; const seen = s.dex.seen[id], caught = s.dex.caught[id];
          if (f.type && !sp.types.includes(f.type)) continue;
          if (f.rarity && sp.rarity !== f.rarity) continue;
          if (f.only === 'caught' && !caught) continue;
          if (f.only === 'missing' && caught) continue;
          if (f.only === 'shiny' && !s.dex.shiny[id]) continue;
          if (f.q && !(seen && sp.name.toLowerCase().includes(f.q.toLowerCase()))) continue;
          grid.append(el('div', { class: 'card' + (seen ? '' : ' unknown'), onclick: () => seen && dexDetail(id) },
            caught ? el('span', { class: 'star', title: 'Megszerezve' }, s.dex.shiny[id] ? '✨' : '●') : null,
            el('img', { src: iconFor(id, false) }),
            el('div', { class: 'nm' }, `#${String(sp.no).padStart(3, '0')} ${seen ? sp.name : '???'}`),
            seen ? el('div', {}, ...sp.types.map(typeBadge)) : el('div', { class: 'sub' }, 'Még nem láttad')));
        }
      }
      list();
    });
    const dexDetail = (id) => {
      const sp = MEXIS[id]; const s = G.state; const back = w.onBack(() => { back(); draw(); });
      w.render((body) => {
        const owned = [...s.party, ...s.storage].filter(m => m.species === id);
        body.append(
          el('button', { class: 'btn', onclick: () => { back(); draw(); }, style: 'margin-bottom:10px' }, '← Vissza'),
          el('div', { class: 'detail' },
            el('div', { class: 'pic' }, el('img', { src: iconFor(id, false) }), s.dex.shiny[id] ? el('img', { src: iconFor(id, true), style: 'width:80px;height:80px' }) : null,
              el('div', { style: 'font-weight:800;font-size:18px' }, sp.name), el('div', {}, ...sp.types.map(typeBadge)), el('div', {}, rarityBadge(sp.rarity))),
            el('div', {},
              el('p', {}, sp.desc),
              el('p', {}, el('b', {}, 'Szerep: '), sp.role, el('br'), el('b', {}, 'Előfordulás: '), sp.location),
              sp.evolve ? el('p', {}, el('b', {}, 'Fejlődés: '), `${MEXIS[sp.evolve.to].name} (${sp.evolve.level}. szint)`) : null,
              el('table', { class: 'stats' }, ...Object.entries(STAT_NAMES).map(([k, n]) => el('tr', {}, el('td', {}, n + ' (alap)'), el('td', { style: 'font-weight:800' }, sp.base[k]),
                el('td', {}, el('div', { class: 'statbar' }, el('i', { style: `width:${(sp.base[k] / 130) * 100}%` })))))),
              el('h4', {}, 'Megtanulható támadások'),
              el('div', { style: 'font-size:14px' }, ...sp.learnset.map(([l, mv]) => el('div', {}, `Szint ${l}: `, typeBadge(MOVES[mv].type), ' ', MOVES[mv].name))),
              s.dex.caught[id] ? el('p', {}, el('b', {}, `Saját példányok: ${owned.length}`), owned.length ? ` (szintek: ${owned.map(m => m.level + (m.shiny ? '✨' : '')).join(', ')})` : '') : el('p', {}, el('i', {}, 'Még nem szerezted meg.')))));
      });
    };
    draw();
  });
}

// ===================== TÁROLÓ =====================
export function openStorage() {
  openWindow('Mexi-tároló', (w) => {
    const f = { type: '', rarity: '', sort: 'new', shiny: false };
    const draw = () => w.render((body) => {
      const s = G.state;
      body.append(el('div', { style: 'font-weight:700;margin-bottom:6px' }, `Csapat: ${s.party.length}/6 • Tárolóban: ${s.storage.length}`));
      body.append(el('h4', { style: 'margin:4px 0' }, 'Csapat'));
      const pg = el('div', { class: 'grid' });
      s.party.forEach((m, i) => pg.append(card(m, () => openMexiDetail(m, { inParty: true, index: i, onChange: draw }))));
      body.append(pg, el('h4', { style: 'margin:12px 0 4px' }, 'Tároló'));
      body.append(el('div', { class: 'tabs' },
        el('select', { onchange: (e) => { f.type = e.target.value; draw(); } }, el('option', { value: '' }, 'Minden típus'), ...Object.entries(TYPES).map(([k, v]) => el('option', { value: k, selected: f.type === k }, v.name))),
        el('select', { onchange: (e) => { f.rarity = e.target.value; draw(); } }, el('option', { value: '' }, 'Minden ritkaság'), ...Object.entries(RARITY).map(([k, v]) => el('option', { value: k, selected: f.rarity === k }, v.name))),
        el('select', { onchange: (e) => { f.sort = e.target.value; draw(); } }, ...[['new', 'Legújabb'], ['old', 'Legrégebbi'], ['lvl', 'Szint'], ['no', 'Mexidex-szám'], ['iv', 'Adottság']].map(([v, t]) => el('option', { value: v, selected: f.sort === v }, t))),
        el('label', { style: 'display:flex;align-items:center;gap:4px;font-weight:700' }, el('input', { type: 'checkbox', checked: f.shiny, onchange: (e) => { f.shiny = e.target.checked; draw(); } }), 'Csak shiny')));
      let list = s.storage.filter(m => (!f.type || MEXIS[m.species].types.includes(f.type)) && (!f.rarity || MEXIS[m.species].rarity === f.rarity) && (!f.shiny || m.shiny));
      const sorters = { new: (a, b) => (b.caughtAt || 0) - (a.caughtAt || 0), old: (a, b) => (a.caughtAt || 0) - (b.caughtAt || 0), lvl: (a, b) => b.level - a.level, no: (a, b) => MEXIS[a.species].no - MEXIS[b.species].no, iv: (a, b) => ivPercent(b) - ivPercent(a) };
      list = list.sort(sorters[f.sort]);
      const sg = el('div', { class: 'grid' });
      list.forEach(m => sg.append(card(m, () => openMexiDetail(m, { inStorage: true, onChange: draw }))));
      if (!list.length) sg.append(el('p', {}, 'Üres. Az elkapott Mexik ide kerülnek, ha a csapatod tele van.'));
      body.append(sg);
    });
    const card = (m, on) => el('div', { class: 'card', onclick: on }, m.shiny ? el('span', { class: 'star' }, '✨') : null, el('img', { src: iconFor(m.species, m.shiny) }),
      el('div', { class: 'nm' }, displayName(m)), el('div', { class: 'sub' }, `Szint ${m.level} • ${ivPercent(m)}%`), el('div', {}, rarityBadge(MEXIS[m.species].rarity)));
    draw();
  });
}

// ===================== TÁSKA =====================
/** inBattle esetén Promise<{itemId, target}|null> */
export function openBag({ inBattle = false, isTrainer = false } = {}) {
  return new Promise((resolve) => {
    let result = null;
    openWindow('Táska', (w) => {
      const draw = () => w.render((body) => {
        const inv = G.state.inventory;
        body.append(el('div', { style: 'font-weight:700;margin-bottom:8px' }, `💰 ${G.state.money} Mexi-érme`));
        const ids = Object.keys(inv).filter(k => inv[k] > 0 && ITEMS[k]);
        if (!ids.length) body.append(el('p', {}, 'A táskád üres.'));
        const groups = [['ball', 'Teniszlabdák'], ['heal', 'Gyógyítás'], ['revive', 'Gyógyítás'], ['cure', 'Gyógyszerek'], ['misc', 'Egyéb']];
        for (const id of ids.sort((a, b) => groups.findIndex(g => g[0] === ITEMS[a].kind) - groups.findIndex(g => g[0] === ITEMS[b].kind))) {
          const it = ITEMS[id];
          const usable = inBattle ? (it.kind === 'ball' ? !isTrainer : ['heal', 'cure', 'revive'].includes(it.kind)) : ['heal', 'cure', 'revive'].includes(it.kind);
          body.append(el('div', { class: 'row', onclick: async () => {
            if (!usable) { toast(it.kind === 'ball' ? (inBattle ? 'Edző Mexijét nem lehet elkapni!' : 'Teniszlabdát harcban, vad Mexire dobhatsz.') : 'Ezt most nem lehet használni.'); return; }
            if (it.kind === 'ball') { result = { itemId: id }; w.close(); return; }
            const idx = await openParty({ mode: 'pick', title: `${it.name} – kire?` });
            if (idx < 0) return;
            if (inBattle) { result = { itemId: id, target: idx }; w.close(); return; }
            useItemOutside(id, G.state.party[idx]); draw();
          } },
            el('div', { style: `width:40px;height:40px;border-radius:50%;background:${it.color || '#e8d8b8'};border:3px solid #3a2a4a;display:flex;align-items:center;justify-content:center;font-size:20px` }, it.kind === 'ball' ? '🎾' : it.kind === 'misc' ? '🍪' : '🧪'),
            el('div', { class: 'grow' }, el('b', {}, it.name), el('div', { style: 'font-size:13px' }, it.desc)), el('b', {}, `×${inv[id]}`)));
        }
      });
      draw();
    }, { onClose: () => resolve(result) });
  });
}

function useItemOutside(id, m) {
  const it = ITEMS[id]; const inv = G.state.inventory;
  if (it.kind === 'heal') { if (m.hp <= 0 || m.hp >= m.stats.hp) { toast('Nincs hatása.'); return; } m.hp = Math.min(m.stats.hp, m.hp + it.heal); }
  else if (it.kind === 'cure') { if (!m.status || (it.cures !== 'all' && it.cures !== m.status)) { toast('Nincs hatása.'); return; } m.status = null; }
  else if (it.kind === 'revive') { if (m.hp > 0) { toast('Nincs hatása.'); return; } m.hp = Math.floor(m.stats.hp / 2); }
  inv[id]--; save(); toast(`${displayName(m)}: ${it.name} használva.`);
}

// ===================== BOLT =====================
export function openShop() {
  return new Promise((resolve) => {
    openWindow('Teniszlabda- és felszerelésbolt', (w) => {
      let tab = 'buy';
      const draw = () => w.render((body) => {
        const s = G.state;
        body.append(el('div', { class: 'tabs' },
          el('button', { class: 'btn' + (tab === 'buy' ? ' sel' : ''), onclick: () => { tab = 'buy'; draw(); } }, 'Vásárlás'),
          el('button', { class: 'btn' + (tab === 'sell' ? ' sel' : ''), onclick: () => { tab = 'sell'; draw(); } }, 'Eladás'),
          el('span', { style: 'margin-left:auto;font-weight:800;align-self:center' }, `💰 ${s.money}`)));
        if (tab === 'buy') {
          for (const id of SHOP_STOCK) {
            const it = ITEMS[id];
            const buy = (n) => { const cost = it.price * n; if (s.money < cost) { toast('Nincs elég pénzed.'); return; } s.money -= cost; s.inventory[id] = (s.inventory[id] || 0) + n;
              if (id === 'sima_labda' && n >= 10) { s.inventory.profi_labda = (s.inventory.profi_labda || 0) + 1; toast('Ajándék: 1 Profi Teniszlabda!'); } else toast(`Megvetted: ${n}× ${it.name}`); save(); draw(); };
            body.append(el('div', { class: 'row', style: 'cursor:default' },
              el('div', { style: 'font-size:24px' }, it.kind === 'ball' ? '🎾' : '🧪'),
              el('div', { class: 'grow' }, el('b', {}, it.name), el('div', { style: 'font-size:13px' }, `${it.desc} • Nálad: ${s.inventory[id] || 0}`)),
              el('b', {}, `${it.price} 💰`),
              el('button', { class: 'btn', onclick: () => buy(1) }, '+1'), el('button', { class: 'btn', onclick: () => buy(10) }, '+10')));
          }
          body.append(el('p', { style: 'font-size:13px;opacity:.75' }, '10 Sima Teniszlabda vásárlásakor 1 Profi Teniszlabda jár ajándékba.'));
        } else {
          const ids = Object.keys(s.inventory).filter(k => s.inventory[k] > 0);
          for (const id of ids) {
            const it = ITEMS[id]; const price = it.sell ?? Math.floor((it.price || 0) / 2); if (!price) continue;
            body.append(el('div', { class: 'row', style: 'cursor:default' }, el('div', { class: 'grow' }, el('b', {}, it.name), ` ×${s.inventory[id]}`), el('b', {}, `${price} 💰`),
              el('button', { class: 'btn', onclick: () => { s.inventory[id]--; s.money += price; save(); toast(`Eladva: ${it.name}`); draw(); } }, 'Eladás')));
          }
        }
      });
      draw();
    }, { onClose: resolve });
  });
}

/** Új támadás felajánlása, ha már 4 van. */
export async function offerMove(m, moveId) {
  const mv = MOVES[moveId];
  await dialog(`${displayName(m)} szeretné megtanulni: ${mv.name}! De már 4 támadása van.`);
  const opts = [...m.moves.map(x => `Elfelejti: ${MOVES[x.id].name}`), `Nem tanulja meg (${mv.name})`];
  const i = await choose(opts, { question: 'Melyik támadást felejtse el?', cancel: false });
  if (i >= 0 && i < m.moves.length) {
    const old = MOVES[m.moves[i].id].name; m.moves[i] = { id: moveId, pp: mv.pp };
    await dialog(`1, 2 és... Puff! ${displayName(m)} elfelejtette: ${old}, és megtanulta: ${mv.name}!`);
  } else await dialog(`${displayName(m)} nem tanulta meg: ${mv.name}.`);
}

export { UI };
