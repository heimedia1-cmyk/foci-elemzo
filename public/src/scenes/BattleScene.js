// BattleScene – a harci képernyő megjelenítése. A logika a BattleEngine-ben van.
import { BattleEngine } from '../systems/battleEngine.js';
import { MEXIS } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { TYPES, effectiveness } from '../data/types.js';
import { G, addCaught, markSeen, save } from '../systems/state.js';
import { displayName, canEvolve, evolve, xpForLevel } from '../systems/mexi.js';
import { el, pushKeys, choose, UI, hpClass } from '../ui/ui.js';
import { openParty, openBag, offerMove, typeBadge } from '../ui/menus.js';
import { CONFIG } from '../data/config.js';
import { MAPS } from '../data/maps.js';

const wait = (scene, ms) => new Promise(r => scene.time.delayedCall(ms, r));
const tween = (scene, cfg) => new Promise(r => scene.tweens.add({ ...cfg, onComplete: r }));

const BG = {
  mancsfalva: [0x9ad8f8, 0xe8f6ff, 0x7ac85a],
  osveny: [0x8ac8f0, 0xe0f4e8, 0x5ab048],
};

export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }

  init(data) { this.opts = data; }

  create() {
    const s = G.state;
    this.engine = new BattleEngine({
      playerParty: s.party, foeParty: this.opts.foeParty, isTrainer: this.opts.isTrainer,
      trainerName: this.opts.trainerName, inventory: s.inventory, guaranteeCatch: !!this.opts.tutorial,
    });
    this.layout();
    this.buildUi();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize, this); this.ui?.remove(); this.offKeys?.(); });
    this.run();
  }

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
    this.bg?.destroy();
    const g = this.add.graphics().setDepth(-10);
    const night = new Date().getHours() >= 20 || new Date().getHours() < 6;
    const [top, bottom, ground] = night ? [0x1a1850, 0x4a3a80, 0x2f6a3a] : (BG[G.state.map] || BG.osveny);
    g.fillGradientStyle(top, top, bottom, bottom, 1); g.fillRect(0, 0, W, H);
    g.fillStyle(ground, 1); g.fillRect(0, this.fieldH * 0.58, W, H);
    g.fillStyle(Phaser.Display.Color.ValueToColor(ground).darken(15).color, 1);
    g.fillEllipse(this.foePos.x, this.foePos.y + 6 * this.sc, 64 * this.sc, 16 * this.sc);
    g.fillEllipse(this.mePos.x, this.mePos.y + 2 * this.sc, 72 * this.sc, 18 * this.sc);
    // fűcsomók
    g.fillStyle(Phaser.Display.Color.ValueToColor(ground).lighten(12).color, 1);
    for (let i = 0; i < 40; i++) { const x = (i * 97) % W, y = this.fieldH * 0.6 + ((i * 53) % Math.max(1, H - this.fieldH * 0.6)); g.fillRect(x, y, 3 * this.sc / 4, 6 * this.sc / 4); }
    this.bg = g;
  }

  onResize() {
    this.layout();
    if (this.foeSpr) { this.foeSpr.setPosition(this.foePos.x, this.foePos.y).setScale(this.sc / 4); }
    if (this.meSpr) { this.meSpr.setPosition(this.mePos.x, this.mePos.y).setScale(this.sc * 0.27); }
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
    this.msg.addEventListener('pointerdown', () => this._advance?.());
    this.offKeys = pushKeys((e) => this.keyHandler?.(e));
  }

  renderInfo(side) {
    const m = side === 'p' ? this.engine.pm : this.engine.fm;
    const box = side === 'p' ? this.meBox : this.foeBox;
    box.classList.remove('hidden');
    const caughtMark = side === 'f' && !this.opts.isTrainer && G.state.dex.caught[m.species] ? ' 🎾' : '';
    box.innerHTML = '';
    const pct = Math.max(0, m.hp / m.stats.hp * 100);
    box.append(...[
      el('div', { class: 'top' }, el('span', {}, displayName(m), m.shiny ? ' ✨' : '', caughtMark, m.status ? el('span', { class: 'st', style: `background:${STATUS[m.status].color}` }, STATUS[m.status].short) : null), el('span', {}, 'Sz. ' + m.level)),
      el('div', {}, ...MEXIS[m.species].types.map(typeBadge)),
      el('div', { class: 'hpbar ' + hpClass(m.hp, m.stats.hp), style: 'margin-top:4px' }, el('i', { style: `width:${pct}%` })),
      side === 'p' ? el('div', { class: 'hpnum' }, `${m.hp} / ${m.stats.hp}`) : null,
      side === 'p' ? (() => { const a = xpForLevel(m.level), b = xpForLevel(m.level + 1); const x = m.level >= CONFIG.maxLevel ? 100 : (m.xp - a) / (b - a) * 100; return el('div', { class: 'xpbar' }, el('i', { style: `width:${Math.max(0, Math.min(100, x))}%` })); })() : null].filter(Boolean));
  }

  async animateHp(side, hp, max) {
    const box = side === 'p' ? this.meBox : this.foeBox;
    const bar = box.querySelector('.hpbar'); const fill = bar?.querySelector('i');
    if (!fill) return;
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
    if (o.isTrainer) {
      const tr = this.add.sprite(this.foePos.x, this.foePos.y, o.trainerSprite, 0).setOrigin(0.5, 1).setScale(this.sc * 1.1).setAlpha(0);
      await tween(this, { targets: tr, alpha: 1, x: { from: this.scale.width + 100, to: this.foePos.x }, duration: 500 });
      await this.say(`${o.trainerName} kihívott egy Mexi-csatára!`);
      await tween(this, { targets: tr, x: this.scale.width + 120, alpha: 0, duration: 400 });
      tr.destroy();
      this.foeSpr = this.add.sprite(this.foePos.x, this.foePos.y, this.texFor(e.fm, false)).setOrigin(0.5, 1).setScale(0);
      await tween(this, { targets: this.foeSpr, scale: this.sc / 4, duration: 350, ease: 'Back.out' });
      this.renderInfo('f');
      await this.say(`${o.trainerName} előhívta: ${displayName(e.fm)}!`);
    } else {
      this.foeSpr = this.add.sprite(this.scale.width + 100, this.foePos.y, this.texFor(e.fm, false)).setOrigin(0.5, 1).setScale(this.sc / 4);
      await tween(this, { targets: this.foeSpr, x: this.foePos.x, duration: 600, ease: 'Cubic.out' });
      this.renderInfo('f');
      if (e.fm.shiny) { this.sparkle(this.foePos.x, this.foePos.y - 24 * this.sc); await this.say('✨ Csillog! Ez egy SHINY Mexi! ✨'); }
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
          el('button', { class: 'btn', onclick: () => doBag() }, '🎒 Táska'),
          el('button', { class: 'btn', onclick: () => doSwitch() }, '🐶 Mexi'),
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
            d.name, hint, el('small', {}, `${TYPES[d.type].name} • ${d.cat === 'stat' ? 'Státusz' : 'Erő ' + d.power} • PP ${mv.pp}/${d.pp}`));
        });
        const back = el('button', { class: 'btn', onclick: () => { box.remove(); this.movesEl = null; showMain(); } }, '← Vissza');
        box.append(...btns, back);
        this.bbox.prepend(box); this.movesEl = box;
        const pick = (i) => { box.remove(); this.movesEl = null; this.msg.classList.remove('hidden'); resolve({ type: 'move', index: m.moves.every(x => x.pp <= 0) ? -1 : i }); };
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
        case 'msg': await this.say(ev.text); break;
        case 'anim': await this.attackAnim(ev.side, ev.moveType, ev.cat); break;
        case 'damage': {
          const spr = ev.side === 'p' ? this.meSpr : this.foeSpr;
          if (!ev.dot) { this.cameras.main.shake(ev.eff >= 2 ? 220 : 120, ev.eff >= 2 ? 0.008 : 0.004); }
          await tween(this, { targets: spr, alpha: 0.2, yoyo: true, repeat: 2, duration: 70 });
          spr.setAlpha(1);
          await this.animateHp(ev.side, ev.hp, ev.max);
          break; }
        case 'heal': this.sparkle(ev.side === 'p' ? this.mePos.x : this.foePos.x, (ev.side === 'p' ? this.mePos.y : this.foePos.y) - 20 * this.sc, 0x80ff90); await this.animateHp(ev.side, ev.hp, ev.max); break;
        case 'status': this.renderInfo(ev.side); break;
        case 'stat': { const spr = ev.side === 'p' ? this.meSpr : this.foeSpr; spr.setTint(ev.stages > 0 ? 0xff9090 : 0x9090ff); await wait(this, 300); spr.clearTint(); break; }
        case 'faint': { const spr = ev.side === 'p' ? this.meSpr : this.foeSpr; await tween(this, { targets: spr, y: spr.y + 30, alpha: 0, duration: 450 }); break; }
        case 'switch': await this.switchAnim(ev.side); break;
        case 'xp': case 'levelup': this.renderInfo('p'); if (ev.t === 'levelup') { this.sparkle(this.mePos.x, this.mePos.y - 20 * this.sc, 0xfff080); } break;
        case 'canLearn': { const m = G.state.party[ev.index]; this.ui.classList.add('hidden'); await offerMove(m, ev.move); this.ui.classList.remove('hidden'); break; }
        case 'ball': await this.ballAnim(ev.itemId, ev.shakes, ev.caught); break;
        case 'needSwitch': {
          const i = await openParty({ mode: 'pick', title: 'Válassz új Mexit!', canPick: (m) => m.hp > 0, forced: true });
          await this.play(this.engine.forcedSwitch(i));
          break; }
        case 'end': break;
      }
    }
  }

  async switchAnim(side) {
    const e = this.engine;
    if (side === 'p') {
      if (this.meSpr) { await tween(this, { targets: this.meSpr, x: -100, duration: 250 }); this.meSpr.destroy(); }
      this.meSpr = this.add.sprite(this.mePos.x, this.mePos.y, this.texFor(e.pm, true)).setOrigin(0.5, 1).setScale(0);
      await tween(this, { targets: this.meSpr, scale: this.sc * 0.27, duration: 300, ease: 'Back.out' });
      this.renderInfo('p');
    } else {
      this.foeSpr?.destroy();
      this.foeSpr = this.add.sprite(this.foePos.x, this.foePos.y, this.texFor(e.fm, false)).setOrigin(0.5, 1).setScale(0);
      markSeen(e.fm.species);
      await tween(this, { targets: this.foeSpr, scale: this.sc / 4, duration: 300, ease: 'Back.out' });
      this.renderInfo('f');
    }
  }

  async attackAnim(side, type, cat) {
    const att = side === 'p' ? this.meSpr : this.foeSpr;
    const tgt = side === 'p' ? this.foePos : this.mePos;
    const color = Phaser.Display.Color.HexStringToColor(TYPES[type].color).color;
    if (cat === 'stat') {
      this.sparkle(att.x, att.y - 20 * this.sc, color);
      await tween(this, { targets: att, scaleY: att.scaleY * 1.1, yoyo: true, duration: 150 });
      return;
    }
    const dx = side === 'p' ? 30 : -30;
    await tween(this, { targets: att, x: att.x + dx, yoyo: true, duration: 120 });
    const cy = tgt.y - 22 * this.sc;
    if (cat === 'spec') {
      const orb = this.add.circle(att.x, att.y - 20 * this.sc, 6 * this.sc / 4, color).setDepth(20);
      await tween(this, { targets: orb, x: tgt.x, y: cy, duration: 280 });
      orb.destroy();
    }
    for (let i = 0; i < 10; i++) {
      const p = this.add.rectangle(tgt.x, cy, 3 * this.sc, 3 * this.sc, color).setDepth(21);
      const a = Math.random() * Math.PI * 2, r = (14 + Math.random() * 18) * this.sc;
      this.tweens.add({ targets: p, x: tgt.x + Math.cos(a) * r, y: cy + Math.sin(a) * r, alpha: 0, angle: 180, duration: 400, onComplete: () => p.destroy() });
    }
    const flash = this.add.circle(tgt.x, cy, 18 * this.sc, color, 0.5).setDepth(19);
    await tween(this, { targets: flash, scale: 1.6, alpha: 0, duration: 260 });
    flash.destroy();
  }

  sparkle(x, y, color = 0xffffa0) {
    for (let i = 0; i < 12; i++) {
      const st = this.add.star(x, y, 4, 2, 5 * (this.sc / 4), color).setDepth(30);
      const a = (i / 12) * Math.PI * 2, r = (20 + Math.random() * 14) * this.sc;
      this.tweens.add({ targets: st, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, alpha: 0, angle: 360, duration: 700, onComplete: () => st.destroy() });
    }
  }

  async ballAnim(itemId, shakes, caught) {
    const ball = this.add.image(this.mePos.x, this.mePos.y - 30 * this.sc, 'ball_' + itemId).setScale(this.sc * 0.9).setDepth(25);
    const tx = this.foePos.x, ty = this.foePos.y - 20 * this.sc;
    const sx = ball.x, sy = ball.y;
    await tween(this, { targets: { t: 0 }, t: 1, duration: 550, onUpdate: (tw, obj) => { const t = obj.t; ball.x = sx + (tx - sx) * t; ball.y = sy + (ty - sy) * t - Math.sin(t * Math.PI) * 90 * (this.sc / 4); ball.angle = t * 720; } });
    // Mexi bekerül a labdába
    const beam = this.add.circle(tx, ty, 8 * this.sc, 0xffffff, 0.8).setDepth(24);
    this.foeSpr.setTintFill(0xffffff);
    await Promise.all([tween(this, { targets: this.foeSpr, scale: 0, y: ty, duration: 350 }), tween(this, { targets: beam, scale: 2, alpha: 0, duration: 350 })]);
    beam.destroy();
    // leesik
    await tween(this, { targets: ball, y: this.foePos.y - 6 * this.sc, angle: 0, duration: 350, ease: 'Bounce.out' });
    for (let i = 0; i < shakes; i++) {
      await wait(this, 350);
      await tween(this, { targets: ball, angle: i % 2 ? 25 : -25, yoyo: true, duration: 140 });
      this.msg.textContent = '.'.repeat(i + 1);
    }
    await wait(this, 400);
    if (caught) {
      this.sparkle(ball.x, ball.y, 0xfff060);
      ball.setTint(0x999999);
      this._caughtBall = ball;
    } else {
      ball.destroy();
      const pop = this.add.circle(tx, this.foePos.y - 10 * this.sc, 10 * this.sc, 0xffffff, 0.9).setDepth(24);
      this.foeSpr.clearTint().setPosition(this.foePos.x, this.foePos.y);
      await Promise.all([tween(this, { targets: this.foeSpr, scale: this.sc / 4, duration: 300, ease: 'Back.out' }), tween(this, { targets: pop, scale: 2.5, alpha: 0, duration: 300 })]);
      pop.destroy();
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
      if (nick === 0) { const n = prompt('Becenév:', ''); if (n && n.trim()) m.nickname = n.trim().slice(0, 14); }
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
    evolve(m, to);
    s_setCaught(to);
    spr.setTexture(toKey).clearTint();
    this.cameras.main.flash(500);
    this.sparkle(W / 2, H / 2, 0xfff080);
    txt.textContent = `Gratulálok! ${oldName} fejlődött: ${MEXIS[to].name}! 🌟`;
    await wait(this, 2600);
    txt.remove(); dim.destroy(); spr.destroy();
    this.ui.classList.remove('hidden');
  }
}

function s_setCaught(species) { G.state.dex.seen[species] = true; G.state.dex.caught[species] = true; }
