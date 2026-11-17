// WorldScene – felfedezés: térkép, mozgás, NPC-k, találkozások, szimatolás, napszak.
import { MAPS, SOLID, TRAINERS } from '../data/maps.js';
import { MEXIS } from '../data/mexis.js';
import { ITEMS } from '../data/items.js';
import { CONFIG } from '../data/config.js';
import { T, BUILDINGS } from '../art/placeholders.js';
import { DIR_ROW } from '../art/registerArt.js';
import { G, save, markSeen } from '../systems/state.js';
import { createMexi, healFull, rand, randInt, displayName } from '../systems/mexi.js';
import { dialog, choose, toast, UI, el } from '../ui/ui.js';
import { openMainMenu, openParty, openBag, openDex, openShop } from '../ui/menus.js';
import { setupTouch } from '../ui/touch.js';

const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function isNight(d = new Date()) { const h = d.getHours(); const [a, b] = CONFIG.nightHours; return h >= a || h < b; }

export class WorldScene extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const s = G.state;
    this.mapKey = s.map;
    this.map = MAPS[this.mapKey];
    this.tiles = this.map.tiles.map(r => [...r]);
    this.W = this.tiles[0].length; this.H = this.tiles.length;
    this.moving = false;
    this.encounterCooldown = CONFIG.encounterCooldownSteps;
    this.sniffUntil = 0;
    this.sniffMarks = [];
    this.inBattle = false;
    this.applyFlags();

    this.buildMap();
    this.buildBuildings();
    this.buildNpcs();
    this.buildRoamers();

    // játékos
    const gender = s.player.gender === 'lany' ? 'lany' : 'fiu';
    this.player = { x: s.pos.x, y: s.pos.y, dir: s.pos.dir || 'down', sprite: this.add.sprite(0, 0, 'p_' + gender, 0).setOrigin(0).setDepth(10) };
    this.placeSprite(this.player);
    this.setFacing(this.player, this.player.dir);
    // követő Mexi
    this.follower = { x: this.player.x, y: this.player.y, dir: this.player.dir, sprite: this.add.sprite(0, 0, 'px').setOrigin(0).setDepth(9) };
    this.refreshFollower();
    this.placeSprite(this.follower);

    // kamera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.W * T, this.H * T);
    cam.startFollow(this.player.sprite, true, 0.2, 0.2, -T / 2, -T / 2);
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);

    // napszak-réteg
    this.nightLayer = this.add.rectangle(0, 0, this.W * T, this.H * T, 0x1a1050, 0).setOrigin(0).setDepth(50);
    this.updateDaylight();
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.updateDaylight() });

    // irányítás
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ESC,I,J,P,SHIFT,ENTER');
    this.input.keyboard.on('keydown', (e) => this.onKey(e));
    this.touch = setupTouch({
      onA: () => this.interact(),
      onSniff: () => this.sniff(),
      onMenu: () => !UI.busy && !this.moving && openMainMenu(this),
    });

    // animációk (víz, fű)
    this.time.addEvent({ delay: 650, loop: true, callback: () => { this.waterFrame = !this.waterFrame; for (const w of this.waterImgs) w.setFrame(this.waterFrame ? 'water1' : 'water0'); } });
    this.time.addEvent({ delay: 2200, loop: true, callback: () => this.tickNpcs() });
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.tickRoamers() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => { if (!UI.busy && !this.inBattle) G.state.playTimeSec++; } });
    this.time.addEvent({ delay: 30000, loop: true, callback: () => { if (!this.inBattle) save(); } });

    this.buildHud();
    this.events.on('resume', () => this.onResume());
    this.events.once('shutdown', () => this.cleanup());

    this.cameras.main.fadeIn(300);
    if (!G.state.flags.intro) this.time.delayedCall(400, () => this.introStory());
    else toast(this.map.name);
  }

  cleanup() {
    this.input.keyboard.off('keydown');
    this.scale.off('resize', this.fitZoom, this);
    this.touch?.destroy();
    this.hud?.remove();
  }

  fitZoom() {
    const { width: w, height: h } = this.scale;
    const z = Math.max(2, Math.min(5, Math.round(Math.min(w, h) / (T * 13))));
    this.cameras.main.setZoom(z);
    const vw = w / z, vh = h / z;
    // kis térképnél középre
    this.cameras.main.setBounds(Math.min(0, (this.W * T - vw) / 2), Math.min(0, (this.H * T - vh) / 2), Math.max(this.W * T, vw), Math.max(this.H * T, vh));
  }

  // ---------------- Térkép ----------------
  applyFlags() {
    const f = G.state.flags;
    if (this.map.secretBush && f['secret_' + this.mapKey]) this.tiles[this.map.secretBush.y][this.map.secretBush.x] = 'p';
    // a különleges pontok sose legyenek eltorlaszolva
    for (const n of this.map.npcs) if (this.tiles[n.y][n.x] === 'b') this.tiles[n.y][n.x] = '.';
    for (const h of this.map.hidden) if (this.tiles[h.y][h.x] === 'b') this.tiles[h.y][h.x] = '.';
  }

  frameFor(ch, x, y) {
    const v = ((x * 73856093) ^ (y * 19349663)) >>> 0;
    switch (ch) {
      case '"': return 'tall0';
      case '_': return 'path';
      case '~': return 'water0';
      case 's': return 'sand';
      case 'f': return 'flower0';
      case 'g': return 'flower1';
      case 'T': return 'tree';
      case 'b': return 'bush';
      case 'h': return 'hbush';
      case 'R': return 'rock';
      case 'F': return 'fence';
      case 'S': return 'sign';
      case 'p': return 'passage';
      default: return 'grass' + (v % 7 === 0 ? 3 : v % 4);
    }
  }

  buildMap() {
    this.waterImgs = [];
    this.tileImgs = [];
    for (let y = 0; y < this.H; y++) {
      this.tileImgs[y] = [];
      for (let x = 0; x < this.W; x++) {
        const ch = this.tiles[y][x];
        if (['T', 'b', 'R', 'F', 'S', 'h', 'f', 'g'].includes(ch)) this.add.image(x * T, y * T, 'tiles', this.frameFor('.', x, y)).setOrigin(0);
        const img = this.add.image(x * T, y * T, 'tiles', this.frameFor(ch, x, y)).setOrigin(0);
        if (ch === '~') this.waterImgs.push(img);
        if (ch === 'T') img.setDepth(1);
        this.tileImgs[y][x] = img;
      }
    }
    // a térképen kívüli terület: sötét erdő
    const pad = 12;
    for (let y = -pad; y < this.H + pad; y++) for (let x = -pad; x < this.W + pad; x++) {
      if (x >= 0 && y >= 0 && x < this.W && y < this.H) continue;
      this.add.image(x * T, y * T, 'tiles', 'treetop').setOrigin(0);
    }
  }

  buildBuildings() {
    this.blocked = new Set();
    this.doors = [];
    for (const b of this.map.buildings) {
      const def = BUILDINGS[b.key];
      this.add.image(b.x * T, b.y * T, 'b_' + b.key).setOrigin(0).setDepth(2);
      for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
        const X = b.x + i, Y = b.y + j;
        if (X === b.door.x && Y === b.door.y) continue;
        this.blocked.add(X + ',' + Y);
      }
      this.doors.push(b);
    }
  }

  buildNpcs() {
    this.npcs = [];
    for (const n of this.map.npcs) {
      const tr = n.trainer ? TRAINERS[n.trainer] : null;
      const npc = { ...n, home: { x: n.x, y: n.y }, sprite: this.add.sprite(0, 0, 'p_' + n.sprite, 0).setOrigin(0).setDepth(8), talkIdx: 0, tr };
      this.placeSprite(npc); this.setFacing(npc, n.dir);
      this.npcs.push(npc);
    }
  }

  buildRoamers() {
    this.roamers = [];
    for (const r of this.map.roamers || []) this.spawnRoamer(r);
  }

  spawnRoamer(def) {
    for (let tries = 0; tries < 30; tries++) {
      const [ax, ay, aw, ah] = def.area;
      const x = ax + randInt(0, aw - 1), y = ay + randInt(0, ah - 1);
      if (this.isSolid(x, y) || (this.player && this.player.x === x && this.player.y === y)) continue;
      const mon = createMexi(def.species, randInt(def.level[0], def.level[1]));
      const key = 'mm_' + mon.species + (mon.shiny ? '_s' : '');
      const r = { def, mon, x, y, dir: 'down', sprite: this.add.sprite(0, 0, key, 0).setOrigin(0).setDepth(8) };
      this.placeSprite(r);
      if (mon.shiny) this.tweens.add({ targets: r.sprite, alpha: 0.6, yoyo: true, repeat: -1, duration: 400 });
      this.roamers.push(r);
      return r;
    }
  }

  // ---------------- HUD ----------------
  buildHud() {
    this.hud?.remove();
    this.hud = el('div', { id: 'hud' });
    document.getElementById('ui').append(this.hud);
    this.updateHud();
    this.time.addEvent({ delay: 5000, loop: true, callback: () => this.updateHud() });
  }
  updateHud() {
    if (!this.hud) return;
    const now = new Date();
    this.hud.innerHTML = '';
    this.hud.append(
      el('div', { class: 'chip' }, '📍 ' + this.map.name),
      el('div', { class: 'chip' }, (isNight(now) ? '🌙 ' : '☀️ ') + now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })),
      el('div', { class: 'chip' }, '💰 ' + G.state.money),
      el('div', { class: 'chip' }, '🎾 ' + ['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'].reduce((a, k) => a + (G.state.inventory[k] || 0), 0)));
  }

  updateDaylight() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    let a = 0;
    if (h >= 21 || h < 5) a = 0.45; else if (h >= 19) a = (h - 19) / 2 * 0.45; else if (h < 7) a = (7 - h) / 2 * 0.45;
    const color = h >= 17 && h < 21 ? 0x5a2a6a : 0x1a1050;
    this.nightLayer.setFillStyle(color, a);
  }

  // ---------------- Segédek ----------------
  placeSprite(o) { o.sprite.setPosition(o.x * T, o.y * T - 3); }
  setFacing(o, dir, frame = 0) { o.dir = dir; o.sprite.setFrame(DIR_ROW[dir] * 3 + frame); }
  refreshFollower() {
    const lead = G.state.party.find(m => m.hp > 0) || G.state.party[0];
    if (!lead) { this.follower.sprite.setVisible(false); this.follower.mon = null; return; }
    this.follower.mon = lead;
    this.follower.sprite.setTexture('mm_' + lead.species + (lead.shiny ? '_s' : ''), DIR_ROW[this.follower.dir] * 3).setVisible(true);
  }
  tileAt(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? '#' : this.tiles[y][x]; }
  isSolid(x, y, ignore = null) {
    if (SOLID.has(this.tileAt(x, y))) return true;
    if (this.blocked.has(x + ',' + y)) return true;
    if (this.npcs.some(n => n !== ignore && n.x === x && n.y === y)) return true;
    if (this.roamers?.some(r => r !== ignore && r.x === x && r.y === y)) return true;
    return false;
  }
  canControl() { return !UI.busy && !this.moving && !this.inBattle && !this.cutscene; }

  // ---------------- Bemenet ----------------
  onKey(e) {
    if (!this.canControl()) return;
    const k = e.key.toLowerCase();
    if (k === 'e' || k === 'enter') this.interact();
    else if (k === ' ') this.sniff();
    else if (k === 'escape') openMainMenu(this);
    else if (k === 'i') openBag();
    else if (k === 'j') openDex();
    else if (k === 'p') openParty();
  }

  update() {
    if (!this.canControl()) return;
    const K = this.keys;
    let dir = null;
    if (K.W.isDown || K.UP.isDown) dir = 'up';
    else if (K.S.isDown || K.DOWN.isDown) dir = 'down';
    else if (K.A.isDown || K.LEFT.isDown) dir = 'left';
    else if (K.D.isDown || K.RIGHT.isDown) dir = 'right';
    if (!dir && this.touch) dir = this.touch.dir();
    if (dir) this.tryMove(dir, K.SHIFT.isDown);
  }

  tryMove(dir, run = false) {
    const p = this.player;
    if (p.dir !== dir && !this._turnDone) {
      this.setFacing(p, dir);
      this._turnDone = true;
      this.time.delayedCall(70, () => { this._turnDone = false; });
      return;
    }
    const [dx, dy] = DV[dir];
    const nx = p.x + dx, ny = p.y + dy;
    this.setFacing(p, dir);
    // vándorló vad Mexi?
    const roam = this.roamers.find(r => r.x === nx && r.y === ny);
    if (roam) { this.startWildBattle(roam.mon, roam); return; }
    // térképen kívül → átjáró
    const warp = this.map.warps.find(w => w.x === nx && w.y === ny);
    if (this.isSolid(nx, ny) && !warp) {
      this.bump();
      return;
    }
    this.moving = true;
    const dur = run ? 120 : 190;
    // követő a játékos régi helyére lép
    const fx = p.x, fy = p.y;
    const f = this.follower;
    if (f.mon) {
      const fdx = fx - f.x, fdy = fy - f.y;
      const fdir = fdx > 0 ? 'right' : fdx < 0 ? 'left' : fdy > 0 ? 'down' : fdy < 0 ? 'up' : f.dir;
      this.setFacing(f, fdir);
      if (fdx || fdy) {
        this.tweens.add({ targets: f.sprite, x: fx * T, y: fy * T - 3, duration: dur });
        this.animateWalk(f, dur);
      }
      f.x = fx; f.y = fy;
    }
    p.x = nx; p.y = ny;
    this.animateWalk(p, dur);
    this.tweens.add({ targets: p.sprite, x: nx * T, y: ny * T - 3, duration: dur, onComplete: () => { this.moving = false; this.setFacing(p, p.dir); this.onStep(warp); } });
  }

  bump() {
    if (this._bumpT && this.time.now - this._bumpT < 300) return;
    this._bumpT = this.time.now;
  }

  animateWalk(o, dur) {
    o._step = (o._step || 0) + 1;
    const fr = o._step % 2 ? 1 : 2;
    o.sprite.setFrame(DIR_ROW[o.dir] * 3 + fr);
    this.time.delayedCall(dur * 0.6, () => o.sprite.setFrame(DIR_ROW[o.dir] * 3));
  }

  async onStep(warp) {
    const s = G.state; const p = this.player;
    s.pos = { x: p.x, y: p.y, dir: p.dir };
    s.stats.steps++;
    if (warp) { this.warpTo(warp); return; }

    // ajtó?
    const door = this.doors.find(d => d.door.x === p.x && d.door.y === p.y);
    if (door) { await this.enterBuilding(door); return; }

    // eseményzóna
    for (const tr of this.map.triggers) {
      if (p.x >= tr.x && p.x < tr.x + tr.w && p.y >= tr.y && p.y < tr.y + tr.h) { if (await this.runTrigger(tr.id)) return; }
    }

    // edző észrevesz?
    if (await this.checkTrainerSight()) return;

    // magas fű
    const ch = this.tileAt(p.x, p.y);
    if (ch === '"') {
      this.rustle(p.x, p.y);
      if (this.map.encounters && !s.flags.firstFrog && s.flags.starter) {
        s.flags.firstFrog = true;
        const frog = createMexi('beka', 3, { shiny: false });
        this.startWildBattle(frog, null, true);
        return;
      }
      if (this.encounterCooldown > 0) this.encounterCooldown--;
      else if (this.map.encounters && rand() < CONFIG.encounterChanceTallGrass) { this.randomEncounter(); return; }
    }
  }

  rustle(x, y) {
    const img = this.tileImgs[y][x];
    img.setFrame('tall1');
    this.time.delayedCall(250, () => img.setFrame('tall0'));
  }

  // ---------------- Találkozások ----------------
  pickEncounter() {
    const enc = this.map.encounters; const p = this.player;
    const zone = enc.zones.find(z => p.x >= z.rect[0] && p.x < z.rect[0] + z.rect[2] && p.y >= z.rect[1] && p.y < z.rect[1] + z.rect[3]);
    const night = isNight();
    const table = (zone && (night ? zone.night : zone.day)) || (night ? enc.night : enc.day);
    const levels = zone?.levels || enc.levels;
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = rand() * total, species = table[0][0];
    for (const [sp, w] of table) { if ((r -= w) < 0) { species = sp; break; } }
    // a játékos előrehaladása kicsit emeli a szintet
    const bonus = Math.min(2, Math.floor((G.state.defeatedTrainers.length) / 1));
    return createMexi(species, randInt(levels[0], levels[1]) + (rand() < 0.3 ? bonus : 0));
  }

  randomEncounter() { this.startWildBattle(this.pickEncounter()); }

  startWildBattle(mon, roamer = null, tutorial = false) {
    if (!G.state.party.some(m => m.hp > 0)) { dialog('A Mexijeid kimerültek! Előbb gyógyítsd meg őket.'); return; }
    markSeen(mon.species);
    this.launchBattle({ foeParty: [mon], isTrainer: false, tutorial, roamer });
  }

  launchBattle(opts) {
    this.inBattle = true;
    this.moving = false;
    this.touch?.hide();
    this.hud?.classList.add('hidden');
    const cam = this.cameras.main;
    cam.flash(250, 255, 255, 255);
    this.time.delayedCall(260, () => {
      cam.shake(200, 0.004);
      this.time.delayedCall(220, () => {
        this.scene.pause();
        this.scene.launch('Battle', { ...opts, onEnd: (res) => this.afterBattle(res, opts) });
      });
    });
  }

  onResume() {
    this.inBattle = false;
    this.touch?.show();
    this.hud?.classList.remove('hidden');
    this.refreshFollower();
    this.updateHud();
  }

  async afterBattle(res, opts) {
    const s = G.state;
    s.stats.battles++;
    this.encounterCooldown = CONFIG.encounterCooldownSteps;
    if (opts.roamer) {
      const r = opts.roamer;
      if (res === 'win' || res === 'caught') { r.sprite.destroy(); this.roamers.splice(this.roamers.indexOf(r), 1); this.time.delayedCall(45000, () => this.spawnRoamer(r.def)); }
    }
    if (res === 'win') s.stats.wins++;
    if (res === 'lose') {
      this.cutscene = true;
      const lost = Math.floor(s.money * 0.1);
      s.money -= lost;
      await dialog([`Minden Mexid kimerült... Elvesztettél ${lost} érmét.`, 'Gyorsan visszasiettél a gyógyítóállomásra.']);
      for (const m of s.party) healFull(m);
      s.map = s.lastHeal.map; s.pos = { x: s.lastHeal.x, y: s.lastHeal.y + 1, dir: 'down' };
      save();
      this.cutscene = false;
      this.scene.restart();
      return;
    }
    if (opts.trainerNpc && res === 'win') {
      const tr = opts.trainerNpc.tr;
      s.defeatedTrainers.push(opts.trainerNpc.trainer);
      s.money += tr.reward;
      await dialog([tr.lose, `Kaptál ${tr.reward} Mexi-érmét!`], tr.name);
    }
    if (opts.tutorial && res === 'caught') {
      await dialog(['Ügyes! Elkaptad az első vad Mexidet!', 'Nézd meg a Mexidexben (J) vagy a csapatodnál (P).', 'A magas fűben még sok Mexi rejtőzik. Ha megsérültek, a falu gyógyítóállomásán ingyen meggyógyulnak!'], 'Prof. Szimat');
    }
    save();
    this.updateHud();
  }

  // ---------------- Edzők ----------------
  async checkTrainerSight() {
    for (const n of this.npcs) {
      if (!n.tr || G.state.defeatedTrainers.includes(n.trainer)) continue;
      const [dx, dy] = DV[n.dir];
      for (let i = 1; i <= n.tr.sight; i++) {
        const x = n.x + dx * i, y = n.y + dy * i;
        if (x === this.player.x && y === this.player.y) { await this.trainerChallenge(n, i); return true; }
        if (SOLID.has(this.tileAt(x, y)) || this.blocked.has(x + ',' + y)) break;
      }
    }
    return false;
  }

  async trainerChallenge(n, dist) {
    this.cutscene = true;
    const ex = this.add.text(n.x * T + 5, n.y * T - 14, '!', { fontFamily: 'Arial Black', fontSize: '14px', color: '#ff3030', stroke: '#fff', strokeThickness: 3 }).setDepth(60);
    await new Promise(r => this.time.delayedCall(600, r));
    ex.destroy();
    const [dx, dy] = DV[n.dir];
    for (let i = 1; i < dist; i++) {
      n.x += dx; n.y += dy;
      this.animateWalk(n, 180);
      await new Promise(r => this.tweens.add({ targets: n.sprite, x: n.x * T, y: n.y * T - 3, duration: 180, onComplete: r }));
    }
    this.setFacing(this.player, OPP[n.dir]);
    await dialog(n.tr.intro, n.tr.name);
    this.cutscene = false;
    this.startTrainerBattle(n);
  }

  startTrainerBattle(n) {
    if (!G.state.party.some(m => m.hp > 0)) { dialog('A Mexijeid kimerültek!'); return; }
    const team = n.tr.team.map(([sp, lv]) => createMexi(sp, lv, { shiny: false }));
    team.forEach(m => markSeen(m.species));
    this.launchBattle({ foeParty: team, isTrainer: true, trainerName: n.tr.name, trainerSprite: n.sprite.texture.key, trainerNpc: n });
  }

  // ---------------- NPC-k mozgása ----------------
  tickNpcs() {
    if (!this.canControl()) return;
    for (const n of this.npcs) {
      if (!n.wander || rand() < 0.4) continue;
      const dirs = ['up', 'down', 'left', 'right']; const dir = dirs[randInt(0, 3)];
      const [dx, dy] = DV[dir]; const nx = n.x + dx, ny = n.y + dy;
      this.setFacing(n, dir);
      if (Math.abs(nx - n.home.x) > n.wander || Math.abs(ny - n.home.y) > n.wander) continue;
      if (this.isSolid(nx, ny, n) || (nx === this.player.x && ny === this.player.y) || (nx === this.follower.x && ny === this.follower.y) || this.doors.some(d => d.door.x === nx && d.door.y === ny)) continue;
      if (this.tileAt(nx, ny) === '"') continue;
      n.x = nx; n.y = ny;
      this.animateWalk(n, 300);
      this.tweens.add({ targets: n.sprite, x: nx * T, y: ny * T - 3, duration: 300 });
    }
  }

  tickRoamers() {
    if (!this.canControl()) return;
    for (const r of this.roamers) {
      if (rand() < 0.35) continue;
      const dirs = ['up', 'down', 'left', 'right']; const dir = dirs[randInt(0, 3)];
      const [dx, dy] = DV[dir]; const nx = r.x + dx, ny = r.y + dy;
      const [ax, ay, aw, ah] = r.def.area;
      this.setFacing(r, dir);
      if (nx < ax - 1 || ny < ay - 1 || nx > ax + aw || ny > ay + ah) continue;
      if (this.isSolid(nx, ny, r) || (nx === this.follower.x && ny === this.follower.y)) continue;
      if (nx === this.player.x && ny === this.player.y) { this.startWildBattle(r.mon, r); return; }
      r.x = nx; r.y = ny;
      this.animateWalk(r, 260);
      this.tweens.add({ targets: r.sprite, x: nx * T, y: ny * T - 3, duration: 260 });
    }
  }

  // ---------------- Interakció ----------------
  async interact() {
    if (!this.canControl()) return;
    const p = this.player; const [dx, dy] = DV[p.dir];
    const tx = p.x + dx, ty = p.y + dy;
    const npc = this.npcs.find(n => n.x === tx && n.y === ty);
    if (npc) { await this.talkTo(npc); return; }
    if (this.follower.mon && this.follower.x === tx && this.follower.y === ty) {
      const m = this.follower.mon; const lines = ['vidáman csóválja a farkát!', 'rád néz és ugat egyet. Vau!', 'szimatol valamit a földön...', 'boldogan ugrál körülötted!'];
      await dialog(`${displayName(m)} ${lines[randInt(0, lines.length - 1)]}`); return;
    }
    const sign = this.map.signs.find(s => s.x === tx && s.y === ty);
    if (sign) { await dialog(sign.text.split('\n').length > 2 ? sign.text.split('\n') : sign.text); return; }
    const hid = this.map.hidden.find(h => h.x === tx && h.y === ty && !G.state.foundItems.includes(h.id)) || this.map.hidden.find(h => h.x === p.x && h.y === p.y && !G.state.foundItems.includes(h.id));
    if (hid && this.time.now < this.sniffUntil) { await this.pickHidden(hid); return; }
    if (hid) { await dialog('Valami érdekes szag terjeng itt... Próbálj meg szimatolni! (Space / 🐾)'); return; }
    if (this.tileAt(tx, ty) === 'h') {
      if (this.time.now < this.sniffUntil) await this.openSecret(tx, ty);
      else await dialog('Egy sűrű bokor. Furcsa illata van...');
      return;
    }
    if (this.tileAt(tx, ty) === '~') { await dialog('Csillogó, tiszta víz. Mexi szívesen pancsolna benne.'); return; }
  }

  async talkTo(n) {
    this.setFacing(n, OPP[this.player.dir]);
    if (n.tr) {
      if (G.state.defeatedTrainers.includes(n.trainer)) await dialog(n.tr.after, n.tr.name);
      else { await dialog(n.tr.intro, n.tr.name); this.startTrainerBattle(n); }
      return;
    }
    if (n.talk === 'prof') { await this.profTalk(); return; }
    const lines = n.talk;
    await dialog(lines[n.talkIdx % lines.length]);
    n.talkIdx++;
  }

  async profTalk() {
    const s = G.state; const who = 'Prof. Szimat';
    if (!s.flags.starter) {
      this.cutscene = true;
      await dialog([`Á, szia ${s.player.name}! Én Szimat professzor vagyok, a Mexi-kutató.`, 'A MexiVerse tele van különleges Mexikkel: békák, méhecskék, nindzsák... sőt, legendás sárkányok is!', 'Sok Mexi elveszett és szétszóródott a világban. Segítesz megtalálni őket?', 'Fogadd el tőlem ezt a kis barátot. Ő lesz az első társad!'], who);
      const m = createMexi('alap', CONFIG.starterLevel, { shiny: false });
      m.caughtAt = Date.now(); m.caughtWhere = 'Mancsfalva (ajándék)';
      s.party.push(m); s.dex.seen.alap = true; s.dex.caught.alap = true; s.stats.caught++;
      s.inventory.sima_labda = (s.inventory.sima_labda || 0) + 5;
      s.flags.starter = true;
      this.refreshFollower();
      this.follower.x = this.player.x; this.follower.y = this.player.y; this.placeSprite(this.follower);
      await dialog(['Megkaptad: Alap Mexi! 🐶', 'Kaptál 5 Sima Teniszlabdát és egy Mexidexet is!'], null);
      const nick = await choose(['Igen', 'Nem'], { question: 'Adsz neki becenevet?', cancel: false });
      if (nick === 0) { const n = prompt('Becenév:', 'Mexi'); if (n && n.trim()) m.nickname = n.trim().slice(0, 14); }
      await dialog(['A vad Mexiket harcban gyengítsd meg, aztán dobj rájuk teniszlabdát!', 'Minél kevesebb a HP-juk, annál könnyebb elkapni őket.', 'Indulj északra, a Mexi-ösvényre! Ott élnek az első vad Mexik.', 'Ha bajba kerülsz: a gyógyítóállomás jobbra fent van, a bolt jobbra lent.'], who);
      save();
      this.cutscene = false;
      this.updateHud();
      return;
    }
    const caught = Object.keys(s.dex.caught).length;
    if (caught >= 4 && !s.flags.profGift1) {
      s.flags.profGift1 = true; s.inventory.profi_labda = (s.inventory.profi_labda || 0) + 3;
      await dialog([`Hű, már ${caught} különböző Mexit szereztél!`, 'Itt van 3 Profi Teniszlabda jutalmul. Csak így tovább!'], who); save(); return;
    }
    const tips = [`Eddig ${caught} fajta Mexit szereztél meg. Összesen legalább 15 vár rád!`, 'Tudtad? Két egyforma Mexi sem teljesen ugyanolyan: más a természetük és az adottságuk.', 'Nagyon ritkán shiny, különleges színű Mexik is felbukkannak! ✨', 'Éjjel más Mexik bújnak elő a fűből, mint nappal.', 'A típusok számítanak: a Víz eloltja a Tüzet, a Növény legyőzi a Vizet!'];
    await dialog(tips[randInt(0, tips.length - 1)], who);
  }

  async enterBuilding(b) {
    this.cutscene = true;
    const s = G.state;
    const out = () => { this.player.y += 1; this.setFacing(this.player, 'down'); this.placeSprite(this.player); s.pos = { x: this.player.x, y: this.player.y, dir: 'down' }; };
    if (b.action === 'heal') {
      await dialog(['Üdv a Mexi-gyógyítóállomáson! 💖', 'Meggyógyítom a Mexijeidet...'], 'Nővér Mancsi');
      for (const m of s.party) healFull(m);
      this.cameras.main.flash(400, 255, 200, 220);
      s.lastHeal = { map: this.mapKey, x: b.door.x, y: b.door.y };
      await dialog('Kész! A Mexijeid újra teljesen egészségesek. Gyere vissza bármikor!', 'Nővér Mancsi');
    } else if (b.action === 'shop') {
      await dialog('Üdv a boltban! Teniszlabdák, gyógyitalok – minden, ami egy kalandhoz kell!', 'Boltos Bandi');
      await openShop();
    } else if (b.action === 'home') {
      await dialog(['Anya: Szia! Pihenj egy kicsit...', '(A Mexijeid kipihenték magukat.)']);
      for (const m of s.party) healFull(m);
      s.lastHeal = { map: this.mapKey, x: b.door.x, y: b.door.y };
    } else if (b.action === 'lab') {
      await dialog(s.flags.starter ? 'A laborban gőzerővel folyik a kutatás. A professzor kint van a téren.' : 'A labor zárva. A professzor kint van a téren, a labor előtt!');
    } else if (b.action === 'house') {
      await dialog(['Szomszéd: Hallottad? Az ösvényen túl van egy Titokzatos Erdő...', 'Állítólag ott Mágus Mexik varázsolnak a fák között!']);
    }
    out();
    save();
    this.updateHud();
    this.cutscene = false;
  }

  async runTrigger(id) {
    const s = G.state;
    if (id === 'needStarter' && !s.flags.starter) {
      this.cutscene = true;
      await dialog(['Várj! Ne menj ki egyedül a magas fűbe!', 'A vad Mexik megtámadhatnak. Gyere, keresd meg a professzort a labor előtt!'], 'Prof. Szimat');
      this.player.y += 1; this.placeSprite(this.player); this.setFacing(this.player, 'down');
      this.cutscene = false;
      return true;
    }
    if (id === 'forestClosed') {
      this.cutscene = true;
      await dialog(['A Titokzatos Erdő bejárata még le van zárva.', 'Ez a terület a következő frissítésben nyílik meg!']);
      this.player.y += 1; this.placeSprite(this.player); this.setFacing(this.player, 'down');
      this.cutscene = false;
      return true;
    }
    return false;
  }

  async introStory() {
    this.cutscene = true;
    await dialog([`Üdv a MexiVerse-ben, ${G.state.player.name}!`, 'Ez itt Mancsfalva, a Mexi-kalandok kezdőpontja.', 'Szimat professzor a labor előtt vár rád (balra fent). Menj oda és beszélj vele!', 'Mozgás: WASD vagy nyilak • Beszélgetés: E • Menü: Esc']);
    G.state.flags.intro = true; save();
    this.cutscene = false;
  }

  // ---------------- Szimatolás ----------------
  async sniff() {
    if (!this.canControl()) return;
    if (!this.follower.mon) { toast('Előbb szerezz egy Mexit!'); return; }
    if (this.time.now < this.sniffUntil - CONFIG.sniffDurationMs + 1500) return;
    this.sniffUntil = this.time.now + CONFIG.sniffDurationMs;
    toast(`🐾 ${displayName(this.follower.mon)} szimatol...`);
    this.sniffMarks.forEach(m => m.destroy()); this.sniffMarks = [];
    const p = this.player; const R = CONFIG.sniffRadius;
    let found = 0;
    const mark = (x, y, color) => {
      const c = this.add.circle(x * T + 8, y * T + 8, 6, color, 0.55).setDepth(40);
      const t = this.add.text(x * T + 2, y * T - 2, '🐾', { fontSize: '10px' }).setDepth(41);
      this.tweens.add({ targets: c, scale: 1.6, alpha: 0.1, yoyo: true, repeat: -1, duration: 500 });
      this.sniffMarks.push(c, t); found++;
    };
    for (const h of this.map.hidden) if (!G.state.foundItems.includes(h.id) && Math.abs(h.x - p.x) <= R && Math.abs(h.y - p.y) <= R) mark(h.x, h.y, 0xffe060);
    if (this.map.secretBush && this.tileAt(this.map.secretBush.x, this.map.secretBush.y) === 'h') { const b = this.map.secretBush; if (Math.abs(b.x - p.x) <= R + 2 && Math.abs(b.y - p.y) <= R + 2) mark(b.x, b.y, 0xb060ff); }
    // ritka Mexi szagnyoma: a vándorló Mexik felé
    for (const r of this.roamers) if (Math.abs(r.x - p.x) <= R + 4 && Math.abs(r.y - p.y) <= R + 4) mark(r.x, r.y, 0x60d0ff);
    this.time.delayedCall(CONFIG.sniffDurationMs, () => { this.sniffMarks.forEach(m => m.destroy()); this.sniffMarks = []; });
    if (!found) this.time.delayedCall(700, () => toast('Itt most nem érez semmi különöset.'));
  }

  async pickHidden(h) {
    const s = G.state;
    s.foundItems.push(h.id);
    s.inventory[h.item] = (s.inventory[h.item] || 0) + h.qty;
    this.sniffMarks.forEach(m => m.destroy()); this.sniffMarks = [];
    await dialog(`${displayName(this.follower.mon)} kiásott valamit! Találtál: ${h.qty}× ${ITEMS[h.item].name}!`);
    save(); this.updateHud();
  }

  async openSecret(x, y) {
    this.tiles[y][x] = 'p';
    this.tileImgs[y][x].setFrame('passage');
    G.state.flags['secret_' + this.mapKey] = true;
    this.cameras.main.shake(200, 0.003);
    await dialog([`${displayName(this.follower.mon)} kiszimatolt egy rejtett átjárót a bokor mögött!`, 'Egy titkos rét tárult fel... Itt ritka Mexik élnek!']);
    save();
  }

  // ---------------- Térképváltás ----------------
  warpTo(w) {
    const s = G.state;
    s.map = w.to; s.pos = { x: w.tx, y: w.ty, dir: w.dir };
    save();
    this.cutscene = true;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.cutscene = false; this.scene.restart(); });
  }
}

