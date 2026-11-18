// Játékmenük: Mexidex, csapat, tároló, táska, bolt, Mexi-adatlap.
import { el, openWindow, choose, dialog, toast, hpBar, UI, askText } from './ui.js';
import { G, save, keyFor } from '../systems/state.js';
import { Account } from '../systems/account.js';
import { nextGoal } from '../systems/goals.js';
import { dailyQuests, questDef, questText, claimQuest } from '../systems/quests.js';
import { localBackups, addLocalBackup, summarize, writeLocalSave, makeTransferCode, fetchTransferCode, saveToText, textToSave, downloadSave } from '../systems/saveTransfer.js';
import { MEXIS, RARITY, SPECIES_ORDER, NATURES, STAT_NAMES } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS, SHOP_STOCK, itemIcon } from '../data/items.js';
import { TYPES } from '../data/types.js';
import { CONFIG } from '../data/config.js';
import { displayName, ivPercent, xpForLevel, relearnable } from '../systems/mexi.js';
import { Sfx } from '../systems/sfx.js';
import { canBoneEvolve, familyOf, bonesOf, powerUp, canPowerUp, powerUpCost, evolveCost, transfer, canTransfer, transferReward, duplicatePlan, BONES } from '../systems/bones.js';
import { evolve } from '../systems/mexi.js';
import { mexiIconDataURL } from '../art/placeholders.js';
import { getArtURL } from '../art/registerArt.js';
import { Net } from '../systems/net.js';
import { getControls, setControls, DEFAULT_CONTROLS, vibrate } from './touch.js';
import { MAPS } from '../data/maps.js';

const iconCache = {};
export function iconFor(species, shiny = false) {
  const k = species + (shiny ? '_s' : '');
  return iconCache[k] ??= (getArtURL(species, shiny) || mexiIconDataURL(species, shiny));
}
export const typeIcon = (t) => el('img', { class: 'ico', src: `assets/ui/t_${t}.png`, alt: '' });
export const typeBadge = (t) => el('span', { class: 'type', style: `background:${TYPES[t].color}` }, typeIcon(t), TYPES[t].name);
export function rarityBadge(r) { const R = RARITY[r]; return el('span', { class: 'rar' + (R.color === 'rainbow' ? ' rainbow' : ''), style: R.color === 'rainbow' ? '' : `background:${R.color}` }, R.name); }
const statusBadge = (s) => s ? el('span', { class: 'rar', style: `background:${STATUS[s].color}` }, el('img', { class: 'ico', src: `assets/ui/s_${s}.png` }), STATUS[s].short) : null;

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

// ===================== CSONTOK =====================
const boneCache = {};
/** Pixel-art csont ikon a család típusszínével (amíg nincs saját grafika). */
export function boneIcon(species) { return `assets/bones/${familyOf(species)}.png`; }
/** Rövid képsoros effekt a felület fölött (erősítés, átadás, csont jutalom). */
export function domFx(prefix, frames = 4, ms = 140, size = 220) {
  return new Promise((res) => {
    const img = el('img', { src: `assets/battle/${prefix}1.png`, style: `position:fixed;left:50%;top:45%;width:${size}px;height:${size}px;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;image-rendering:pixelated` });
    document.body.append(img); let i = 1;
    const t = setInterval(() => { i++; if (i > frames) { clearInterval(t); img.remove(); res(); } else img.src = `assets/battle/${prefix}${i}.png`; }, ms);
  });
}
const uiIco = (n) => el('img', { src: `assets/ui/i_${n}.png`, style: 'width:22px;height:22px;vertical-align:middle;margin-right:4px' });
const boneTag = (species, n = bonesOf(species)) => el('span', { style: 'display:inline-flex;align-items:center;gap:4px;font-weight:800' }, el('img', { src: boneIcon(species), style: 'height:24px' }), `${n} ${MEXIS[familyOf(species)].name}-csont`);

/** Professzor: átadás csontért (egyes + tömeges duplikátumok). */
export function openTransfer() {
  return new Promise((resolve) => openWindow('Átadás a Professzornak 🦴', (w) => {
    const draw = () => w.render((body) => {
      const s = G.state;
      const plan = duplicatePlan();
      const total = plan.reduce((a, m) => a + transferReward(m), 0);
      body.append(el('p', { style: 'margin:0 0 8px' }, 'Az átadott Mexi a professzor laborjába költözik, te pedig a családjához tartozó csontot kapsz. Csonttal erősítheted (szintlépés) és fejlesztheted a Mexijeidet.'));
      body.append(el('div', { class: 'row', style: 'cursor:default' },
        el('div', { class: 'grow' }, el('b', {}, `Duplikátumok gyors átadása: ${plan.length} Mexi`), el('div', { style: 'font-size:13px' }, `Fajonként a legjobbat megtartja. Shiny, zárolt 🔒 és csapattag sosem kerül bele. Jutalom: ${total} csont.`)),
        el('button', { class: 'btn primary', disabled: !plan.length, onclick: async () => {
          const ok = await choose([`Igen, mind a ${plan.length} átadása`, 'Mégse'], { question: `Biztos? ${plan.map(m => displayName(m) + ' Sz.' + m.level).slice(0, 8).join(', ')}${plan.length > 8 ? '…' : ''}` });
          if (ok !== 0) return;
          const got = {}; for (const m of plan) { const r = transfer(m); if (!r.err) got[familyOf(m.species)] = (got[familyOf(m.species)] || 0) + r.bones; }
          Sfx.play('coin'); domFx('bfx_bone'); save(); toast('Kaptál: ' + Object.entries(got).map(([f, n]) => `${n} ${MEXIS[f].name}-csont`).join(', ')); draw();
        } }, '📤 Átadás')));
      body.append(el('h4', { style: 'margin:12px 0 4px' }, 'Egyenként (koppints egy Mexire)'));
      const all = [...s.party.map(m => ({ m, p: true })), ...s.storage.map(m => ({ m, p: false }))].sort((a, b) => MEXIS[a.m.species].no - MEXIS[b.m.species].no || a.m.level - b.m.level);
      const g = el('div', { class: 'grid' });
      for (const { m, p } of all) g.append(el('div', { class: 'card', style: m.locked ? 'opacity:.55' : '', onclick: async () => {
        const err = canTransfer(m); if (err) { toast(err); return; }
        const warn = m.shiny ? ' ✨ SHINY!' : ivPercent(m) >= 85 ? ` (kiváló adottság: ${ivPercent(m)}%)` : '';
        const ok = await choose([`Igen, átadom (+${transferReward(m)} csont)`, 'Mégse'], { question: `Átadod: ${displayName(m)} (Sz. ${m.level})?${warn}` });
        if (ok !== 0) return;
        const r = transfer(m); Sfx.play('ball_open'); await domFx('bfx_tr', 4, 200); Sfx.play('coin'); domFx('bfx_bone'); save(); toast(`Viszlát, ${displayName(m)}! +${r.bones} ${MEXIS[familyOf(m.species)].name}-csont`); draw();
      } }, m.shiny ? el('span', { class: 'star' }, '✨') : null, el('img', { src: iconFor(m.species, m.shiny) }), el('div', { class: 'nm' }, (m.locked ? '🔒 ' : '') + displayName(m)), el('div', { class: 'sub' }, `Sz. ${m.level} • ${ivPercent(m)}%${p ? ' • csapat' : ''}`)));
      body.append(g);
    });
    draw();
  }, { onClose: resolve }));
}

// ===================== NAPI KÜLDETÉSEK =====================
function questBadge(label) {
  const q = dailyQuests(); const ready = [...q.list, { id: 'weekly', ...G.state.weekly }].filter(it => !it.claimed && it.prog >= questDef(it.id).goal).length;
  return ready ? `${label} (${ready}!)` : label;
}
export function openQuests() {
  openWindow('Napi küldetések', (w) => {
    const draw = () => w.render((body) => {
      const q = dailyQuests();
      body.append(el('p', { style: 'margin:0 0 8px;font-size:13px' }, 'Minden nap éjfélkor 3 új küldetés jön. A heti cél hétfőn indul újra.'));
      const row = (it, def, text) => {
        const done = it.prog >= def.goal; const r = def.reward;
        const rw = r.money ? `${r.money} érme` : r.item ? `${r.qty}× ${ITEMS[r.item].name}` : `${r.bonesAny} csont (az első csapattagod családjából)`;
        return el('div', { class: 'row', style: 'cursor:default' },
          el('div', { class: 'grow' }, el('b', {}, text), el('div', { style: 'font-size:13px' }, `${it.prog}/${def.goal} • Jutalom: ${rw}`),
            el('div', { class: 'xpbar' }, el('i', { style: `width:${Math.min(100, it.prog / def.goal * 100)}%` }))),
          it.claimed ? el('b', {}, '✔') : el('button', { class: 'btn' + (done ? ' primary' : ''), disabled: !done, onclick: () => { if (claimQuest(it.id)) { Sfx.play('item'); save(); toast('Jutalom megszerezve: ' + rw); draw(); } } }, 'Átvétel'));
      };
      for (const it of q.list) body.append(row(it, questDef(it.id), questText(it)));
      body.append(el('h4', { style: 'margin:12px 0 4px' }, '🏆 Heti cél'), row({ id: 'weekly', ...G.state.weekly }, questDef('weekly'), questDef('weekly').text));
    });
    draw();
  });
}

// ===================== MENTÉSEK: ÁTVITEL, EXPORT, IMPORT, BIZTONSÁGI MÁSOLATOK =====================
/** Betöltött mentés alkalmazása (ütközésnél választás, előtte biztonsági másolat). */
export async function applyImportedSave(imp) {
  let cur = null; try { cur = JSON.parse(localStorage.getItem(keyFor()) || 'null'); } catch {}
  if (cur) {
    const c = await choose([`📥 A betöltött mentés: ${summarize(imp)}`, `📱 A mostani marad: ${summarize(cur)}`],
      { question: 'Ezen az eszközön már van mentés. Melyik maradjon? (A másikról biztonsági másolat készül.)' });
    if (c !== 0) return false;
  }
  writeLocalSave(imp, 'mentés betöltése');
  toast('Mentés betöltve! Újraindítás...'); setTimeout(() => location.reload(), 900);
  return true;
}
export function openSaveTools(opts = {}) {
  openWindow('Mentések', (w) => {
    const draw = async () => {
      const cloud = Account.loggedIn ? await Account.backups() : null;
      w.render((body) => {
        const sec = (t) => body.append(el('h4', { style: 'margin:12px 0 4px' }, t));
        if (G.state && !opts.importOnly) {
          sec('📤 Mentés átvitele másik eszközre / az új appba');
          body.append(el('p', { style: 'margin:0 0 6px;font-size:13px' }, Account.loggedIn ? 'Be vagy lépve: a másik eszközön egyszerűen lépj be ugyanazzal a fiókkal, és a felhős mentés megjön. Vendégként az alábbiak közül választhatsz.' : 'Vendégként játszol. Készíts átviteli kódot (internet kell), vagy másold ki a mentés-szöveget / töltsd le fájlként.'));
          const out = el('div', { style: 'font-size:22px;font-weight:900;letter-spacing:3px;margin:6px 0' });
          body.append(el('div', { class: 'actions' },
            el('button', { class: 'btn primary', onclick: async (e) => { e.target.disabled = true; try { save(); const code = await makeTransferCode(); out.textContent = code.slice(0, 4) + '-' + code.slice(4); toast('Kód kész – 48 óráig érvényes.'); } catch (err) { toast(err.message || 'Nincs internetkapcsolat.'); } e.target.disabled = false; } }, '🔑 Átviteli kód készítése'),
            el('button', { class: 'btn', onclick: async () => { save(); const t = await saveToText(); try { await navigator.clipboard.writeText(t); toast('Mentés-szöveg a vágólapon – illeszd be a másik eszközön!'); } catch { const ta = el('textarea', { style: 'width:100%;height:80px' }); ta.value = t; out.replaceChildren(ta); ta.select(); toast('Másold ki a szöveget!'); } } }, '📋 Mentés-szöveg másolása'),
            el('button', { class: 'btn', onclick: () => { save(); downloadSave(); } }, '💾 Letöltés fájlként')), out);
        }
        sec('📥 Mentés betöltése');
        const code = el('input', { placeholder: 'Átviteli kód (pl. ABCD-EFGH) vagy mentés-szöveg', style: 'width:100%' });
        const file = el('input', { type: 'file', accept: '.json,application/json,text/plain', style: 'display:none', onchange: async () => {
          try { const t = await file.files[0].text(); await applyImportedSave(await textToSave(t)); } catch (err) { toast(err.message); }
        } });
        body.append(code, file, el('div', { class: 'actions' },
          el('button', { class: 'btn primary', onclick: async () => {
            const v = code.value.trim(); if (!v) { toast('Írd be a kódot vagy illeszd be a mentés-szöveget.'); return; }
            try { const imp = /^[A-Za-z0-9-\s]{8,10}$/.test(v) ? await fetchTransferCode(v.replace(/[-\s]/g, '')) : await textToSave(v); await applyImportedSave(imp); } catch (err) { toast(err.message); }
          } }, 'Betöltés'),
          el('button', { class: 'btn', onclick: () => file.click() }, '📂 Fájlból')));
        sec('🛟 Biztonsági másolatok ezen az eszközön');
        const lb = localBackups();
        if (!lb.length) body.append(el('p', { style: 'font-size:13px;margin:0' }, 'Még nincs. Minden felülírás vagy új játék előtt automatikusan készül egy (az utolsó 5 marad meg).'));
        lb.forEach((b, i) => { let s0 = null; try { s0 = JSON.parse(b.data); } catch {}
          body.append(el('div', { class: 'row' }, el('div', { class: 'grow' }, el('b', {}, new Date(b.at).toLocaleString('hu-HU') + ' – ' + b.reason), el('div', { style: 'font-size:13px' }, summarize(s0))),
            el('button', { class: 'btn', onclick: () => s0 && applyImportedSave(s0) }, 'Visszaállítás'))); });
        if (Account.loggedIn) {
          sec('☁️ Felhős biztonsági mentések');
          if (!cloud) body.append(el('p', { style: 'font-size:13px;margin:0' }, 'A szerver most nem érhető el (nincs internet?).'));
          else if (!cloud.length) body.append(el('p', { style: 'font-size:13px;margin:0' }, 'Még nincs – játék közben kb. negyedóránként készül egy (az utolsó 12 marad meg).'));
          else for (const b of cloud) body.append(el('div', { class: 'row' },
            el('div', { class: 'grow' }, el('b', {}, new Date(b.at).toLocaleString('hu-HU')), el('div', { style: 'font-size:13px' }, `${b.party.map(m => (MEXIS[m.species]?.name || m.species).replace(' Mexi', '') + ' ' + m.level).join(', ')} • ${b.money} 🪙 • ${b.caught} faj`)),
            el('button', { class: 'btn', onclick: async () => {
              if ((await choose(['Igen, visszaállítom', 'Mégse'], { question: `Visszaállítod a ${new Date(b.at).toLocaleString('hu-HU')} állapotot?` })) !== 0) return;
              const s1 = await Account.restore(b.id); if (!s1) { toast('Nem sikerült visszaállítani.'); return; }
              addLocalBackup('Felhős visszaállítás előtt'); localStorage.setItem(keyFor(), JSON.stringify(s1));
              toast('Visszaállítva! Újraindítás...'); setTimeout(() => location.reload(), 800);
            } }, 'Visszaállítás')));
        }
      });
    };
    w.body.append(el('p', {}, 'Betöltés...'));
    draw();
  });
}
export const openBackups = () => openSaveTools();

// ===================== IRÁNYÍTÁS =====================
export function openControlSettings() {
  openWindow('Irányítás', (w) => {
    const draw = () => w.render((body) => {
      const c = getControls();
      const seg = (label, keyName, opts) => el('div', { class: 'row', style: 'cursor:default;flex-wrap:wrap' }, el('b', { class: 'grow' }, label),
        ...opts.map(([v, t]) => el('button', { class: 'btn' + (c[keyName] === v ? ' primary' : ''), onclick: () => { setControls({ [keyName]: v }); vibrate('tap'); draw(); } }, t)));
      const slider = (label, keyName, min, max, step, fmt) => {
        const val = el('span', { style: 'min-width:54px;text-align:right;font-weight:800' }, fmt(c[keyName]));
        const r = el('input', { type: 'range', min, max, step, value: c[keyName], style: 'flex:1;min-width:120px' });
        r.addEventListener('input', () => { setControls({ [keyName]: +r.value }); val.textContent = fmt(+r.value); });
        return el('div', { class: 'row', style: 'cursor:default' }, el('b', { style: 'min-width:150px' }, label), r, val);
      };
      body.append(
        seg('Érintőgombok', 'show', [['auto', 'Automatikus'], ['always', 'Mindig'], ['never', 'Soha']]),
        seg('Mozgás', 'mode', [['joystick', '🕹️ Joystick'], ['dpad', '✚ D-pad']]),
        slider('Joystick / D-pad mérete', 'joySize', 100, 200, 5, v => v + ' px'),
        slider('Gombok mérete', 'btnScale', 0.7, 1.4, 0.05, v => Math.round(v * 100) + '%'),
        slider('Átlátszóság', 'opacity', 0.3, 1, 0.05, v => Math.round(v * 100) + '%'),
        seg('Kézhasználat', 'leftHanded', [[false, '🫱 Jobbkezes'], [true, '🫲 Balkezes']]),
        seg('Rezgés', 'vibration', [[true, 'Be'], [false, 'Ki']]),
        seg('Effektek', 'fx', [['full', '✨ Teljes'], ['low', '🔋 Csökkentett']]),
        el('p', { style: 'font-size:13px;margin:8px 0 0' }, 'Mobilon: bal oldalt bárhová érintve megjelenik a joystick. A = beszélgetés / tovább / megerősítés, B = vissza / mégse, 🐾 = szimatolás, 🏃 = futás be/ki, ☰ = menü. A változások azonnal érvényesek és megmaradnak.'),
        el('p', { style: 'font-size:13px;margin:6px 0 0' }, 'Billentyűzet: WASD / nyilak – mozgás (Shift: futás) • E – beszélgetés • Space – szimatolás • I – táska • J – Mexidex • P – csapat • Esc – menü'),
        el('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { setControls({ ...DEFAULT_CONTROLS }); draw(); } }, 'Alapértelmezett'));
    });
    draw();
  });
}

// ===================== HANG =====================
export function openSound() {
  openWindow('Hangeffektek', (w) => {
    const lab = el('div', { style: 'font-weight:700;margin:6px 0' });
    const r = el('input', { type: 'range', min: 0, max: 100, step: 5, value: Math.round(Sfx.volume * 100), style: 'width:100%' });
    const upd = () => { lab.textContent = `Hangerő: ${r.value}%${+r.value === 0 ? ' (némítva)' : ''}`; };
    r.addEventListener('input', () => { Sfx.setVolume(r.value / 100); upd(); });
    r.addEventListener('change', () => Sfx.play('select'));
    upd();
    const demo = (label, k) => el('button', { class: 'btn', onclick: () => k.startsWith('move:') ? Sfx.move(k.slice(5)) : Sfx.play(k) }, label);
    w.body.append(lab, r,
      el('div', { style: 'margin:10px 0 4px;font-weight:700' }, 'Kipróbálás:'),
      el('div', { class: 'mainmenu' }, demo('🐶 Vau!', 'bark'), demo('🎾 Elkapás', 'catch'), demo('⭐ Szintlépés', 'levelup'), demo('🔥 Tűz', 'move:tuz'), demo('⚡ Villám', 'move:villam'), demo('💖 Gyógyítás', 'heal')),
      el('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { Sfx.setVolume(Sfx.volume > 0 ? 0 : 0.6); r.value = Math.round(Sfx.volume * 100); upd(); } }, '🔇 Némítás be/ki'));
  });
}

// ===================== FŐMENÜ (Esc) =====================
export function openMainMenu(world) {
  openWindow('Menü', (w) => {
    const s = G.state;
    const b = (label, fn) => el('button', { class: 'btn', onclick: () => { w.close(); fn(); } }, ...[].concat(label));
    w.body.append(
      el('div', { style: 'margin-bottom:10px;font-weight:700' }, `${s.player.name} • 💰 ${s.money} • Mexidex: ${Object.keys(s.dex.caught).length}/${SPECIES_ORDER.length} • Elkapva: ${s.stats.caught}`),
      el('div', { class: 'mainmenu' },
        b([el('img', { class: 'mico', src: 'assets/ui/m_map.png' }), '🎯 Következő cél: ' + nextGoal(s).short], () => dialog(nextGoal(G.state).long, '🎯 Következő cél')),
        b([el('img', { class: 'mico', src: 'assets/ui/m_dex.png' }), 'Mexidex (J)'], () => openDex()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_dex.png' }), questBadge('📜 Napi küldetések')], () => openQuests()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_party.png' }), 'Csapat (P)'], () => openParty()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_bag.png' }), 'Táska (I)'], () => openBag()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_map.png' }), 'Mexi-tároló'], () => openStorage()),
        CONFIG.goModeEnabled && b([el('img', { class: 'mico', src: 'assets/ui/m_map.png' }), '🚶 Séta mód'], () => { w.close(); import('../go/goMode.js').then(m => m.openGoMode(world)); }),
        b([el('img', { class: 'mico', src: 'assets/ui/m_party.png' }), 'Barátok (party)'], () => openPartyMenu()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_save.png' }), 'Mentés'], () => { save() ? toast('Játék elmentve!') : toast('Mentés sikertelen'); }),
        b([el('img', { class: 'mico', src: 'assets/ui/m_save.png' }), 'Mentések (átvitel, visszaállítás)'], () => openSaveTools()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_settings.png' }), `Hang: ${Math.round(Sfx.volume * 100)}%`], () => openSound()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_settings.png' }), '🎮 Irányítás'], () => openControlSettings()),
        b([el('img', { class: 'mico', src: 'assets/ui/m_exit.png' }), 'Főmenü'], () => world.scene.start('Title')),
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
          el('div', { style: 'margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center' }, boneTag(m.species)),
          (() => { const t = [canPowerUp(m) && 'Erősítés: ' + canPowerUp(m), sp.evolve && canBoneEvolve(m) && 'Csont-fejlesztés: ' + canBoneEvolve(m)].filter(Boolean).join(' • '); return t ? el('div', { style: 'font-size:12px;opacity:.75;margin-top:2px' }, t) : null; })(),
          el('div', { class: 'actions' },
            (() => { const c = powerUpCost(m); const err = canPowerUp(m); return el('button', { class: 'btn primary', disabled: !!err, title: err || '', onclick: async () => {
              const r = powerUp(m); if (r.err) { toast(r.err); return; }
              Sfx.play('levelup'); await domFx('bfx_pw'); toast(`${displayName(m)} erősödött: ${m.level}. szint!`);
              for (const e of r.events) if (e.type === 'canLearn') await offerMove(m, e.move); else if (e.type === 'learned') await dialog(`${displayName(m)} megtanulta: ${MOVES[e.move].name}!`);
              save(); draw(); onChange?.();
            } }, uiIco('powerup'), `Erősítés +1 szint (${c.bones} 🦴 + ${c.coins} 🪙)`); })(),
            sp.evolve ? el('button', { class: 'btn', disabled: !!canBoneEvolve(m), title: canBoneEvolve(m) || '', onclick: async () => {
              const to = sp.evolve.to; const cost = evolveCost(m);
              const ok = await choose([`Igen, fejlődjön (${cost} csont)`, 'Mégse'], { question: `${displayName(m)} → ${MEXIS[to].name}?` }); if (ok !== 0) return;
              G.state.bones[familyOf(m.species)] -= cost; const old = displayName(m);
              const pend = evolve(m, to); G.state.dex.seen[to] = G.state.dex.caught[to] = true; if (m.shiny) G.state.dex.shiny[to] = true;
              Sfx.play('evolve'); await dialog(`Mi történik?! ${old} fejlődött: ${MEXIS[to].name}! 🌟`);
              for (const mv of pend) await offerMove(m, mv);
              save(); w.close(); onChange?.();
            } }, `🌟 Fejlesztés csonttal (${evolveCost(m)} 🦴)`) : null,
            el('button', { class: 'btn', onclick: () => { m.locked = !m.locked; save(); toast(m.locked ? '🔒 Zárolva – nem adható át.' : 'Zárolás feloldva.'); draw(); } }, uiIco('lock'), m.locked ? 'Feloldás' : 'Zárolás'),
            el('button', { class: 'btn', onclick: async () => {
              const err = canTransfer(m); if (err) { toast(err); return; }
              const ok = await choose([`Igen, átadom (+${transferReward(m)} csont)`, 'Mégse'], { question: `Átadod ${displayName(m)}-t a professzornak?${m.shiny ? ' ✨ Ez egy SHINY!' : ''}` }); if (ok !== 0) return;
              const r = transfer(m); w.close(); Sfx.play('ball_open'); await domFx('bfx_tr', 4, 220); Sfx.play('coin'); await domFx('bfx_bone'); save(); toast(`+${r.bones} ${MEXIS[familyOf(m.species)].name}-csont`); onChange?.();
            } }, uiIco('transfer'), 'Átadás (csont)'),
            el('button', { class: 'btn', onclick: async () => { const n = await askText('Új becenév (üresen: eredeti név):', m.nickname || ''); if (n !== null) { m.nickname = n.trim().slice(0, 14) || null; save(); draw(); onChange?.(); } } }, '✏️ Becenév'),
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
        const bones = Object.entries(G.state.bones || {}).filter(([, n]) => n > 0);
        if (bones.length && !inBattle) {
          body.append(el('h4', { style: 'margin:4px 0' }, uiIco('bonepile'), 'Csontok'));
          const bg = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px' });
          for (const [f, n] of bones) bg.append(el('div', { class: 'row', style: 'flex:1 1 200px;cursor:default' }, el('img', { src: iconFor(f, false), style: 'width:36px;height:36px' }), boneTag(f, n)));
          body.append(bg, el('div', { style: 'font-size:12px;opacity:.75;margin-bottom:8px' }, 'Csontot a Mexi adatlapján használhatsz: erősítés (+1 szint) vagy fejlesztés.'));
        }
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
            el('img', { src: itemIcon(id), style: 'width:44px;height:44px;image-rendering:pixelated' }),
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
            const buy = (n) => { const cost = it.price * n; if (s.money < cost) { toast('Nincs elég pénzed.'); return; } s.money -= cost; Sfx.play('coin'); s.inventory[id] = (s.inventory[id] || 0) + n;
              if (id === 'sima_labda' && n >= 10) { s.inventory.profi_labda = (s.inventory.profi_labda || 0) + 1; toast('Ajándék: 1 Profi Teniszlabda!'); } else toast(`Megvetted: ${n}× ${it.name}`); save(); draw(); };
            body.append(el('div', { class: 'row', style: 'cursor:default' },
              el('img', { src: itemIcon(id), style: 'width:40px;height:40px;image-rendering:pixelated' }),
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

const moveLine = (id, pp) => { const d = MOVES[id]; return `${d.name} · ${TYPES[d.type].name} · ${d.power ? d.power + ' erő' : 'státusz'} · ${pp ?? d.pp} PP`; };

/** Új támadás felajánlása, ha már 4 van (max 4 támadás, cserélhető). */
export async function offerMove(m, moveId) {
  const mv = MOVES[moveId];
  await dialog([`${displayName(m)} szeretné megtanulni: ${mv.name}!`, `De egy Mexi legfeljebb 4 támadást tudhat. Elfelejtsen egyet a(z) ${mv.name} kedvéért?`]);
  while (true) {
    const opts = [...m.moves.map(x => `Elfelejti: ${moveLine(x.id, x.pp)}`), `✗ Nem tanulja meg (${moveLine(moveId)})`];
    const i = await choose(opts, { question: `Új: ${moveLine(moveId)}${mv.desc ? ' – ' + mv.desc : ''}`, cancel: false });
    if (i >= 0 && i < m.moves.length) {
      const old = MOVES[m.moves[i].id].name;
      const ok = await choose([`Igen, felejtse el: ${old}`, 'Mégse'], { question: `Biztos? ${displayName(m)} elfelejti: ${old}.` });
      if (ok !== 0) continue;
      m.moves[i] = { id: moveId, pp: mv.pp };
      Sfx.play('learn');
      await dialog(`1, 2 és... Puff! ${displayName(m)} elfelejtette: ${old}, és megtanulta: ${mv.name}!`);
    } else {
      const ok = await choose(['Igen, ne tanulja meg', 'Mégse'], { question: `Biztos, hogy ${displayName(m)} nem tanulja meg: ${mv.name}?` });
      if (ok !== 0) continue;
      await dialog(`${displayName(m)} nem tanulta meg: ${mv.name}. (A gyógyítóállomáson később még megtanulhatja.)`);
    }
    return;
  }
}

/** Támadás-emlékeztető: kihagyott/elfelejtett támadás újratanulása pénzért. */
export async function moveReminder(who = 'Nővér Mancsi') {
  const s = G.state; const PRICE = 200;
  const cands = s.party.map((m, i) => ({ m, i, list: relearnable(m) })).filter(x => x.list.length);
  if (!cands.length) { await dialog('Most egyik Mexid sem tud újra megtanulni semmit. Gyere vissza, ha szintet léptek!', who); return; }
  const ci = await choose(cands.map(x => `${displayName(x.m)} (Sz. ${x.m.level}) – ${x.list.length} támadás`), { question: `Melyik Mexi emlékezzen? (${PRICE} 🪙 / támadás)` });
  if (ci < 0) return;
  const { m, list } = cands[ci];
  const mi = await choose(list.map(id => moveLine(id)), { question: 'Melyik támadást tanulja meg újra?' });
  if (mi < 0) return;
  if (s.money < PRICE) { await dialog(`Ehhez ${PRICE} 🪙 kell, neked csak ${s.money} 🪙 van.`, who); return; }
  s.money -= PRICE;
  if (m.moves.length < 4) { m.moves.push({ id: list[mi], pp: MOVES[list[mi]].pp }); Sfx.play('learn'); await dialog(`${displayName(m)} újra megtanulta: ${MOVES[list[mi]].name}!`, who); }
  else {
    const before = m.moves.map(x => x.id).join();
    await offerMove(m, list[mi]);
    if (m.moves.map(x => x.id).join() === before) { s.money += PRICE; toast('Nem történt csere – a pénzt visszakaptad.'); }
  }
  save();
}

export { UI };

// ===================== KÖZÖS JÁTÉK: PARTY + NAPI KIHÍVÁSOK =====================
export const COOP_DAILY = [
  { id: 'win5', text: 'Győzzetek le együtt 5 vad Mexit közös harcban', goal: 5, key: 'foes', reward: { item: 'profi_labda', qty: 3 } },
  { id: 'catch2', text: 'Kapjatok el 2 Mexit közös harcban', goal: 2, key: 'caught', reward: { item: 'arany_labda', qty: 1 } },
  { id: 'battles3', text: 'Nyerjetek meg 3 közös harcot', goal: 3, key: 'wins', reward: { money: 500 } },
];
export function coopDaily() {
  const s = G.state; const today = new Date().toISOString().slice(0, 10);
  if (!s.coop || s.coop.date !== today) s.coop = { date: today, foes: 0, caught: 0, wins: 0, claimed: {} };
  return s.coop;
}
/** Teleport a társ mellé (szabad szomszédos mezőre). */
function goToPartner(pos) {
  const world = window.MEXI_DEBUG?.game?.scene.getScene('World');
  if (!world || world.inBattle || world.cutscene) { toast('Most nem lehet – fejezd be, amit csinálsz!'); return; }
  const map = MAPS[pos.map];
  if (!map || map.interior) { toast('A társad épp egy épületben van – várd meg, amíg kijön!'); return; }
  const need = map.requires;
  if (need?.trainer && !G.state.defeatedTrainers.includes(need.trainer)) { toast(`Ezt a területet még nem nyitottad meg (${need.text}).`); return; }
  const spot = [pos.x, pos.y]; // a társ mezője biztosan járható
  toast('Irány a társad! 🐾');
  world.warpTo({ to: pos.map, tx: spot[0], ty: spot[1], dir: 'up' });
}
export function openPartyMenu() {
  openWindow('Barátok – közös játék', (w) => {
    // a kódmező egyszer jön létre: az újrarajzolás nem törli a beírt szöveget
    const input = el('input', { maxlength: 5, placeholder: 'KÓD', inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', style: 'font:inherit;font-size:22px;letter-spacing:4px;width:140px;text-transform:uppercase;padding:6px;border:3px solid var(--line);border-radius:8px' });
    const typing = () => document.activeElement === input || input.value.trim() !== '';
    const draw = () => w.render((body) => {
      if (!Net.online) body.append(el('p', { style: 'color:#c03030;font-weight:700' }, 'Kapcsolódás a szerverhez...'));
      const p = Net.party;
      if (!p) {
        const join = () => { const v = input.value.trim().toUpperCase(); if (v) Net.send({ t: 'party_join', code: v }); else toast('Írd be a barátod kódját.'); };
        input.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') join(); };
        body.append(
          Net.online ? '' : el('p', { style: 'color:#b03030;font-weight:800' }, '📡 Nincs kapcsolat a szerverrel. A közös játékhoz internet kell – egyedül nyugodtan játszhatsz tovább, és amint visszajön a net, magától újracsatlakozunk.'),
          el('p', {}, 'Játssz egy barátoddal! Hozz létre egy partit, és küldd el neki a kódot – vagy írd be az ő kódját.'),
          el('div', { class: 'actions' },
            el('button', { class: 'btn primary', onclick: () => Net.send({ t: 'party_create' }) }, '➕ Party létrehozása'),
            input, el('button', { class: 'btn', onclick: join }, 'Csatlakozás')));
      } else {
        const partner = p.members.find(m => m.pid !== Net.pid);
        body.append(
          el('div', { style: 'font-size:15px' }, 'Party-kód: ', el('b', { style: 'font-size:26px;letter-spacing:4px' }, p.code)),
          el('p', {}, partner ? `Társad: ${partner.name} ${partner.online ? '🟢' : '⚪ (nem elérhető)'}${partner.pos && MAPS[partner.pos.map] ? ' – itt van: ' + MAPS[partner.pos.map].name : ''}` : 'Várakozás a társadra... Küldd el neki a kódot!'),
          el('div', { class: 'actions' },
            partner && partner.online && partner.pos && MAPS[partner.pos.map] ? el('button', { class: 'btn primary', onclick: () => { w.close(); goToPartner(partner.pos); } }, `🚶 Odamegyek hozzá (${MAPS[partner.pos.map].name})`) : null,
            el('button', { class: 'btn', onclick: () => Net.send({ t: 'party_leave' }) }, 'Kilépés a partiból')));
      }
      body.append(el('h4', { style: 'margin:14px 0 4px' }, 'Hogyan működik?'),
        el('ul', { style: 'margin:0;padding-left:18px;font-size:14px;line-height:1.5' },
          el('li', {}, 'Ugyanazon a területen látjátok egymást és egymás Mexijét.'),
          el('li', {}, 'Ha egymás közelében (10 lépésen belül) léptek a magas fűbe, közös harc indul: ketten együtt egy erősebb vad Mexi ellen (mint a Let\'s Go-ban).'),
          el('li', {}, 'Ha ugyanabban a körben mindketten labdát dobtok, közös dobás lesz: nagyobb esély, és siker esetén mindketten megkapjátok a Mexit!'),
          el('li', {}, 'A vad Mexik a csapatotok szintjéhez igazodnak (1–2 szinttel erősebbek). Ha nagy a szintkülönbség köztetek, a harcban a magasabb szintű Mexik a közös szinthatárra állnak be.'),
          el('li', {}, 'XP, érme és tárgy mindenkinek külön jár. Akinek a labdája elkapja a Mexit, azé lesz.')));
      const d = coopDaily();
      body.append(el('h4', { style: 'margin:14px 0 4px' }, 'Közös napi kihívások'));
      for (const c of COOP_DAILY) {
        const prog = Math.min(c.goal, d[c.key] || 0), done = prog >= c.goal, claimed = d.claimed[c.id];
        const rw = c.reward.item ? `${c.reward.qty}× ${ITEMS[c.reward.item].name}` : `${c.reward.money} érme`;
        body.append(el('div', { class: 'row', style: 'cursor:default' },
          el('div', { class: 'grow' }, el('b', {}, c.text), el('div', { style: 'font-size:13px' }, `${prog}/${c.goal} • Jutalom: ${rw}`),
            el('div', { class: 'xpbar' }, el('i', { style: `width:${prog / c.goal * 100}%` }))),
          claimed ? el('b', {}, '✔') : el('button', { class: 'btn' + (done ? ' primary' : ''), disabled: !done, onclick: () => {
            d.claimed[c.id] = true;
            if (c.reward.item) G.state.inventory[c.reward.item] = (G.state.inventory[c.reward.item] || 0) + c.reward.qty; else G.state.money += c.reward.money;
            save(); toast('Jutalom megszerezve: ' + rw); draw();
          } }, 'Átvétel')));
      }
    });
    draw();
    const off = Net.on('party_state', () => { if (Net.party || !typing()) draw(); }); const off2 = Net.on('error', (m) => toast(m.text));
    // időnkénti frissítés – de gépelés közben nem, különben kiugrik a mezőből
    const iv = setInterval(() => { if (!(typing() && !Net.party)) draw(); }, 4000);
    w.modal.addEventListener('remove', () => {});
    const obs = new MutationObserver(() => { if (!document.body.contains(w.modal)) { off(); off2(); clearInterval(iv); obs.disconnect(); } });
    obs.observe(document.getElementById('ui'), { childList: true });
  });
}
