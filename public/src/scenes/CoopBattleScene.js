// Közös 2v2 harc képernyője. A logika a szerveren fut; ez csak megjeleníti az eseményeket és elküldi a lépéseinket.
import { Net } from '../systems/net.js';
import { G } from '../systems/state.js';
import { MEXIS } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { TYPES } from '../data/types.js';
import { el, pushKeys, choose, hpClass } from '../ui/ui.js';
import { typeBadge } from '../ui/menus.js';
import { Sfx } from '../systems/sfx.js';

const wait = (s, ms) => new Promise(r => s.time.delayedCall(ms, r));
const tween = (s, cfg) => new Promise(r => s.tweens.add({ ...cfg, onComplete: r }));

export class CoopBattleScene extends Phaser.Scene {
  constructor() { super('CoopBattle'); }
  init(data) { this.opts = data; this.state = data.state; }

  preload() {
    const bg = this.opts.bg || 'route';
    if (!this.textures.exists('bbg_' + bg)) this.load.image('bbg_' + bg, `assets/battle/bg_${bg}.jpg`);
    const pad = bg.replace('_night', '');
    for (const k of ['foe', 'me']) if (!this.textures.exists(`bpad_${pad}_${k}`)) this.load.image(`bpad_${pad}_${k}`, `assets/battle/pad_${pad}_${k}.png`);
  }

  create() {
    this.me = this.state.allies.findIndex(a => a.id === Net.sid);
    if (this.me < 0) this.me = 0;
    this.layout();
    this.buildUi();
    this.spr = {};
    this.placeAll();
    this.offs = [
      Net.on('coop_events', (m) => this.queue.push(m)),
      Net.on('coop_wait', (m) => { this.waiting = m.waiting; if (this.awaiting) this.msg.textContent = m.waiting.includes(Net.sid) ? this.msg.textContent : 'Várakozás a társadra...'; }),
      Net.on('coop_end', (m) => { this.endMsg = m; }),
      Net.on('coop_resync', (m) => { if (m.state.turn > this.state.turn) this.queue.push({ events: [{ t: 'msg', text: 'Újracsatlakozva – folytatjuk!' }], state: m.state }); }),
    ];
    this.queue = [];
    this.events.once('shutdown', () => { this.offs.forEach(f => f()); this.ui?.remove(); this.offKeys?.(); });
    this.run();
  }

  layout() {
    const { width: W, height: H } = this.scale;
    const uiH = W < 640 ? 230 : 160;
    this.fieldH = H - uiH;
    this.sc = Math.max(2, Math.min(5, Math.floor(Math.min(W / 2.6, this.fieldH * 0.4) / 48)));
    // Let's Go-stílus: egyetlen, nagyobb vad Mexi középen-jobbra
    this.solo = (this.state?.foes?.length || 2) === 1;
    this.foeScale = this.solo ? 0.27 : 0.2;
    this.pos = {
      f0: this.solo ? { x: W * 0.72, y: this.fieldH * 0.5 } : { x: W * 0.62, y: this.fieldH * 0.5 }, f1: { x: W * 0.84, y: this.fieldH * 0.44 },
      a0: { x: W * 0.2, y: this.fieldH * 0.95 }, a1: { x: W * 0.4, y: this.fieldH * 0.88 },
    };
    const bg = this.opts.bg || 'route';
    if (this.textures.exists('bbg_' + bg)) { const im = this.add.image(W / 2, this.fieldH * 0.62, 'bbg_' + bg).setDepth(-10); im.setScale(Math.max(W / im.width, (this.fieldH * 1.25) / im.height)); }
    const pad = bg.replace('_night', '');
    for (const r of this.solo ? ['f0', 'a0', 'a1'] : ['f0', 'f1', 'a0', 'a1']) {
      const k = `bpad_${pad}_${r[0] === 'f' ? 'foe' : 'me'}`;
      if (this.textures.exists(k)) { const p = this.add.image(this.pos[r].x, this.pos[r].y + 5 * this.sc, k).setDepth(-5); p.setScale(((r[0] === 'f' ? (this.solo ? 72 : 56) : 64) * this.sc) / p.width); }
    }
  }

  monKey(m, back) { return (back ? 'mb_' : 'mf_') + m.species + (m.shiny ? '_s' : ''); }

  placeAll() {
    this.state.foes.forEach((f, i) => this.placeSprite('f' + i, f.mon, f.gone));
    this.state.allies.forEach((a, i) => this.placeSprite('a' + i, a.mon, a.out));
    this.renderInfo();
  }

  placeSprite(r, mon, hidden) {
    this.spr[r]?.destroy();
    if (!mon) return;
    const back = r[0] === 'a';
    const s = this.add.sprite(this.pos[r].x, this.pos[r].y, this.monKey(mon, back)).setOrigin(0.5, 1);
    s.setScale((back ? (r === 'a' + this.me ? 0.24 : 0.2) : this.foeScale) * this.sc).setDepth(r === 'a' + this.me ? 5 : 3);
    if (hidden) s.setVisible(false);
    this.spr[r] = s;
  }

  // ---------------- felület ----------------
  buildUi() {
    this.ui = el('div', { id: 'battle-ui' });
    this.foeBoxes = el('div', { style: 'position:absolute;top:10px;left:10px;display:flex;flex-direction:column;gap:6px' });
    this.allyBoxes = el('div', { style: 'position:absolute;right:10px;display:flex;flex-direction:column;gap:6px', class: 'allyboxes' });
    this.msg = el('div', { class: 'msg panel' });
    this.acts = el('div', { class: 'acts panel hidden' });
    this.bbox = el('div', { class: 'bbox' }, this.msg, this.acts);
    this.ui.append(this.foeBoxes, this.allyBoxes, this.bbox);
    document.getElementById('ui').append(this.ui);
    this.allyBoxes.style.bottom = (this.scale.width < 640 ? 240 : 160) + 'px';
    this.msg.addEventListener('pointerdown', () => this._advance?.());
    this.offKeys = pushKeys((e) => this.keyHandler?.(e));
  }

  box(name, mon, mine) {
    if (!mon) return el('div');
    return el('div', { class: 'binfo panel', style: 'position:relative;width:min(270px,44vw)' + (mine ? ';outline:3px solid #f0a030' : '') },
      el('div', { class: 'top' }, el('span', {}, (name ? name + ': ' : '') + (mon.nickname || MEXIS[mon.species].name), mon.status ? el('span', { class: 'st', style: `background:${STATUS[mon.status].color}` }, STATUS[mon.status].short) : null), el('span', {}, 'Sz. ' + mon.level)),
      el('div', { class: 'hpbar ' + hpClass(mon.hp, mon.max) }, el('i', { style: `width:${Math.max(0, mon.hp / mon.max * 100)}%` })),
      el('div', { class: 'hpnum' }, `${mon.hp} / ${mon.max}`));
  }

  renderInfo() {
    this.foeBoxes.innerHTML = ''; this.allyBoxes.innerHTML = '';
    this.state.foes.forEach(f => { if (!f.gone) this.foeBoxes.append(this.box('', f.mon)); });
    this.state.allies.forEach((a, i) => { if (!a.out) this.allyBoxes.append(this.box(a.name, a.mon, i === this.me)); });
  }

  say(text, auto = 1300) {
    this.acts.classList.add('hidden'); this.msg.textContent = text;
    return new Promise((resolve) => {
      let done = false; const fin = () => { if (done) return; done = true; this._advance = null; this.keyHandler = null; resolve(); };
      this._advance = fin; this.keyHandler = (e) => { if (['Enter', ' ', 'e', 'E'].includes(e.key)) fin(); };
      this.time.delayedCall(auto + Math.min(1000, text.length * 10), fin);
    });
  }

  // ---------------- folyamat ----------------
  async run() {
    const names = this.state.foes.map(f => MEXIS[f.mon.species].name).join(' és ');
    await this.say(`Közös harc! Vad ${names} jelent meg!`);
    if (this.state.allies.some(a => a.mon && a.mon.level < 100)) await this.say(`Szinthatár ebben a harcban: ${this.state.cap}. szint.`, 900);
    while (true) {
      if (this.endMsg && !this.queue.length) break;
      const meA = this.state.allies[this.me];
      if (!meA.out && !this.sentThisTurn) {
        const action = await this.chooseAction();
        Net.send({ t: 'coop_action', action, turn: this.state.turn });
        this.sentThisTurn = true;
        this.msg.textContent = 'Várakozás a társadra...';
        this.awaiting = true;
      } else if (meA.out && !this.queue.length && !this.endMsg) {
        this.msg.textContent = 'A Mexijeid kidőltek – a társad harcol tovább...';
      }
      // események megvárása
      while (!this.queue.length && !this.endMsg) await wait(this, 120);
      this.awaiting = false;
      while (this.queue.length) {
        const m = this.queue.shift();
        await this.play(m.events);
        this.state = m.state;
        this.renderInfo();
        this.sentThisTurn = false;
      }
      if (this.endMsg) break;
    }
    await this.finish();
  }

  chooseAction() {
    return new Promise((resolve) => {
      const a = this.state.allies[this.me]; const mon = a.mon;
      const liveFoes = this.state.foes.map((f, i) => i).filter(i => !this.state.foes[i].gone);
      const pickTarget = async (label) => {
        if (liveFoes.length < 2) return liveFoes[0] ?? 0;
        const i = await choose(liveFoes.map(k => `${MEXIS[this.state.foes[k].mon.species].name} (Sz. ${this.state.foes[k].mon.level})`), { question: label });
        return i < 0 ? null : liveFoes[i];
      };
      const main = () => {
        this.msg.textContent = `Mit tegyen ${mon.nickname || MEXIS[mon.species].name}?`;
        this.acts.className = 'acts panel'; this.acts.innerHTML = '';
        const b = (label, fn, cls = 'btn') => el('button', { class: cls, onclick: fn }, label);
        this.acts.append(
          b('⚔️ Harc', moves, 'btn primary'),
          b('🎾 Labda', ball),
          b('🐶 Mexi', sw),
          b('🏃 Menekülés', () => resolve({ type: 'run' })));
        this.keyHandler = null;
      };
      const moves = () => {
        this.acts.classList.add('hidden'); this.msg.classList.add('hidden');
        const box = el('div', { class: 'moves panel' });
        mon.moves.forEach((mv, i) => {
          const d = MOVES[mv.id];
          box.append(el('button', { class: 'btn', disabled: mv.pp <= 0, style: `border-left:10px solid ${TYPES[d.type].color}`, onclick: async () => {
            box.remove(); this.msg.classList.remove('hidden');
            const selfMove = d.cat === 'stat' && (d.effect?.target === 'self' || d.effect?.heal);
            const t = selfMove ? 0 : await pickTarget('Melyik Mexit támadja?');
            if (t === null) { main(); return; }
            resolve({ type: 'move', index: i, target: t });
          } }, el('img', { class: 'ico', src: `assets/ui/t_${d.type}.png` }), ' ', d.name, el('small', {}, `${TYPES[d.type].name} • ${d.cat === 'stat' ? 'Státusz' : 'Erő ' + d.power} • PP ${mv.pp}/${d.pp}`)));
        });
        box.append(el('button', { class: 'btn', onclick: () => { box.remove(); this.msg.classList.remove('hidden'); main(); } }, '← Vissza'));
        this.bbox.prepend(box);
      };
      const ball = async () => {
        const inv = G.state.inventory;
        const balls = ['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'].filter(k => inv[k] > 0);
        if (!balls.length) { this.msg.textContent = 'Nincs teniszlabdád!'; return; }
        const i = await choose(balls.map(k => `${ITEMS[k].name} ×${inv[k]}`), { question: 'Melyik labdát dobod? (Ha a társad is dob ebben a körben: közös dobás – nagyobb esély, és mindketten megkapjátok!)' });
        if (i < 0) return;
        const t = await pickTarget('Melyik Mexire dobod?');
        if (t === null) return;
        inv[balls[i]]--;
        resolve({ type: 'ball', itemId: balls[i], target: t });
      };
      const sw = async () => {
        const opts = a.party.map((m, i) => ({ m, i })).filter(x => x.m.hp > 0 && x.i !== a.active);
        if (!opts.length) { this.msg.textContent = 'Nincs másik harcképes Mexid.'; return; }
        const i = await choose(opts.map(x => `${x.m.nickname || MEXIS[x.m.species].name} (Sz. ${x.m.level}, ${x.m.hp}/${x.m.max} HP)`), { question: 'Ki jöjjön?' });
        if (i < 0) return;
        resolve({ type: 'switch', index: opts[i].i });
      };
      main();
    });
  }

  async play(events) {
    for (const ev of events) {
      const s = this.spr[ev.ref];
      switch (ev.t) {
        case 'msg': if (ev.text === 'De nem talált!') Sfx.play('miss'); await this.say(ev.text); break;
        case 'anim': {
          if (!s) break;
          const tp = this.pos[ev.target] || this.pos[ev.ref];
          if (ev.cat !== 'stat') Sfx.move(ev.moveType);
          await tween(this, { targets: s, x: s.x + (ev.ref[0] === 'a' ? 26 : -26), yoyo: true, duration: 150 });
          if (ev.cat !== 'stat') await this.fx([`fx_${ev.moveType}1`, `fx_${ev.moveType}2`, `fx_${ev.moveType}3`], tp.x, tp.y - 22 * this.sc, 44 * this.sc);
          break; }
        case 'damage': {
          Sfx.hit({ crit: ev.crit, eff: ev.dot ? 0.5 : ev.eff });
          if (s) { if (!ev.dot) this.cameras.main.shake(120, 0.004); this.fx(ev.crit ? ['crit1', 'crit2', 'crit3'] : ['hit1', 'hit2', 'hit3'], s.x, s.y - 22 * this.sc, 28 * this.sc, 80); await tween(this, { targets: s, alpha: 0.2, yoyo: true, repeat: 2, duration: 70 }); s.setAlpha(1); }
          this.patchMon(ev.ref, { hp: ev.hp }); this.renderInfo(); await wait(this, 250); break; }
        case 'heal': Sfx.play('heal_hp'); this.patchMon(ev.ref, { hp: ev.hp }); this.renderInfo(); if (s) this.fx(['heal1', 'heal2'], s.x, s.y - 20 * this.sc, 34 * this.sc, 160); break;
        case 'status': if (ev.status) Sfx.play('status'); this.patchMon(ev.ref, { status: ev.status }); this.renderInfo(); if (s && ev.status) await this.fx([`st_${ev.status}1`, `st_${ev.status}2`], s.x, s.y - 26 * this.sc, 30 * this.sc, 160); break;
        case 'stat': Sfx.play(ev.stages > 0 ? 'stat_up' : 'stat_down'); if (s) await this.fx(ev.stages > 0 ? ['up1', 'up2'] : ['down1', 'down2'], s.x, s.y - 24 * this.sc, 30 * this.sc, 160); break;
        case 'faint': Sfx.play('faint'); if (s) { if (ev.ref[0] === 'f' && this.textures.exists(`ma_${this.monOf(ev.ref)?.species}_faint`) && !this.monOf(ev.ref)?.shiny) s.setTexture(`ma_${this.monOf(ev.ref).species}_faint`); await wait(this, 400); await tween(this, { targets: s, alpha: 0, y: s.y + 20, duration: 400 }); } break;
        case 'switch': { Sfx.play('switch_in'); const i = +ev.ref[1]; this.state.allies[i].mon = ev.mon; this.state.allies[i].out = false; this.placeSprite(ev.ref, ev.mon); this.renderInfo(); break; }
        case 'party': break;
        case 'ball': {
          const from = this.pos[ev.ref], to = this.pos[ev.target], tgt = this.spr[ev.target];
          const ball = this.add.image(from.x, from.y - 30 * this.sc, (this.textures.exists('ico_ball_' + String(ev.itemId).replace('_labda', '')) ? 'ico_ball_' + String(ev.itemId).replace('_labda', '') : 'ball_' + ev.itemId)).setDepth(25); ball.setScale((14 * this.sc) / ball.width);
          Sfx.play('throw');
          await tween(this, { targets: ball, x: to.x, y: to.y - 20 * this.sc, duration: 450 });
          if (tgt) { tgt.setTintFill(0xffffff); await tween(this, { targets: tgt, scale: 0, duration: 300 }); }
          for (let k = 0; k < ev.shakes; k++) { Sfx.play('shake'); await tween(this, { targets: ball, angle: k % 2 ? 25 : -25, yoyo: true, duration: 140 }); await wait(this, 250); }
          const bk = String(ev.itemId).replace('_labda', ''), own = this.textures.exists(`bfx_cb_${bk}_ok`);
          if (ev.caught) { Sfx.play('catch'); await this.fx(own ? [`cb_${bk}_ok`] : ['c_ok1', 'c_ok2', 'c_ok3'], ball.x, ball.y, 36 * this.sc, 150); ball.destroy(); }
          else { ball.destroy(); Sfx.play('escape'); if (tgt) { tgt.clearTint(); this.fx(own ? [`cb_${bk}_esc`] : ['c_esc1', 'c_esc2'], tgt.x, tgt.y - 14 * this.sc, 36 * this.sc, 140); await tween(this, { targets: tgt, scale: this.foeScale * this.sc, duration: 260 }); } }
          break; }
        case 'end': Sfx.play(ev.result === 'lose' ? 'lose' : ev.result === 'run' ? 'run' : 'win'); break;
      }
    }
  }

  monOf(r) { const i = +r[1]; return r[0] === 'f' ? this.state.foes[i]?.mon : this.state.allies[i]?.mon; }
  patchMon(r, patch) { const m = this.monOf(r); if (m) Object.assign(m, patch); }

  fx(keys, x, y, size = 60, ms = 100) {
    return new Promise((resolve) => {
      const list = keys.filter(k => this.textures.exists('bfx_' + k));
      if (!list.length) { resolve(); return; }
      const im = this.add.image(x, y, 'bfx_' + list[0]).setDepth(30);
      const fit = () => im.setScale(size / Math.max(im.frame.width, im.frame.height)); fit();
      let i = 0; this.time.addEvent({ delay: ms, repeat: list.length - 1, callback: () => { i++; if (i >= list.length) { im.destroy(); resolve(); return; } im.setTexture('bfx_' + list[i]); fit(); } });
    });
  }

  async finish() {
    const m = this.endMsg;
    if (m.note) await this.say(m.note);
    await wait(this, 300);
    this.cameras.main.fadeOut(250);
    await wait(this, 260);
    const onEnd = this.opts.onEnd;
    this.scene.resume('World');
    this.scene.stop();
    onEnd?.(m);
  }
}
