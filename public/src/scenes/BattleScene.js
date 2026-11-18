// BattleScene – a harci képernyő megjelenítése. A logika a BattleEngine-ben van.
import { BattleEngine } from '../systems/battleEngine.js';
import { MEXIS } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { TYPES, effectiveness } from '../data/types.js';
import { G, addCaught, markSeen, save } from '../systems/state.js';
import { displayName, canEvolve, evolve, xpForLevel } from '../systems/mexi.js';
import { el, pushKeys, choose, UI, hpClass, askText } from '../ui/ui.js';
import { openParty, openBag, offerMove, typeBadge } from '../ui/menus.js';
import { CONFIG } from '../data/config.js';
import { MAPS } from '../data/maps.js';
import { Sfx } from '../systems/sfx.js';
import { questEvent } from '../systems/quests.js';
import { vibrate } from '../ui/touch.js';
import { ensurePoses } from '../art/registerArt.js';
import { introBars, ambient, tickMons, enterFlash, burst, popNumber, impact, dust, lightColumn, typeColor } from '../systems/battleFx.js';

const wait = (scene, ms) => new Promise(r => scene.time.delayedCall(ms, r));
const tween = (scene, cfg) => new Promise(r => scene.tweens.add({ ...cfg, onComplete: r }));

const BG = {
  mancsfalva: [0x9ad8f8, 0xe8f6ff, 0x7ac85a],
  osveny: [0x8ac8f0, 0xe0f4e8, 0x5ab048],
};

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) { this.opts = data; }

  bgName() {
    const map = G.state.map; const night = new Date().getHours() >= 20 || new Date().getHours() < 6;
    const base = { mancsfalva: 'village', osveny: 'route', erdo: 'forest', barlang: 'crystal' }[map] || (map.startsWith('int_') ? 'village' : 'route');
    return { bg: night && (base === 'route' || base === 'forest') ? base + '_night' : base, pad: base };
  }

  preload() {
    const { bg, pad } = this.bgName();
    if (!this.textures.exists('bbg_' + bg)) this.load.image('bbg_' + bg, `assets/battle/bg_${bg}.jpg`);
    for (const k of ['foe', 'me']) if (!this.textures.exists(`bpad_${pad}_${k}`)) this.load.image(`bpad_${pad}_${k}`, `assets/battle/pad_${pad}_${k}.png`);
  }

  /** Effekt-képsor lejátszása egy ponton. */
  fx(keys, x, y, size = 64, ms = 90, depth = 22) {
    return new Promise((resolve) => {
      const imgs = keys.filter(k => this.textures.exists('bfx_' + k));
      if (!imgs.length) { resolve(); return; }
      const im = this.add.image(x, y, 'bfx_' + imgs[0]).setDepth(depth);
      const fit = () => { const t = im.frame; im.setScale(size / Math.max(t.width, t.height)); };
      fit();
      let i = 0;
      const ev = this.time.addEvent({ delay: ms, repeat: imgs.length - 1, callback: () => {
        i++;
        if (i >= imgs.length) { im.destroy(); resolve(); return; }
        im.setTexture('bfx_' + imgs[i]); fit();
      } });
    });
  }

  create() {
    const s = G.state;
    this.engine = new BattleEngine({
      playerParty: s.party, foeParty: this.opts.foeParty, isTrainer: this.opts.isTrainer,
      trainerName: this.opts.trainerName, inventory: s.inventory, guaranteeCatch: !!this.opts.tutorial,
    });
    // a képernyőn éppen látható Mexik (a harc logikája egy körrel előrébb járhat a lejátszásnál)
    this.shown = { p: this.engine.p.active, f: this.engine.f.active };
    this.layout();
    this.buildUi();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize, this); this.ui?.remove(); this.offKeys?.(); });
    this.run();
  }

  update(time) { tickMons(this, time); }

  // ---------------- Elrendezés ----------------
  layout() {
    const { width: W, height: H } = this.scale;
    const uiH = W < 640 ? 230 : 160;
    this.fieldH = H - uiH;
    this.sc = Math.max(2, Math.min(5, Math.floor(Math.min(W / 2.4, this.fieldH * 0.42) / 48)));
    this.foePos = { x: Math.round(W * 0.70), y: Math.round(this.fieldH * 0.52) };
    this.mePos = { x: Math.round(W * 0.28), y: Math.round(this.fieldH * 0.92) };
    this.drawBg();
  }

  drawBg() {
    const { width: W, height: H } = this.scale;
    this.bg?.destroy(); this.padFoe?.destroy(); this.padMe?.destroy();
    const { bg, pad } = this.bgName();
    if (this.textures.exists('bbg_' + bg)) {
      const im = this.add.image(W / 2, this.fieldH * 0.62, 'bbg_' + bg).setDepth(-10);
      im.setScale(Math.max(W / im.width, (this.fieldH * 1.25) / im.height));
      this.bg = im;
    } else {
      const g = this.add.graphics().setDepth(-10); g.fillStyle(0x5ab048, 1); g.fillRect(0, 0, W, H); this.bg = g;
    }
    const unit = this.sc;
    if (this.textures.exists(`bpad_${pad}_foe`)) {
      this.padFoe = this.add.image(this.foePos.x, this.foePos.y + 6 * unit, `bpad_${pad}_foe`).setDepth(-5);
      this.padFoe.setScale((70 * unit) / this.padFoe.width);
      this.padMe = this.add.image(this.mePos.x, this.mePos.y + 4 * unit, `bpad_${pad}_me`).setDepth(-5);
      this.padMe.setScale((84 * unit) / this.padMe.width);
    }
    ambient(this, bg);
  }

  onResize() {
    this.layout();
    if (this.foeSpr) { this.foeSpr.setPosition(this.foePos.x, this.foePos.y).setScale(this.sc / 4); }
    if (this.meSpr) { this.meSpr.setPosition(this.mePos.x, this.mePos.y).setScale(this.sc * 0.27); }
  }

  /** Animációs póz az ellenfél Mexijén (támadás, sérülés, ájulás, győzelem), ha van hozzá kép. */
  shownMon(side) { return side === 'p' ? this.engine.p.party[this.shown.p] : this.engine.f.party[this.shown.f]; }

  pose(side, pose) {
    const spr = side === 'p' ? this.meSpr : this.foeSpr;
    const m = this.shownMon(side);
    if (!spr || !m) return;
    const back = side === 'p';
    if (pose) ensurePoses(this, m.species, m.shiny);
    const key = pose ? `${back ? 'mbp' : 'ma'}_${m.species}_${pose}${m.shiny ? '_s' : ''}` : this.texFor(m, back);
    if (pose && !this.textures.exists(key)) return;
    spr.setTexture(key);
  }

  texFor(m, back) { return (back ? 'mb_' : 'mf_') + m.species + (m.shiny ? '_s' : ''); }

  // ---------------- DOM felület ----------------
  buildUi() {
    this.ui = el('div', { id: 'battle-ui' });
    this.foeBox = el('div', { class: 'binfo foe panel hidden' });
    this.meBox = el('div', { class: 'binfo me panel hidden' });
    this.msg = el('div', { class: 'msg panel' });
    this.acts = el('div', { class: 'acts panel hidden' });
    this.bbox = el('div', { class: 'bbox' }, this.msg, this.acts);
    this.ui.append(this.foeBox, this.meBox, this.bbox);
    document.getElementById('ui').append(this.ui);
    // véletlen dupla érintés ellen: döntés után egy rövid ideig nem léptetjük a szöveget
    this.msg.addEventListener('pointerdown', () => { if (performance.now() - (this._lastAction || 0) < 350) return; this._advance?.(); });
    this.offKeys = pushKeys((e) => this.keyHandler?.(e));
  }

  renderInfo(side) {
    const m = this.shownMon(side);
    const box = side === 'p' ? this.meBox : this.foeBox;
    box.classList.remove('hidden');
    const caughtMark = side === 'f' && !this.opts.isTrainer && G.state.dex.caught[m.species] ? ' 🎾' : '';
    box.innerHTML = '';
    (this._hp ??= {})[side] = m.hp;
    const pct = Math.max(0, m.hp / m.stats.hp * 100);
    box.append(...[
      el('div', { class: 'top' }, el('span', {}, displayName(m), m.shiny ? ' ✨' : '', caughtMark, m.status ? el('span', { class: 'st', style: `background:${STATUS[m.status].color}` }, el('img', { class: 'ico', src: `assets/ui/s_${m.status}.png` }), STATUS[m.status].short) : null), el('span', {}, 'Sz. ' + m.level)),
      el('div', {}, ...MEXIS[m.species].types.map(typeBadge)),
      el('div', { class: 'hpbar ' + hpClass(m.hp, m.stats.hp), style: 'margin-top:4px' }, el('i', { style: `width:${pct}%` })),
      side === 'p' ? el('div', { class: 'hpnum' }, `${m.hp} / ${m.stats.hp}`) : null,
      side === 'p' ? (() => { const a = xpForLevel(m.level), b = xpForLevel(m.level + 1); const x = m.level >= CONFIG.maxLevel ? 100 : (m.xp - a) / (b - a) * 100; return el('div', { class: 'xpbar' }, el('i', { style: `width:${Math.max(0, Math.min(100, x))}%` })); })() : null].filter(Boolean));
  }

  async animateHp(side, hp, max) {
    const box = side === 'p' ? this.meBox : this.foeBox;
    const bar = box.querySelector('.hpbar'); const fill = bar?.querySelector('i');
    if (!fill) return;
    (this._hp ??= {})[side] = hp;
    fill.style.width = Math.max(0, hp / max * 100) + '%';
    bar.className = 'hpbar ' + hpClass(hp, max);
    const num = box.querySelector('.hpnum'); if (num) num.textContent = `${hp} / ${max}`;
    await wait(this, 450);
  }

  say(text, { auto = 1500, wait: w = true } = {}) {
    this.acts.classList.add('hidden');
    this.msg.textContent = text;
    if (!w) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const fin = () => { if (done) return; done = true; this._advance = null; this.keyHandler = null; resolve(); };
      this._advance = fin;
      this.keyHandler = (e) => { if (['Enter', ' ', 'e', 'E'].includes(e.key)) fin(); };
      this.time.delayedCall(auto + Math.min(1200, text.length * 12), fin);
    });
  }

  // ---------------- Fő folyamat ----------------
  async run() {
    const e = this.engine, o = this.opts;
    this.meSpr = null; this.foeSpr = null;
    await introBars(this);
    if (o.isTrainer) {
      const tr = this.add.sprite(this.foePos.x, this.foePos.y, o.trainerSprite, 0).setOrigin(0.5, 1).setScale(this.sc * 1.1).setAlpha(0);
      await tween(this, { targets: tr, alpha: 1, x: { from: this.scale.width + 100, to: this.foePos.x }, duration: 500 });
      await this.say(`${o.trainerName} kihívott egy Mexi-csatára!`);
      await tween(this, { targets: tr, x: this.scale.width + 120, alpha: 0, duration: 400 });
      tr.destroy();
      this.foeSpr = this.add.sprite(this.foePos.x, this.foePos.y, this.texFor(e.fm, false)).setOrigin(0.5, 1).setScale(0);
      enterFlash(this, this.foeSpr);
      await tween(this, { targets: this.foeSpr, scale: this.sc / 4, duration: 350, ease: 'Back.out' });
      this.renderInfo('f');
      await this.say(`${o.trainerName} előhívta: ${displayName(e.fm)}!`);
    } else {
      this.foeSpr = this.add.sprite(this.scale.width + 100, this.foePos.y, this.texFor(e.fm, false)).setOrigin(0.5, 1).setScale(this.sc / 4);
      await tween(this, { targets: this.foeSpr, x: this.foePos.x, duration: 600, ease: 'Cubic.out' });
      this.renderInfo('f');
      if (e.fm.shiny) { this.fx(['c_shiny1', 'c_shiny2', 'c_shiny3', 'c_shiny2', 'c_shiny3'], this.foePos.x, this.foePos.y - 24 * this.sc, 50 * this.sc, 140); await this.say('✨ Csillog! Ez egy SHINY Mexi! ✨'); }
      await this.say(`Egy vad ${displayName(e.fm)} jelent meg!`);
    }
    this.meSpr = this.add.sprite(-100, this.mePos.y, this.texFor(e.pm, true)).setOrigin(0.5, 1).setScale(this.sc * 0.27);
    await tween(this, { targets: this.meSpr, x: this.mePos.x, duration: 450, ease: 'Cubic.out' });
    this.renderInfo('p');
    await this.say(`Rajta, ${displayName(e.pm)}!`);
    if (o.tutorial) {
      await this.say('Prof. Szimat: Ez egy vad Béka Mexi! Előbb gyengítsd meg a „Harc” gombbal!', { auto: 3500 });
    }
    this.turnLoop();
  }

  async turnLoop() {
    while (!this.engine.over) {
      const action = await this.chooseAction();
      if (!action) continue;
      const ev = this.engine.playerAction(action);
      await this.play(ev);
      if (this.opts.tutorial && !this.engine.over && !this._tutHint && this.engine.fm.hp < this.engine.fm.stats.hp * 0.6) {
        this._tutHint = true;
        await this.say('Prof. Szimat: Most gyenge! Nyisd meg a Táskát és dobj rá egy teniszlabdát! 🎾', { auto: 3500 });
      }
    }
    await this.finish();
  }

  chooseAction() {
    return new Promise((resolve) => {
      const e = this.engine;
      this.msg.textContent = `Mit tegyen ${displayName(e.pm)}?`;
      const showMain = () => {
        this.acts.className = 'acts panel'; this.acts.innerHTML = '';
        const b = [
          el('button', { class: 'btn primary', onclick: () => showMoves() }, '⚔️ Harc'),
          el('button', { class: 'btn', onclick: () => doBag() }, el('img', { class: 'ico', src: 'assets/ui/m_bag.png' }), ' Táska'),
          el('button', { class: 'btn', onclick: () => doSwitch() }, el('img', { class: 'ico', src: 'assets/ui/m_party.png' }), ' Mexi'),
          el('button', { class: 'btn', onclick: () => resolve({ type: 'run' }) }, '🏃 Menekülés'),
        ];
        this.acts.append(...b);
        this.msg.classList.remove('hidden');
        if (this.movesEl) { this.movesEl.remove(); this.movesEl = null; }
        let sel = 0; const paint = () => b.forEach((x, i) => x.classList.toggle('sel', i === sel)); paint();
        this.keyHandler = (ev) => {
          const k = ev.key;
          if (k === 'ArrowRight' || k === 'd') sel = (sel + 1) % 4; else if (k === 'ArrowLeft' || k === 'a') sel = (sel + 3) % 4;
          else if (k === 'ArrowDown' || k === 's') sel = (sel + 2) % 4; else if (k === 'ArrowUp' || k === 'w') sel = (sel + 2) % 4;
          else if (['Enter', ' ', 'e', 'E'].includes(k)) { b[sel].click(); return; }
          paint();
        };
      };
      const showMoves = () => {
        const m = e.pm; const foeTypes = MEXIS[e.fm.species].types; const known = G.state.dex.seen[e.fm.species];
        this.acts.classList.add('hidden'); this.msg.classList.add('hidden');
        const box = el('div', { class: 'moves panel' });
        const btns = m.moves.map((mv, i) => {
          const d = MOVES[mv.id]; const mult = d.power ? effectiveness(d.type, foeTypes) : 1;
          const hint = known && d.power ? (mult >= 2 ? el('span', { class: 'hint super' }, 'SZUPER') : mult === 0 ? el('span', { class: 'hint none' }, 'NINCS HATÁS') : mult < 1 ? el('span', { class: 'hint weak' }, 'GYENGE') : null) : null;
          return el('button', { class: 'btn', disabled: mv.pp <= 0, style: `border-left:10px solid ${TYPES[d.type].color}`, onclick: () => pick(i) },
            el('img', { class: 'ico', src: `assets/ui/t_${d.type}.png` }), ' ', d.name, hint, el('small', {}, `${TYPES[d.type].name} • ${d.cat === 'stat' ? 'Státusz' : 'Erő ' + d.power} • PP ${mv.pp}/${d.pp}`));
        });
        const back = el('button', { class: 'btn back', onclick: () => { box.remove(); this.movesEl = null; showMain(); } }, '← Vissza');
        box.append(...btns, back);
        this.bbox.prepend(box); this.movesEl = box;
        let picked = false;
        const pick = (i) => { if (picked) return; picked = true; this._lastAction = performance.now(); box.remove(); this.movesEl = null; this.msg.classList.remove('hidden'); resolve({ type: 'move', index: m.moves.every(x => x.pp <= 0) ? -1 : i }); };
        if (m.moves.every(x => x.pp <= 0)) { pick(-1); return; }
        let sel = 0; const all = [...btns, back]; const paint = () => all.forEach((x, i) => x.classList.toggle('sel', i === sel)); paint();
        this.keyHandler = (ev) => {
          const k = ev.key;
          if (k === 'Escape' || k === 'Backspace') { back.click(); return; }
          if (k === 'ArrowRight' || k === 'd') sel = Math.min(all.length - 1, sel + 1); else if (k === 'ArrowLeft' || k === 'a') sel = Math.max(0, sel - 1);
          else if (k === 'ArrowDown' || k === 's') sel = Math.min(all.length - 1, sel + 2); else if (k === 'ArrowUp' || k === 'w') sel = Math.max(0, sel - 2);
          else if (['Enter', ' ', 'e', 'E'].includes(k)) { if (!all[sel].disabled) all[sel].click(); return; }
          paint();
        };
      };
      const doBag = async () => {
        this.keyHandler = null;
        const r = await openBag({ inBattle: true, isTrainer: this.opts.isTrainer });
        if (r) resolve({ type: 'item', itemId: r.itemId, target: r.target }); else showMain();
      };
      const doSwitch = async () => {
        this.keyHandler = null;
        const i = await openParty({ mode: 'pick', title: 'Melyik Mexi jöjjön?', canPick: (m, idx) => m.hp > 0 && idx !== e.p.active });
        if (i >= 0) resolve({ type: 'switch', index: i }); else showMain();
      };
      showMain();
    });
  }

  // ---------------- Események lejátszása ----------------
  async play(events) {
    for (const ev of events) {
      switch (ev.t) {
        case 'msg': if (ev.text === 'De nem talált!') Sfx.play('miss'); await this.say(ev.text); break;
        case 'anim': this._lastMoveType = ev.moveType; if (ev.cat !== 'stat') Sfx.move(ev.moveType); await this.attackAnim(ev.side, ev.moveType, ev.cat); break;
        case 'damage': {
          if (ev.side === 'f' && ev.eff > 1 && !ev.dot) questEvent('superHits');
          const spr = ev.side === 'p' ? this.meSpr : this.foeSpr;
          Sfx.hit({ crit: ev.crit, eff: ev.dot ? 0.5 : ev.eff }); if (!ev.dot) vibrate('hit');
          if (!ev.dot) { this.cameras.main.shake(ev.eff >= 2 ? 220 : 120, ev.eff >= 2 ? 0.008 : 0.004); }
          this.pose(ev.side, 'hurt');
          { const pos = ev.side === 'p' ? this.mePos : this.foePos; this.fx(ev.crit ? ['crit1', 'crit2', 'crit3'] : ['hit1', 'hit2', 'hit3'], pos.x, pos.y - 26 * this.sc, (ev.crit ? 44 : 30) * this.sc, 80, 23);
            const dmg = Math.max(0, (this._hp?.[ev.side] ?? ev.hp) - ev.hp);
            if (!ev.dot) { const col = typeColor(this._lastMoveType); burst(this, pos.x, pos.y - 24 * this.sc, col); impact(this, { crit: ev.crit, eff: ev.eff, color: col }); }
            if (dmg > 0) popNumber(this, pos.x + 18 * this.sc, pos.y - 44 * this.sc, '-' + dmg, { crit: ev.crit, eff: ev.dot ? 1 : ev.eff }); }
          spr.setTintFill(0xffffff); this.time.delayedCall(70, () => spr.active && spr.clearTint());
          await tween(this, { targets: spr, alpha: 0.2, yoyo: true, repeat: 2, duration: 70 });
          spr.setAlpha(1);
          if (ev.hp > 0) this.time.delayedCall(250, () => this.pose(ev.side, null));
          await this.animateHp(ev.side, ev.hp, ev.max);
          break; }
        case 'heal': { Sfx.play('heal_hp'); const pos = ev.side === 'p' ? this.mePos : this.foePos; { const d = ev.hp - (this._hp?.[ev.side] ?? ev.hp); if (d > 0) popNumber(this, pos.x + 18 * this.sc, pos.y - 44 * this.sc, '+' + d, { heal: true }); } this.fx(['heal1', 'heal2', 'heal1', 'heal2'], pos.x, pos.y - 24 * this.sc, 40 * this.sc, 140); await this.animateHp(ev.side, ev.hp, ev.max); break; }
        case 'status': {
          this.renderInfo(ev.side);
          if (ev.status) { Sfx.play('status'); const pos = ev.side === 'p' ? this.mePos : this.foePos; await this.fx([`st_${ev.status}1`, `st_${ev.status}2`, `st_${ev.status}1`, `st_${ev.status}2`], pos.x, pos.y - 30 * this.sc, 34 * this.sc, 150); }
          break; }
        case 'stat': { Sfx.play(ev.stages > 0 ? 'stat_up' : 'stat_down'); const pos = ev.side === 'p' ? this.mePos : this.foePos; const k = ev.stages > 0 ? 'up' : 'down'; await this.fx([k + '1', k + '2', k + '1', k + '2'], pos.x, pos.y - 26 * this.sc, 34 * this.sc, 140); break; }
        case 'faint': {
          const spr = ev.side === 'p' ? this.meSpr : this.foeSpr;
          this.pose(ev.side, 'faint'); Sfx.play('faint');
          await wait(this, ev.side === 'f' ? 600 : 450);
          { const pos = ev.side === 'p' ? this.mePos : this.foePos; dust(this, pos.x, pos.y); }
          await tween(this, { targets: spr, y: spr.y + 30, alpha: 0, duration: 450 }); break; }
        case 'switch': Sfx.play('switch_in', { delay: 0.2 }); await this.switchAnim(ev.side, ev.index); break;
        case 'xp': case 'levelup': this.renderInfo('p'); if (ev.t === 'levelup') { Sfx.play('levelup', { throttle: 800 }); questEvent('levelUps'); } if (ev.t === 'levelup' && ev.index === this.shown.p) { lightColumn(this, this.mePos.x, this.mePos.y); this.sparkle(this.mePos.x, this.mePos.y - 30 * this.sc); this.fx(['lvl1', 'lvl2', 'lvl1', 'lvl2'], this.mePos.x, this.mePos.y - 30 * this.sc, 50 * this.sc, 150); } break;
        case 'canLearn': { const m = G.state.party[ev.index]; this.ui.classList.add('hidden'); await offerMove(m, ev.move); this.ui.classList.remove('hidden'); break; }
        case 'ball': await this.ballAnim(ev.itemId, ev.shakes, ev.caught); break;
        case 'needSwitch': {
          const i = await openParty({ mode: 'pick', title: 'Válassz új Mexit!', canPick: (m) => m.hp > 0, forced: true });
          await this.play(this.engine.forcedSwitch(i));
          break; }
        case 'end':
          Sfx.play(ev.result === 'lose' || ev.result === 'draw' ? 'lose' : ev.result === 'run' ? 'run' : ev.result === 'caught' ? 'item' : 'win');
          if (ev.result === 'win' && this.meSpr?.alpha > 0) { this.pose('p', 'win'); this.tweens.add({ targets: this.meSpr, y: this.meSpr.y - 12, yoyo: true, repeat: 2, duration: 170 }); await wait(this, 800); }
          if (ev.result === 'lose' && this.foeSpr) { this.pose('f', 'win'); this.tweens.add({ targets: this.foeSpr, y: this.foeSpr.y - 14, yoyo: true, repeat: 2, duration: 180 }); await wait(this, 900); }
          break;
      }
    }
  }

  async switchAnim(side, index) {
    const e = this.engine;
    if (index !== undefined) this.shown[side] = index;
    const mon = this.shownMon(side);
    if (side === 'p') {
      if (this.meSpr) { await tween(this, { targets: this.meSpr, x: -100, duration: 250 }); this.meSpr.destroy(); }
      this.meSpr = this.add.sprite(this.mePos.x, this.mePos.y, this.texFor(mon, true)).setOrigin(0.5, 1).setScale(0);
      enterFlash(this, this.meSpr);
      await tween(this, { targets: this.meSpr, scale: this.sc * 0.27, duration: 300, ease: 'Back.out' });
      this.renderInfo('p');
    } else {
      this.foeSpr?.destroy();
      this.foeSpr = this.add.sprite(this.foePos.x, this.foePos.y, this.texFor(mon, false)).setOrigin(0.5, 1).setScale(0);
      enterFlash(this, this.foeSpr);
      markSeen(mon.species);
      await tween(this, { targets: this.foeSpr, scale: this.sc / 4, duration: 300, ease: 'Back.out' });
      this.renderInfo('f');
    }
  }

  async attackAnim(side, type, cat) {
    const att = side === 'p' ? this.meSpr : this.foeSpr;
    const tgt = side === 'p' ? this.foePos : this.mePos;
    if (cat === 'stat') {
      await tween(this, { targets: att, scaleY: att.scaleY * 1.1, yoyo: true, duration: 150 });
      return;
    }
    const dx = side === 'p' ? 30 : -30;
    this.pose(side, 'attack');
    await tween(this, { targets: att, x: att.x + dx, yoyo: true, duration: 160 });
    this.time.delayedCall(200, () => this.pose(side, null));
    const cy = tgt.y - 24 * this.sc;
    if (cat === 'spec') {
      const orb = this.add.image(att.x, att.y - 22 * this.sc, 'bfx_fx_' + type + '1').setDepth(20);
      orb.setScale((22 * this.sc) / Math.max(orb.width, orb.height));
      if (side === 'f') orb.setFlipX(true);
      await tween(this, { targets: orb, x: tgt.x, y: cy, duration: 300 });
      orb.destroy();
    }
    await this.fx([`fx_${type}1`, `fx_${type}2`, `fx_${type}3`], tgt.x, cy, 52 * this.sc, 110);
  }

  sparkle(x, y, color = 0xffffa0) {
    for (let i = 0; i < 12; i++) {
      const st = this.add.star(x, y, 4, 2, 5 * (this.sc / 4), color).setDepth(30);
      const a = (i / 12) * Math.PI * 2, r = (20 + Math.random() * 14) * this.sc;
      this.tweens.add({ targets: st, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, angle: 360, duration: 700, onComplete: () => st.destroy() });
    }
  }

  async ballAnim(itemId, shakes, caught) {
    const size = 16 * this.sc;
    const ball = this.add.image(this.mePos.x, this.mePos.y - 30 * this.sc, 'ball_' + itemId).setDepth(25);
    ball.setScale(size / ball.width);
    const tx = this.foePos.x, ty = this.foePos.y - 20 * this.sc;
    const sx = ball.x, sy = ball.y;
    const trail = this.add.image(sx, sy, 'bfx_c_fly2').setDepth(24).setAlpha(0.8);
    trail.setScale((size * 1.6) / trail.width);
    Sfx.play('throw');
    await tween(this, { targets: { t: 0 }, t: 1, duration: 550, onUpdate: (tw, obj) => { const t = obj.t; ball.x = sx + (tx - sx) * t; ball.y = sy + (ty - sy) * t - Math.sin(t * Math.PI) * 90 * (this.sc / 2); ball.angle = t * 720; trail.setPosition(ball.x - 8, ball.y); } });
    trail.destroy();
    // a labda kinyílik, a Mexi bekerül
    ball.setVisible(false); Sfx.play('ball_open');
    const fxP = this.fx(['c_open1', 'c_open2', 'c_beam1', 'c_beam2'], tx, ty, 34 * this.sc, 120, 26);
    this.foeSpr.setTintFill(0xffffff);
    await tween(this, { targets: this.foeSpr, scale: 0, y: ty, duration: 420 });
    await fxP;
    ball.setVisible(true).setAngle(0);
    await tween(this, { targets: ball, y: this.foePos.y - 6 * this.sc, duration: 350, ease: 'Bounce.out' });
    for (let i = 0; i < shakes; i++) {
      await wait(this, 300);
      this.fx([i % 2 ? 'c_wob2' : 'c_wob1'], ball.x, ball.y, 26 * this.sc, 280, 26);
      Sfx.play('shake');
      await tween(this, { targets: ball, angle: i % 2 ? 25 : -25, yoyo: true, duration: 140 });
      this.msg.textContent = '.'.repeat(i + 1);
    }
    await wait(this, 350);
    if (caught) {
      Sfx.play('catch'); vibrate('catch');
      await this.fx(['c_ok1', 'c_ok2', 'c_ok3'], ball.x, ball.y, 40 * this.sc, 160, 26);
      ball.setTint(0xbbbbbb);
      this._caughtBall = ball;
    } else {
      ball.destroy(); Sfx.play('escape');
      this.fx(['c_esc1', 'c_esc2'], tx, this.foePos.y - 14 * this.sc, 40 * this.sc, 140, 26);
      this.foeSpr.clearTint().setPosition(this.foePos.x, this.foePos.y);
      await tween(this, { targets: this.foeSpr, scale: this.sc / 4, duration: 300, ease: 'Back.out' });
    }
  }

  // ---------------- Befejezés ----------------
  async finish() {
    const e = this.engine; const s = G.state;
    const res = e.result;
    if (res === 'caught') {
      const m = e.caught;
      m.status = null;
      const where = addCaught(m, MAPS[s.map].name);
      await this.say(where === 'party' ? `${MEXIS[m.species].name} csatlakozott a csapatodhoz!` : `A csapatod tele van, ${MEXIS[m.species].name} a Mexi-tárolóba került.`);
      if (m.shiny) await this.say('✨ Ez egy különleges SHINY Mexi! Bekerült a Mexidex shiny-gyűjteményébe!');
      this.ui.classList.add('hidden');
      const nick = await choose(['Igen', 'Nem'], { question: `Adsz becenevet ennek a Mexinek: ${MEXIS[m.species].name}?`, cancel: true });
      if (nick === 0) { const n = await askText('Becenév:', ''); if (n && n.trim()) m.nickname = n.trim().slice(0, 14); }
      this.ui.classList.remove('hidden');
    }
    // fejlődés
    if (res === 'win' || res === 'caught') {
      for (const m of s.party) {
        const to = canEvolve(m);
        if (to && m.hp > 0) await this.evolveAnim(m, to);
      }
    }
    for (const m of s.party) for (const k of Object.keys(m)) if (k.startsWith('_')) delete m[k];
    save();
    await wait(this, 200);
    this.cameras.main.fadeOut(250);
    await wait(this, 260);
    const onEnd = this.opts.onEnd;
    this.scene.resume('World');
    this.scene.stop();
    onEnd?.(res);
  }

  async evolveAnim(m, to) {
    this.ui.classList.add('hidden');
    const { width: W, height: H } = this.scale;
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0).setDepth(40);
    const spr = this.add.sprite(W / 2, H / 2 + 24 * this.sc, this.texFor(m, false)).setOrigin(0.5, 1).setScale(this.sc * 0.33).setDepth(41);
    const txt = el('div', { class: 'panel', style: 'position:absolute;left:50%;bottom:20px;transform:translateX(-50%);padding:12px 18px;font-weight:800;font-size:18px' }, `Mi történik? ${displayName(m)} fejlődik!`);
    document.getElementById('ui').append(txt);
    const toKey = 'mf_' + to + (m.shiny ? '_s' : '');
    for (let i = 0; i < 8; i++) {
      spr.setTintFill(0xffffff);
      await wait(this, 220 - i * 18);
      spr.setTexture(i % 2 ? toKey : this.texFor(m, false));
      await wait(this, 220 - i * 18);
    }
    const oldName = displayName(m);
    const pendMoves = evolve(m, to);
    s_setCaught(to);
    spr.setTexture(toKey).clearTint();
    this.cameras.main.flash(500);
    this.fx(['c_evo1', 'c_evo2', 'c_evo3'], W / 2, H / 2, 160, 200, 45);
    txt.textContent = `Gratulálok! ${oldName} fejlődött: ${MEXIS[to].name}! 🌟`;
    await wait(this, 2600);
    txt.remove(); dim.destroy(); spr.destroy();
    for (const mv of pendMoves) await offerMove(m, mv);
    this.ui.classList.remove('hidden');
  }
}

function s_setCaught(species) { G.state.dex.seen[species] = true; G.state.dex.caught[species] = true; }
