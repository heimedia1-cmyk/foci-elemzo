// WorldScene – felfedezés: térkép, mozgás, NPC-k, találkozások, szimatolás, napszak.
import { MAPS, SOLID, TRAINERS, isSolidCh } from '../data/maps.js';
import { biomeFrame, isWaterFrame, BIOMES } from '../data/world2.js';
import { MEXIS } from '../data/mexis.js';
import { ITEMS } from '../data/items.js';
import { CONFIG } from '../data/config.js';
import { SIT_ORDER, DIR_ROW, TS as T, BUILDING_INFO, PROP_INFO, FURNITURE_INFO } from '../art/registerArt.js';
import { G, save, markSeen } from '../systems/state.js';
import { createMexi, healFull, rand, randInt, displayName } from '../systems/mexi.js';
import { dialog, choose, toast, UI, el, askText } from '../ui/ui.js';
import { openMainMenu, openParty, openBag, openDex, openShop } from '../ui/menus.js';
import { setupTouch } from '../ui/touch.js';
import { getWeather, weatherTable, WEATHER } from '../systems/weather.js';
import { Net } from '../systems/net.js';
import { coopDaily } from '../ui/menus.js';
import { addCaught } from '../systems/state.js';
import { canEvolve, evolve, scaleWildLevel } from '../systems/mexi.js';
import { MOVES } from '../data/moves.js';
import { offerMove, moveReminder, openTransfer } from '../ui/menus.js';
import { BONES } from '../systems/bones.js';
import { questEvent } from '../systems/quests.js';
import { nextGoal } from '../systems/goals.js';
import { Sfx } from '../systems/sfx.js';

const CHAR_SCALE = 0.76; // ember-sprite méret a világban (~1,25 mező magas)
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
    this.player = { x: s.pos.x, y: s.pos.y, dir: s.pos.dir || 'down', sprite: this.add.sprite(0, 0, 'p_' + gender, 0).setOrigin(0.5, 1).setScale(CHAR_SCALE) };
    this.placeSprite(this.player);
    this.setFacing(this.player, this.player.dir);
    // követő Mexi
    this.follower = { x: this.player.x, y: this.player.y, dir: this.player.dir, sprite: this.add.sprite(0, 0, 'px').setOrigin(0.5, 1) };
    this.refreshFollower();
    this.placeSprite(this.follower);

    // kamera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.W * T, this.H * T);
    cam.startFollow(this.player.sprite, true, 0.2, 0.2, 0, T / 2);
    this.fitZoom();
    this.scale.on('resize', this.fitZoom, this);

    // napszak-réteg
    this.nightLayer = this.add.rectangle(-T * 8, -T * 8, (this.W + 16) * T, (this.H + 16) * T, 0x1a1050, 0).setOrigin(0).setDepth(100000);
    this.updateDaylight();
    this.time.addEvent({ delay: 30000, loop: true, callback: () => this.updateDaylight() });
    this.weather = getWeather(this.mapKey, this.map.interior || this.map.cave);
    this.buildWeather();

    // irányítás
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,ESC,I,J,P,SHIFT,ENTER');
    this.input.keyboard.on('keydown', (e) => this.onKey(e));
    this.touch = setupTouch({
      onA: () => this.canControl() && this.interact(),
      onB: () => {},
      onSniff: () => this.canControl() && this.sniff(),
      onMenu: () => !UI.busy && !this.moving && !this.cutscene && openMainMenu(this),
      uiBusy: () => UI.busy,
    });

    // animációk (víz, fű)
    this.time.addEvent({ delay: 650, loop: true, callback: () => { this.waterFrame = !this.waterFrame; for (const w of this.waterImgs) w.setFrame(w._wf ? w._wf[this.waterFrame ? 1 : 0] : (this.waterFrame ? 'water1' : 'water0')); } });
    this.time.addEvent({ delay: 2200, loop: true, callback: () => this.tickNpcs() });
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.tickRoamers() });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => { if (!UI.busy && !this.inBattle) G.state.playTimeSec++; } });
    this.time.addEvent({ delay: 30000, loop: true, callback: () => { if (!this.inBattle) save(); } });

    this.buildHud();
    this.setupNet();
    if (!window._mexiQuestHook) { window._mexiQuestHook = true; window.addEventListener('mexi-quest-done', (e) => this.scene.manager.getScene('World')?.questDone(e.detail)); }
    if (window.MEXI_OPEN_GO) { window.MEXI_OPEN_GO = false; this.time.delayedCall(500, () => import('../go/goMode.js').then(m => m.openGoMode(this))); }
    this.events.on('resume', () => this.onResume());
    this.events.once('shutdown', () => this.cleanup());

    this.cameras.main.fadeIn(300);
    if (!G.state.flags.intro) this.time.delayedCall(400, () => this.introStory());
    else toast(this.map.name);
  }

  cleanup() {
    (this.netOffs || []).forEach(f => f());
    this.partnerObj?.sprite.destroy(); this.partnerObj?.label.destroy(); this.partnerObj?.mexi.destroy();
    this.input.keyboard.off('keydown');
    this.scale.off('resize', this.fitZoom, this);
    this.touch?.destroy();
    this.hud?.remove();
  }

  fitZoom() {
    const { width: w, height: h } = this.scale;
    const z = Math.max(1, Math.min(4, Math.round(Math.min(w, h) / (T * 11))));
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
    const v = (x * 7 + y * 13) % 17;
    switch (ch) {
      case '"': return 'tall0';
      case '=': case 'p': return 'dirt';
      case 'c': return 'cobble';
      case '~': return 'water0';
      case 's': return (x + y) % 3 ? 'sand' : 'sand2';
      case 'f': return 'flowerp';
      case 'w': return 'flowerw';
      case ':': return v % 5 === 0 ? 'gravel' : 'dirtstone';
      case 'g': return 'gravel';
      case 'K': return 'cavefloor';
      case 'd': return 'grassdark';
      case 'B': return 'bridge2';
      default: return v === 0 ? 'grass3' : v === 5 ? 'grass2' : v === 11 ? 'grass4' : 'grass';
    }
  }

  isPath(x, y) { const c = this.tileAt(x, y); return c === '=' || c === 'p' || c === 'c' || c === '#'; }

  buildMap() {
    this.waterImgs = [];
    this.tileImgs = [];
    this.tileProps = {};
    this.solidProps = new Set();
    this.furniture = [];
    if (this.map.interior) { this.buildInterior(); return; }
    const biome = this.map.biome, BI = biome ? BIOMES[biome] : null;
    const propFor = !biome ? { T: 'tree', b: 'bush', r: 'rock', F: 'fence_h', h: 'bush_berry' } : { ...(BI.treeProp ? { T: BI.treeProp } : {}), b: 'bush', r: 'rock' };
    const landAt = (x, y) => { const c = this.tileAt(x, y); return c !== '~' && c !== '#' && c !== 'B' && c !== 'V'; };
    for (let y = 0; y < this.H; y++) {
      this.tileImgs[y] = [];
      for (let x = 0; x < this.W; x++) {
        const ch = this.tiles[y][x];
        let img;
        if (biome) {
          const fr = biomeFrame(biome, ch, x, y, [landAt(x, y - 1), landAt(x, y + 1), landAt(x - 1, y), landAt(x + 1, y)]);
          img = this.add.image(x * T, y * T, fr[0], fr[1]).setOrigin(0).setDepth(-10);
          if (ch === '~' && isWaterFrame(biome, fr)) { img._wf = [BI.base + BI.water[0], BI.base + BI.water[1]]; this.waterImgs.push(img); }
          else if (ch === '~' && BI.snow) this.waterImgs.push(img);
        } else {
          img = this.add.image(x * T, y * T, 'tiles', this.frameFor(ch, x, y)).setOrigin(0).setDepth(-10);
          if (ch === '~') this.waterImgs.push(img);
        }
        this.tileImgs[y][x] = img;
        if (!biome && (ch === '=' || ch === 'p')) this.addFringe(x, y);
        if (propFor[ch]) {
          let key = propFor[ch];
          if (ch === 'T' && (x * 5 + y * 3) % 23 === 0) key = 'tree_orange';
          this.tileProps[x + ',' + y] = this.addProp(key, x, y);
        }
      }
    }
    if (this.map.cave) {
      // barlang: kívül tömör szikla, sötét háttér
      this.cameras.main.setBackgroundColor('#0b0710');
      for (let y = -8; y < this.H + 8; y++) for (let x = -10; x < this.W + 10; x++) {
        if (x >= 0 && y >= 0 && x < this.W && y < this.H) continue;
        this.add.image(x * T, y * T, 'tiles', 'cavefloor').setOrigin(0).setDepth(-10).setTint(0x8a7a90);
      }
      for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) if (this.tiles[y][x] === 'K') this.tileImgs[y][x].setTint(0xa898a8);
      this.buildDarkness();
    } else if (biome && !BI.treeProp) {
      // tájas térkép: kívül a szegély-díszlet folytatódik
      for (let y = -8; y < this.H + 8; y++) for (let x = -10; x < this.W + 10; x++) {
        if (x >= 0 && y >= 0 && x < this.W && y < this.H) continue;
        const fr = biomeFrame(biome, 'T', x + 100, y + 100, [true, true, true, true]);
        this.add.image(x * T, y * T, fr[0], fr[1]).setOrigin(0).setDepth(-10);
      }
    } else {
    // a térképen kívül sűrű erdő
    for (let y = -6; y < this.H + 6; y++) for (let x = -6; x < this.W + 6; x++) {
      if (x >= 0 && y >= 0 && x < this.W && y < this.H) continue;
      if ((x + y) % 2) continue;
      this.add.image(x * T, y * T, 'tiles', 'grassdark').setOrigin(0).setDepth(-10).setDisplaySize(T * 2, T * 2);
    }
    for (let y = -4; y < this.H + 4; y++) for (let x = -4; x < this.W + 4; x++) {
      if (x >= 0 && y >= 0 && x < this.W && y < this.H) continue;
      this.addProp('tree', x, y);
    }
    }
    // egyedi tárgyak
    for (const pr of this.map.props || []) {
      this.addProp(pr.k, pr.x, pr.y);
      if (pr.solid !== false) this.solidProps.add(pr.x + ',' + pr.y);
    }
    for (const sg of this.map.signs) {
      if (!sg.noPost) this.addProp('signpost', sg.x, sg.y);
      this.solidProps.add(sg.x + ',' + sg.y);
    }
  }

  /** Barlangi sötétség: a játékos körül fénykör (fáklya), máshol homály. */
  buildDarkness() {
    const key = 'cave_dark2';
    if (!this.textures.exists(key)) {
      const S = 1024; const c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(S / 2, S / 2, 30, S / 2, S / 2, 115);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.94)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      this.textures.addCanvas(key, c);
    }
    this.darkness = this.add.image(0, 0, key).setDepth(98000).setScale(2.2).setTint(0x06030c);
    this.darkness.setCrop(0, 0, 1024, 1024);
  }

  buildInterior() {
    const th = this.map.theme;
    const RUG = { 1: 'rugTL', 2: 'rugT', 3: 'rugTR', 4: 'rugL', 5: 'rugC', 6: 'rugR', 7: 'rugBL', 8: 'rugB', 9: 'rugBR' };
    this.cameras.main.setBackgroundColor('#140e20');
    for (let y = 0; y < this.H; y++) {
      this.tileImgs[y] = [];
      for (let x = 0; x < this.W; x++) {
        const ch = this.tiles[y][x];
        const custom = th.tiles?.[ch];
        if (custom) { this.tileImgs[y][x] = this.add.image(x * T, y * T, custom).setOrigin(0).setDisplaySize(T, T).setDepth(-10); continue; }
        const f = ch === 'W' ? th.wall : ch === 'w' ? th.win : ch === 'P' ? th.pic : ch === 'E' ? 'exitmat' : RUG[ch] || th.floor;
        this.tileImgs[y][x] = this.add.image(x * T, y * T, 'itiles', f).setOrigin(0).setDepth(-10);
      }
    }
    // a szoba sötét kerete
    const g = this.add.graphics().setDepth(-9);
    g.lineStyle(6, 0x2a1a10, 1).strokeRect(-3, -3, this.W * T + 6, this.H * T + 6);
    for (const fu of this.map.furniture || []) {
      const w = fu.w || 1, h = fu.h || 1;
      const img = this.add.image(fu.x * T + (w * T) / 2, (fu.y + 1) * T + (fu.wall ? 0 : 2), 'fu_' + fu.k).setOrigin(0.5, 1);
      img.setDepth(fu.wall ? -8 : (fu.solid === false ? -8 : (fu.y + 1) * T - 1));
      const tiles = [];
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) tiles.push([fu.x + i, fu.y - j]);
      if (fu.solid !== false && !fu.wall) for (const [x, y] of tiles) this.solidProps.add(x + ',' + y);
      this.furniture.push({ ...fu, tiles });
    }
  }

  furnitureAt(x, y) { return this.furniture.find(f => f.tiles.some(([a, b]) => a === x && b === y)); }

  addFringe(x, y) {
    const sides = [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]];
    for (const [dx, dy, f] of sides) {
      const n = this.tileAt(x + dx, y + dy);
      if (n === '=' || n === 'p' || n === 'c' || n === '#') continue;
      this.add.image(x * T, y * T, 'fringe', f).setOrigin(0).setDepth(-9);
    }
  }

  addProp(key, x, y) {
    const info = PROP_INFO[key];
    const tex = PROP_INFO[key] ? 'pr_' + key : 'fu_' + key;
    const img = this.add.image(x * T + T / 2, y * T + T + (key.startsWith('tree') ? 4 : 0), tex).setOrigin(0.5, 1);
    img.setDepth(y * T + T - 1);
    return img;
  }

  buildBuildings() {
    this.blocked = new Set();
    this.doors = [];
    for (const b of this.map.buildings) {
      const info = BUILDING_INFO[b.key];
      const tw = info.tw, th = Math.max(3, Math.round(info.h / T) - 1);
      const top = b.y - th + 1;
      this.add.image(b.x * T + (tw * T) / 2, (b.y + 1) * T + 4, 'b_' + b.key).setOrigin(0.5, 1).setDepth((b.y + 1) * T - 1);
      b.door = { x: b.x + Math.floor(tw / 2) + (b.doorDx || 0), y: b.y };
      for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) {
        const X = b.x + i, Y = top + j;
        if (X === b.door.x && Y === b.door.y) continue;
        this.blocked.add(X + ',' + Y);
      }
      this.doors.push(b);
    }
  }

  buildNpcs() {
    this.npcs = [];
    for (let n of this.map.npcs) {
      if (n.unlock && G.state.defeatedTrainers.includes(n.unlock) && n.unlockAt) n = { ...n, ...n.unlockAt };
      const tr = n.trainer ? TRAINERS[n.trainer] : null;
      const npc = { ...n, home: { x: n.x, y: n.y }, sprite: this.add.sprite(0, 0, 'p_' + n.sprite, 0).setOrigin(0.5, 1).setScale(CHAR_SCALE), talkIdx: 0, tr };
      this.placeSprite(npc); this.setFacing(npc, n.dir);
      this.npcs.push(npc);
    }
  }

  buildRoamers() {
    this.roamers = [];
    const cd = G.state.roamerCD || {};
    (this.map.roamers || []).forEach((r, i) => {
      r._id = this.mapKey + ':' + i;
      const left = (cd[r._id] || 0) - Date.now();
      if (left > 0) this.time.delayedCall(left, () => this.spawnRoamer(r));
      else this.spawnRoamer(r);
    });
  }

  spawnRoamer(def) {
    for (let tries = 0; tries < 30; tries++) {
      const [ax, ay, aw, ah] = def.area;
      const x = ax + randInt(0, aw - 1), y = ay + randInt(0, ah - 1);
      if (this.isSolid(x, y) || (this.player && this.player.x === x && this.player.y === y)) continue;
      const mon = createMexi(def.species, scaleWildLevel(randInt(def.level[0], def.level[1]), def.level[1], G.state.party));
      const key = 'mm_' + mon.species + (mon.shiny ? '_s' : '');
      const r = { def, mon, x, y, dir: 'down', sprite: this.add.sprite(0, 0, key, 0).setOrigin(0.5, 1) };
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
    const goal = nextGoal(G.state);
    this.hud.append(...[
      el('div', { class: 'chip goal', title: goal.long, onclick: () => !UI.busy && dialog(goal.long, '🎯 Következő cél') }, '🎯 ' + goal.short),
      el('div', { class: 'chip' }, '📍 ' + this.map.name),
      el('div', { class: 'chip' }, (isNight(now) ? '🌙 ' : '☀️ ') + now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })),
      this.map.interior ? null : el('div', { class: 'chip' }, WEATHER[this.weather].icon + ' ' + WEATHER[this.weather].name),
      Net.party ? el('div', { class: 'chip' }, '👥 ' + (Net.partner ? Net.partner.name + (this.partnerNear() ? ' (közel)' : '') : 'Party: ' + Net.party.code)) : null,
      el('div', { class: 'chip' }, el('img', { src: 'assets/ui/coin.png', class: 'ico' }), ' ' + G.state.money),
      el('div', { class: 'chip' }, el('img', { src: 'assets/ui/ball_sima.png', class: 'ico' }), ' ' + ['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'].reduce((a, k) => a + (G.state.inventory[k] || 0), 0))].filter(Boolean));
  }

  updateDaylight() {
    if (this.map.interior) { this.nightLayer.setFillStyle(0x000000, 0); return; }
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    let a = 0;
    if (h >= 21 || h < 5) a = 0.45; else if (h >= 19) a = (h - 19) / 2 * 0.45; else if (h < 7) a = (7 - h) / 2 * 0.45;
    const color = h >= 17 && h < 21 ? 0x5a2a6a : 0x1a1050;
    this.nightLayer.setFillStyle(color, a);
  }

  // ---------------- Közös játék ----------------
  setupNet() {
    Net.connect();
    this.netOffs = [
      Net.on('partner_pos', () => this.drawPartner()),
      Net.on('party_state', () => { this.drawPartner(); this.updateHud(); }),
      Net.on('toast', (m) => toast(m.text)),
      Net.on('coop_request', (m) => {
        const ok = this.canControl() && !this.inBattle && G.state.party.some(x => x.hp > 0);
        Net.send({ t: 'coop_party', ok, party: G.state.party, inventory: G.state.inventory });
        if (ok) { this.cutscene = true; this.moving = false; this.time.delayedCall(5000, () => { if (!this.inBattle) this.cutscene = false; }); }
      }),
      Net.on('coop_declined', () => {
        this.cutscene = false;
        if (this._coopFallback) { const f = this._coopFallback; this._coopFallback = null; f(); }
      }),
      Net.on('coop_begin', (m) => { this._coopFallback = null; this.launchCoop(m); }),
    ];
    this.sendPos();
    this.drawPartner();
  }

  sendPos() {
    const lead = G.state.party.find(m => m.hp > 0) || G.state.party[0];
    Net.send({ t: 'pos', map: this.mapKey, x: this.player.x, y: this.player.y, dir: this.player.dir, lead: lead ? { species: lead.species, shiny: lead.shiny } : null });
  }

  drawPartner() {
    const pr = Net.partner; const pos = pr?.pos;
    const show = Net.party && pr && pos && pos.map === this.mapKey && pr.online !== false;
    if (!show) { if (this.partnerObj) { this.partnerObj.sprite.destroy(); this.partnerObj.label.destroy(); this.partnerObj.mexi.destroy(); this.partnerObj = null; } return; }
    if (!this.partnerObj) {
      const sprite = this.add.sprite(this.px(pos.x), this.py(pos.y), 'p_' + (pr.gender === 'lany' ? 'lany' : 'fiu'), 0).setOrigin(0.5, 1).setScale(CHAR_SCALE).setTint(0xd8e8ff);
      const label = this.add.text(0, 0, pr.name, { fontFamily: 'Trebuchet MS, sans-serif', fontSize: '11px', color: '#fff', stroke: '#1b1430', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(99990);
      const mexi = this.add.sprite(this.px(pos.x), this.py(pos.y + 1), 'px').setOrigin(0.5, 1);
      this.partnerObj = { sprite, label, mexi, x: pos.x, y: pos.y, lead: null };
    }
    const o = this.partnerObj;
    if (pos.lead && (!o.lead || o.lead.species !== pos.lead.species)) { o.lead = pos.lead; o.mexi.setTexture('mm_' + pos.lead.species + (pos.lead.shiny ? '_s' : ''), 0); }
    const [dx, dy] = DV[pos.dir] || [0, 1];
    const mx = pos.x - dx, my = pos.y - dy;
    this.tweens.add({ targets: o.mexi, x: this.px(o.x), y: this.py(o.y), duration: 200 });
    o.x = pos.x; o.y = pos.y;
    o.sprite.setFrame(DIR_ROW[pos.dir || 'down'] * 3);
    o.mexi.setFrame(DIR_ROW[pos.dir || 'down'] * 3);
    this.tweens.add({ targets: o.sprite, x: this.px(pos.x), y: this.py(pos.y), duration: 200, onUpdate: () => { o.label.setPosition(o.sprite.x, o.sprite.y - 46); o.sprite.setDepth(o.sprite.y); o.mexi.setDepth(o.mexi.y); } });
  }

  partnerNear() {
    const pr = Net.partner;
    return Net.online && Net.party && pr?.pos && pr.pos.map === this.mapKey && pr.online !== false && Math.abs(pr.pos.x - this.player.x) + Math.abs(pr.pos.y - this.player.y) <= 10;
  }

  /** Közös találkozás kérése; ha a társ nem ér rá, egyedül harcolsz. */
  tryCoopEncounter(fallback) {
    const enc = this.map.encounters; const p = this.player;
    const zone = enc.zones.find(z => p.x >= z.rect[0] && p.x < z.rect[0] + z.rect[2] && p.y >= z.rect[1] && p.y < z.rect[1] + z.rect[3]);
    const night = isNight();
    const table = weatherTable((zone && (night ? zone.night : zone.day)) || (night ? enc.default.night : enc.default.day), this.weather);
    this.cutscene = true;
    this._coopFallback = fallback;
    Net.send({ t: 'coop_encounter', map: this.mapKey, x: this.player.x, y: this.player.y, party: G.state.party, inventory: G.state.inventory, bg: this.map.biome ? ({ swamp: 'swamp', neon: 'neon', shrine: 'shrine', volcano: 'volcano', snow: 'crystal' })[this.map.biome] : this.mapKey === 'osveny' ? (night ? 'route_night' : 'route') : this.mapKey === 'erdo' ? (night ? 'forest_night' : 'forest') : this.mapKey === 'barlang' ? 'crystal' : 'village' });
  }

  launchCoop(m) {
    Sfx.play('encounter');
    for (const x of m.state.allies) G.state.dex.seen ||= {};
    for (const f of m.state.foes) G.state.dex.seen[f.mon.species] = true;
    this.inBattle = true; this.moving = false; this.cutscene = false;
    this.touch?.hide(); this.hud?.classList.add('hidden');
    this.cameras.main.flash(250, 255, 255, 255);
    this.time.delayedCall(300, () => {
      this.scene.pause();
      this.scene.launch('CoopBattle', { state: m.state, bg: m.bg, onEnd: (res) => this.afterCoop(res) });
    });
  }

  async afterCoop(r) {
    const s = G.state;
    this.cutscene = true;
    // a szerver által visszaküldött, frissített csapat (XP, HP, státusz, PP)
    if (Array.isArray(r.party) && r.party.length === s.party.length) s.party = r.party;
    if (r.inventory) for (const [k, v] of Object.entries(r.inventory)) s.inventory[k] = Math.max(0, Math.min(s.inventory[k] ?? v, v));
    s.money += r.coins || 0;
    const d = coopDaily();
    const lines = [];
    for (const m of r.caught || []) { const where = addCaught(m, 'Közös harc – ' + this.map.name); lines.push(`${MEXIS[m.species].name} ${where === 'party' ? 'csatlakozott a csapatodhoz' : 'a tárolóba került'}!`); d.caught++; }
    if (r.result === 'win') { d.wins++; d.foes += 2; s.stats.wins++; }
    if (r.totalXp) lines.push(`A csapatod összesen ${r.totalXp} XP-t és ${r.coins} érmét kapott.`);
    for (const e of r.xpEvents || []) {
      if (e.type === 'levelup') lines.push(`${e.name} elérte a(z) ${e.level}. szintet!`);
      if (e.type === 'learned') lines.push(`${e.name} megtanulta: ${MOVES[e.move].name}!`);
    }
    if (lines.length) await dialog(lines);
    for (const e of r.xpEvents || []) if (e.type === 'canLearn' && s.party[e.index]) await offerMove(s.party[e.index], e.move);
    for (const m of s.party) { const to = canEvolve(m); if (to && m.hp > 0) { const old = displayName(m); const pend = evolve(m, to); s.dex.seen[to] = s.dex.caught[to] = true; this.cameras.main.flash(500); Sfx.play('evolve'); await dialog(`Mi történik?! ${old} fejlődött: ${MEXIS[to].name}! 🌟`); for (const mv of pend) await offerMove(m, mv); } }
    if (r.result === 'lose' || r.result === 'draw') {
      await dialog(r.result === 'draw' ? 'Döntetlen! Mindkét oldal utolsó Mexije egyszerre esett ki. Visszasiettél gyógyulni.' : 'Mindkettőtök Mexijei kidőltek... Visszasiettél gyógyulni.');
      for (const m of [...s.party, ...(s.storage || [])]) healFull(m);
      s.map = s.lastHeal.map; s.pos = { x: s.lastHeal.x, y: s.lastHeal.y, dir: 'down' }; if (s.lastHeal.ret) s.returnTo = s.lastHeal.ret;
      save(); this.cutscene = false; this.scene.restart(); return;
    }
    this.encounterCooldown = CONFIG.encounterCooldownSteps;
    save(); this.refreshFollower(); this.updateHud();
    this.cutscene = false;
  }

  // ---------------- Időjárás ----------------
  buildWeather() {
    const w = this.weather; const cam = this.cameras.main; const { width: W, height: H } = this.scale;
    const z = cam.zoom; const vw = W / z + 64, vh = H / z + 64;
    this.wxLayers = [];
    const tile = (key, alpha, speedX, speedY, scale = 1) => {
      const ts = this.add.tileSprite(0, 0, vw, vh, key).setOrigin(0).setScrollFactor(0).setDepth(99000).setAlpha(alpha).setTileScale(scale);
      this.wxLayers.push({ ts, speedX, speedY });
    };
    if (w === 'rain') {
      tile('w_rain', 0.55, -0.6, 7);
      tile('w_rain', 0.35, -0.4, 5, 0.7);
      this.time.addEvent({ delay: 220, loop: true, callback: () => {
        const x = cam.worldView.x + Math.random() * cam.worldView.width, y = cam.worldView.y + Math.random() * cam.worldView.height;
        const r = this.add.image(x, y, 'w_ripple').setDepth(-5).setAlpha(0.7).setScale(0.6);
        this.tweens.add({ targets: r, scale: 1.1, alpha: 0, duration: 600, onComplete: () => r.destroy() });
      } });
      this.time.addEvent({ delay: 15000, loop: true, callback: () => { if (Math.random() < 0.35) cam.flash(180, 255, 255, 230); } });
    }
    if (w === 'snow') { tile('w_snow2', 0.8, 0.3, 1.2); tile('w_snow1', 0.6, -0.2, 0.7, 1.4); }
    if (w === 'fog') {
      for (let i = 0; i < 7; i++) {
        const f = this.add.image(Math.random() * vw, Math.random() * vh, 'w_fog').setScrollFactor(0).setDepth(99000).setAlpha(0.35).setScale(1.8 + Math.random());
        this.tweens.add({ targets: f, x: f.x + 120, duration: 9000 + Math.random() * 6000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    }
    if (w === 'wind') {
      this.time.addEvent({ delay: 900, loop: true, callback: () => {
        const l = this.add.image(-20, Math.random() * vh * 0.8, 'w_leaves').setScrollFactor(0).setDepth(99000).setScale(0.5);
        this.tweens.add({ targets: l, x: vw + 40, y: l.y + 80, angle: 360, duration: 4000 + Math.random() * 2000, onComplete: () => l.destroy() });
      } });
    }
    if (!this.map.interior && w !== 'rain' && isNight()) {
      for (let i = 0; i < 4; i++) {
        const f = this.add.image(Math.random() * vw, Math.random() * vh, 'w_fireflies').setScrollFactor(0).setDepth(99001).setScale(0.8).setAlpha(0);
        this.tweens.add({ targets: f, alpha: 0.9, y: f.y - 20, duration: 1800 + i * 300, yoyo: true, repeat: -1, delay: i * 500 });
      }
    }
  }

  // ---------------- Interakció a Mexivel ----------------
  emote(target, kind, ms = 1200) {
    if (kind === 'excl') Sfx.play('excl'); else if (kind === 'heart') Sfx.play('heart'); else if (kind === 'zzz' || kind === 'sleep') Sfx.play('snore');
    const e = this.add.image(target.sprite.x, target.sprite.y - 42, 'emo_' + kind).setDepth(99500).setScale(0.7);
    this.tweens.add({ targets: e, y: e.y - 8, duration: 300, yoyo: true, repeat: 1 });
    this.time.delayedCall(ms, () => e.destroy());
    return e;
  }

  async playWithMexi() {
    const m = this.follower.mon; const name = displayName(m);
    const c = await choose(['🤚 Simogatás', '🦴 Etetés', '🎾 Játék', 'Mégse'], { question: `Mit csinálsz ${name}-val/-vel?` });
    if (c < 0 || c === 3) return;
    const kind = ['pet', 'eat', 'happy'][c];
    this.cutscene = true;
    const f = this.follower; f.sprite.setVisible(false);
    const frames = m.species === 'alap' ? [1, 2, 3].map(i => `ia_${kind}${i}`) : null;
    const spr = frames ? this.add.image(f.sprite.x, f.sprite.y + 6, frames[0]).setOrigin(0.5, 1).setDepth(f.sprite.y + 1).setScale(0.6) : null;
    if (!spr) { f.sprite.setVisible(true); this.tweens.add({ targets: f.sprite, y: f.sprite.y - 10, yoyo: true, repeat: 3, duration: 150 }); }
    if (frames) for (let i = 0; i < 6; i++) { spr.setTexture(frames[Math.min(2, Math.floor(i / 2))]); await new Promise(r => this.time.delayedCall(260, r)); }
    else await new Promise(r => this.time.delayedCall(1000, r));
    this.emote(f, ['heart', 'note', 'sparkle'][c]); Sfx.play(c === 2 ? 'bark' : 'yip');
    m.friendship = Math.min(255, (m.friendship || 0) + (c === 1 ? 3 : 2));
    const lines = [`${name} boldogan behunyja a szemét. Imádja, ha simogatod!`, `${name} jóízűen megette a falatot. Nyamm!`, `${name} kergeti a teniszlabdát és hozza vissza. Vau!`];
    await dialog(lines[c]);
    spr?.destroy(); f.sprite.setVisible(true);
    this.cutscene = false; save();
  }

  // ---------------- Segédek ----------------
  placeSprite(o) { o.sprite.setPosition(this.px(o.x), this.py(o.y)); o.sprite.setDepth(o.sprite.y); }
  px(x) { return x * T + T / 2; }
  py(y) { return y * T + T - 2; }
  setFacing(o, dir, frame = 0) { o.dir = dir; o.sprite.setFrame(DIR_ROW[dir] * 3 + frame); }
  refreshFollower() {
    const lead = G.state.party.find(m => m.hp > 0) || G.state.party[0];
    if (!lead) { this.follower.sprite.setVisible(false); this.follower.mon = null; return; }
    this.follower.mon = lead; this.follower._sitting = false;
    this.follower.sprite.setTexture('mm_' + lead.species + (lead.shiny ? '_s' : ''), DIR_ROW[this.follower.dir] * 3).setVisible(true);
  }
  tileAt(x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? '#' : this.tiles[y][x]; }
  isSolid(x, y, ignore = null) {
    if (isSolidCh(this.map, this.tileAt(x, y))) return true;
    if (this.blocked.has(x + ',' + y)) return true;
    if (this.solidProps?.has(x + ',' + y)) return true;
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

  update(time, delta) {
    for (const l of this.wxLayers || []) { l.ts.tilePositionX -= l.speedX * delta / 16; l.ts.tilePositionY -= l.speedY * delta / 16; }
    this.idleCheck(time);
    if (this.darkness && this.player) { const sp = this.player.sprite; this.darkness.setPosition(sp.x, sp.y - 16); }
    if (this.partnerObj) this.partnerObj.label.setPosition(this.partnerObj.sprite.x, this.partnerObj.sprite.y - 44);
    for (const o of [this.player, this.follower, ...this.npcs, ...this.roamers]) if (o?.sprite) o.sprite.setDepth(o.sprite.y);
    if (!this.canControl()) return;
    const K = this.keys;
    let dir = null;
    if (K.W.isDown || K.UP.isDown) dir = 'up';
    else if (K.S.isDown || K.DOWN.isDown) dir = 'down';
    else if (K.A.isDown || K.LEFT.isDown) dir = 'left';
    else if (K.D.isDown || K.RIGHT.isDown) dir = 'right';
    if (!dir && this.touch) dir = this.touch.dir();
    if (dir) this.tryMove(dir, K.SHIFT.isDown || !!this.touch?.run);
  }

  idleCheck(time) {
    if (this._lastActive === undefined) this._lastActive = time;
    const f = this.follower;
    if (this.moving || UI.busy || this.inBattle) { this._lastActive = time; this.wakeFollower(); return; }
    if (!f.mon || !f.sprite.visible && !this._sleepSpr) return;
    const idle = time - this._lastActive;
    // tétlen követő: 3 mp után körülnéz, 8 mp után leül, (Alap Mexi) 25 mp után elalszik
    if (idle > 3000 && !f._looked) {
      f._looked = true; const back = f.dir, id = (f._lookId = (f._lookId || 0) + 1);
      [['left', 0], ['right', 700], [back, 1400]].forEach(([d, t]) => this.time.delayedCall(t, () => { if (f._lookId === id && f._looked && !f._sitting && !this.moving) this.setFacing(f, d); }));
    }
    if (idle > 8000 && !f._sitting && !this._sleepSpr) {
      const i = SIT_ORDER.indexOf(f.mon.species);
      if (i >= 0 && this.textures.exists('msit')) {
        f._sitting = true; f.sprite.setTexture(f.mon.shiny ? 'msit_s' : 'msit', i);
        if (Math.random() < 0.35) this.emote(f, Math.random() < 0.5 ? 'heart' : 'note');
      }
    }
    if (!this._sleepSpr && idle > 25000 && f.mon.species === 'alap' && f.sprite.visible) {
      f.sprite.setVisible(false);
      this._sleepSpr = this.add.image(f.sprite.x, f.sprite.y + 6, 'ia_sleep1').setOrigin(0.5, 1).setDepth(f.sprite.y).setScale(0.55);
      let i = 0; this._sleepTimer = this.time.addEvent({ delay: 600, loop: true, callback: () => { if (!this._sleepSpr) { this._sleepTimer.remove(); return; } i = (i + 1) % 3; this._sleepSpr.setTexture('ia_sleep' + (i + 1)); } });
    }
  }
  /** A tétlen követőt visszaállítja járó alakba (ülésből, alvásból). */
  wakeFollower() {
    const f = this.follower;
    if (this._sleepSpr) { this._sleepSpr.destroy(); this._sleepSpr = null; f.sprite.setVisible(true); }
    f._looked = false;
    if (f._sitting) { f._sitting = false; if (f.mon) f.sprite.setTexture('mm_' + f.mon.species + (f.mon.shiny ? '_s' : ''), DIR_ROW[f.dir] * 3); }
  }
  tryMove(dir, run = false) {
    this._lastActive = this.time.now;
    this.wakeFollower();
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
        this.tweens.add({ targets: f.sprite, x: this.px(fx), y: this.py(fy), duration: dur });
        this.animateWalk(f, dur);
      }
      f.x = fx; f.y = fy;
    }
    p.x = nx; p.y = ny;
    this.animateWalk(p, dur);
    this.tweens.add({ targets: p.sprite, x: this.px(nx), y: this.py(ny), duration: dur, onComplete: () => { this.moving = false; this.setFacing(p, p.dir); this.onStep(warp); } });
  }

  bump() {
    if (this._bumpT && this.time.now - this._bumpT < 300) return;
    this._bumpT = this.time.now;
    Sfx.play('bump');
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
    s.stats.steps++; if (s.stats.steps % 10 === 0) this.questDone(questEvent('steps', {}, 10));
    this.sendPos();
    if (warp) { this.warpTo(warp); return; }

    // ajtó?
    const door = this.doors.find(d => d.door.x === p.x && d.door.y === p.y);
    if (door) { await this.enterBuilding(door); return; }

    // eseményzóna
    for (const tr of this.map.triggers) {
      if (p.x >= tr.x && p.x < tr.x + tr.w && p.y >= tr.y && p.y < tr.y + tr.h) { if (await this.runTrigger(tr.id, tr)) return; }
    }

    // edző észrevesz?
    if (await this.checkTrainerSight()) return;

    // magas fű
    const ch = this.tileAt(p.x, p.y);
    if (ch === '"' || (this.map.cave && ch === ':')) {
      if (ch === '"') this.rustle(p.x, p.y);
      if (this.map.encounters && !s.flags.firstFrog && s.flags.starter) {
        s.flags.firstFrog = true;
        const frog = createMexi('beka', 3, { shiny: false });
        this.startWildBattle(frog, null, true);
        return;
      }
      if (this.encounterCooldown > 0) this.encounterCooldown--;
      else if (this.map.encounters && rand() < (ch === ':' ? CONFIG.encounterChanceCave : CONFIG.encounterChanceTallGrass)) {
        if (this.partnerNear()) this.tryCoopEncounter(() => this.randomEncounter());
        else this.randomEncounter();
        return;
      }
    }
  }

  rustle(x, y) {
    const img = this.tileImgs[y][x];
    img.setFrame('tall1'); Sfx.play('grass');
    this.time.delayedCall(250, () => img.setFrame('tall0'));
    const leaf = this.add.image(this.px(x), this.py(y) - 6, 'tiles', 'tall0').setDisplaySize(T, T * 0.45).setDepth(this.py(y) + 1).setCrop(0, 18, 32, 14);
    this.time.delayedCall(220, () => leaf.destroy());
  }

  // ---------------- Találkozások ----------------
  pickEncounter() {
    const enc = this.map.encounters; const p = this.player;
    const zone = enc.zones.find(z => p.x >= z.rect[0] && p.x < z.rect[0] + z.rect[2] && p.y >= z.rect[1] && p.y < z.rect[1] + z.rect[3]);
    const night = isNight();
    const table = weatherTable((zone && (night ? zone.night : zone.day)) || (night ? enc.default.night : enc.default.day), this.weather);
    const levels = zone?.levels || enc.default.levels;
    const total = table.reduce((a, [, w]) => a + w, 0);
    let r = rand() * total, species = table[0][0];
    for (const [sp, w] of table) { if ((r -= w) < 0) { species = sp; break; } }
    // a játékos előrehaladása kicsit emeli a szintet
    const bonus = Math.min(2, Math.floor((G.state.defeatedTrainers.length) / 1));
    return createMexi(species, scaleWildLevel(randInt(levels[0], levels[1]) + (rand() < 0.3 ? bonus : 0), levels[1], G.state.party));
  }

  randomEncounter() { this.startWildBattle(this.pickEncounter()); }

  startWildBattle(mon, roamer = null, tutorial = false) {
    if (!G.state.party.some(m => m.hp > 0)) { dialog('A Mexijeid kimerültek! Előbb gyógyítsd meg őket.'); return; }
    markSeen(mon.species);
    this.launchBattle({ foeParty: [mon], isTrainer: false, tutorial, roamer });
  }

  launchBattle(opts) {
    this.inBattle = true;
    Sfx.play(opts.isTrainer ? 'trainer' : 'encounter');
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
      if (res === 'win' || res === 'caught') {
        r.sprite.destroy(); this.roamers.splice(this.roamers.indexOf(r), 1);
        // a legyőzött vándorló Mexi 1 percig nem tér vissza, akkor sem, ha közben elhagyod a területet
        s.roamerCD = s.roamerCD || {}; s.roamerCD[r.def._id] = Date.now() + CONFIG.roamerRespawnMs;
        this.time.delayedCall(CONFIG.roamerRespawnMs, () => this.spawnRoamer(r.def));
      } else {
        // elfutás vagy vereség után a vad Mexi kipiheni magát
        healFull(r.mon);
      }
    }
    if (res === 'win') s.stats.wins++;
    if (res === 'win' && !opts.isTrainer) {
      const coins = Math.max(10, Math.round(opts.foeParty[0].level * 8));
      s.money += coins;
      toast(`A vad Mexi elejtett ${coins} érmét!`);
    }
    if (res === 'caught' && !opts.isTrainer) {
      // elkapásért is jár egy kis jutalom (a labdák árának egy részét visszahozza)
      const coins = Math.max(10, Math.round(opts.foeParty[0].level * 8));
      s.money += coins;
      toast(`Elkapási jutalom: +${coins} érme`);
    }
    if (res === 'lose' || res === 'draw') {
      this.cutscene = true;
      const lost = res === 'draw' ? 0 : Math.floor(s.money * 0.1); // döntetlennél nincs pénzveszteség
      s.money -= lost;
      await dialog([res === 'draw' ? 'Döntetlen lett – a Mexijeid kimerültek, de pénzt nem vesztettél.' : `Minden Mexid kimerült... Elvesztettél ${lost} érmét.`, 'Gyorsan visszasiettél a gyógyítóállomásra.']);
      for (const m of [...s.party, ...(s.storage || [])]) healFull(m);
      s.map = s.lastHeal.map; s.pos = { x: s.lastHeal.x, y: s.lastHeal.y, dir: 'down' }; if (s.lastHeal.ret) s.returnTo = s.lastHeal.ret;
      save();
      this.cutscene = false;
      this.scene.restart();
      return;
    }
    if (opts.trainerNpc && res === 'win') {
      const tr = opts.trainerNpc.tr;
      const reward = opts.rematch ? Math.round(tr.reward * 0.6) : tr.reward;
      if (opts.rematch) { s.rematch ??= {}; s.rematch[opts.trainerNpc.trainer] = new Date().toLocaleDateString('sv-SE'); }
      else if (!s.defeatedTrainers.includes(opts.trainerNpc.trainer)) s.defeatedTrainers.push(opts.trainerNpc.trainer);
      s.money += reward;
      this.questDone(questEvent('trainerWins'));
      await dialog([tr.lose, `Kaptál ${reward} Mexi-érmét!`], tr.name);
    }
    if (res === 'win' && !opts.isTrainer) this.questDone(questEvent('wildWins'));
    if (opts.tutorial && res === 'caught') {
      await dialog(['Ügyes! Elkaptad az első vad Mexidet!', 'Nézd meg a Mexidexben (J) vagy a csapatodnál (P).', 'A magas fűben még sok Mexi rejtőzik. Ha megsérültek, a falu gyógyítóállomásán ingyen meggyógyulnak!'], 'Prof. Szimat');
    }
    save();
    this.updateHud();
  }

  questDone(def) { if (def) { Sfx.play('item'); toast(`📜 Küldetés teljesítve: ${def.text.replace('{type}', '')} – vedd át a jutalmat a menüben!`); } }

  // ---------------- Edzők ----------------
  async checkTrainerSight() {
    if (!G.state.party.some(m => m.hp > 0)) return false;
    for (const n of this.npcs) {
      if (!n.tr || G.state.defeatedTrainers.includes(n.trainer)) continue;
      const [dx, dy] = DV[n.dir];
      for (let i = 1; i <= n.tr.sight; i++) {
        const x = n.x + dx * i, y = n.y + dy * i;
        if (x === this.player.x && y === this.player.y) { await this.trainerChallenge(n, i); return true; }
        if (isSolidCh(this.map, this.tileAt(x, y)) || this.blocked.has(x + ',' + y)) break;
      }
    }
    return false;
  }

  async trainerChallenge(n, dist) {
    this.cutscene = true;
    const ex = this.emote(n, 'excl', 700);
    await new Promise(r => this.time.delayedCall(600, r));
    ex.destroy();
    const [dx, dy] = DV[n.dir];
    for (let i = 1; i < dist; i++) {
      n.x += dx; n.y += dy;
      this.animateWalk(n, 180);
      await new Promise(r => this.tweens.add({ targets: n.sprite, x: this.px(n.x), y: this.py(n.y), duration: 180, onComplete: r }));
    }
    this.setFacing(this.player, OPP[n.dir]);
    await dialog(n.tr.intro, n.tr.name);
    this.cutscene = false;
    this.startTrainerBattle(n);
  }

  startTrainerBattle(n, rematch = false) {
    if (!G.state.party.some(m => m.hp > 0)) { dialog('A Mexijeid kimerültek!'); return; }
    // visszavágón az edző a csapatodhoz igazodik (a legerősebb Mexidnél 1–2 szinttel gyengébb, de nem gyengébb az eredetinél)
    const top = Math.max(...G.state.party.map(m => m.level));
    const team = n.tr.team.map(([sp, lv], i) => createMexi(sp, rematch ? Math.min(CONFIG.maxLevel, Math.max(lv, top - 2 + (i === n.tr.team.length - 1 ? 1 : 0))) : lv, { shiny: false }));
    team.forEach(m => markSeen(m.species));
    this.launchBattle({ foeParty: team, isTrainer: true, trainerName: n.tr.name, trainerSprite: n.sprite.texture.key, trainerId: n.tr.art || n.trainer, trainerNpc: n, rematch });
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
      this.tweens.add({ targets: n.sprite, x: this.px(nx), y: this.py(ny), duration: 300 });
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
      this.tweens.add({ targets: r.sprite, x: this.px(nx), y: this.py(ny), duration: 260 });
    }
  }

  // ---------------- Interakció ----------------
  async interact() {
    if (!this.canControl()) return;
    const p = this.player; const [dx, dy] = DV[p.dir];
    const tx = p.x + dx, ty = p.y + dy;
    const npc = this.npcs.find(n => n.x === tx && n.y === ty);
    if (npc) { await this.talkTo(npc); return; }
    if (this.follower.mon && this.follower.x === tx && this.follower.y === ty) { await this.playWithMexi(); return; }
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
    const fu = this.furniture?.find(f => f.act && f.tiles.some(([a, b]) => a === tx && b === ty));
    if (fu) { await this.useFurniture(fu); return; }
  }

  async useFurniture(fu) {
    if (fu.act === 'heal') return this.doHeal();
    if (fu.act === 'shop') return this.doShop();
    if (fu.act === 'pc') {
      await dialog('Bekapcsoltad a gépet. Megnyílik a Mexi-tároló...');
      const { openStorage } = await import('../ui/menus.js');
      openStorage(); return;
    }
    if (fu.act === 'bed') {
      this.cutscene = true;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      await new Promise(r => this.time.delayedCall(700, r));
      for (const m of [...G.state.party, ...(G.state.storage || [])]) healFull(m);
      G.state.lastHeal = { map: this.mapKey, x: this.player.x, y: this.player.y, ret: G.state.returnTo || null };
      this.cameras.main.fadeIn(400, 0, 0, 0);
      await dialog('Kipihented magad. A Mexijeid is teljesen meggyógyultak! 💤');
      save(); this.cutscene = false; return;
    }
    await dialog(fu.act);
  }

  async doHeal() {
    const s = G.state; const who = 'Nővér Mancsi';
    this.cutscene = true;
    await dialog('Üdv a Mexi-gyógyítóállomáson! 💖', who);
    const c = await choose(['💖 Gyógyítás', '🧠 Támadás-emlékeztető (200 🪙)', 'Viszlát'], { question: 'Miben segíthetek?' });
    if (c === 1) { await moveReminder(who); this.updateHud(); this.cutscene = false; return; }
    if (c !== 0) { this.cutscene = false; return; }
    await dialog('Add ide a Mexijeidet, mindegyiket meggyógyítom...', who);
    for (const m of [...s.party, ...(s.storage || [])]) healFull(m);
    Sfx.play('heal');
    this.cameras.main.flash(400, 255, 200, 220);
    s.lastHeal = { map: this.mapKey, x: this.player.x, y: this.player.y, ret: G.state.returnTo || null };
    await dialog(`Kész! Mind a(z) ${s.party.length} Mexid – és a tárolóban pihenők is – újra teljesen egészségesek. Gyere vissza bármikor!`, who);
    save(); this.updateHud(); this.cutscene = false;
  }

  async doShop() {
    this.cutscene = true;
    await dialog('Üdv a boltban! Teniszlabdák, gyógyitalok – minden, ami egy kalandhoz kell!', 'Boltos Bandi');
    await openShop();
    save(); this.updateHud(); this.cutscene = false;
  }

  async talkTo(n) {
    this.setFacing(n, OPP[this.player.dir]);
    if (n.tr) {
      if (G.state.defeatedTrainers.includes(n.trainer)) {
        await dialog(n.tr.after, n.tr.name);
        const today = new Date().toLocaleDateString('sv-SE'); G.state.rematch ??= {};
        if (G.state.rematch[n.trainer] !== today) {
          const c = await choose(['⚔️ Visszavágó!', 'Most nem'], { question: `${n.tr.name}: Azóta sokat edzettem! Naponta egyszer újra megmérkőzhetünk.` });
          if (c === 0) this.startTrainerBattle(n, true);
        }
      }
      else { await dialog(n.tr.intro, n.tr.name); this.startTrainerBattle(n); }
      return;
    }
    if (n.talk === 'prof') { await this.profTalk(); return; }
    if (n.talk === 'heal') return this.doHeal();
    if (n.talk === 'shop') return this.doShop();
    if (n.talk === 'mom') {
      this.cutscene = true;
      await dialog(['Anya: Szia kincsem! Pihenj egy kicsit...', '(A Mexijeid kipihenték magukat.)']);
      for (const m of [...G.state.party, ...(G.state.storage || [])]) healFull(m);
      G.state.lastHeal = { map: this.mapKey, x: this.player.x, y: this.player.y, ret: G.state.returnTo || null };
      save(); this.cutscene = false; return;
    }
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
      if (nick === 0) { const n = await askText('Becenév:', 'Mexi'); if (n && n.trim()) m.nickname = n.trim().slice(0, 14); }
      await dialog(['A vad Mexiket harcban gyengítsd meg, aztán dobj rájuk teniszlabdát!', 'Minél kevesebb a HP-juk, annál könnyebb elkapni őket.', 'Indulj északra, a Mexi-ösvényre! Ott élnek az első vad Mexik.', 'Ha bajba kerülsz: a gyógyítóállomás jobbra fent van, a bolt jobbra lent.'], who);
      save();
      this.cutscene = false;
      this.updateHud();
      return;
    }
    const caught = Object.keys(s.dex.caught).length;
    if (!s.flags.boneIntro) {
      s.flags.boneIntro = true; s.bones ??= {}; s.bones.alap = (s.bones.alap || 0) + 5;
      await dialog(['Ja, és egy fontos dolog: a Mexi-csontok! 🦴', 'Minden elkapott Mexi után 3 csontot kapsz a családjából.', 'Ha több egyforma Mexid van, add át nekem őket a kutatáshoz – cserébe csontot adok!', 'Csonttal erősítheted a Mexijeidet (+1 szint), sőt fejleszteni is tudod őket. Itt van 5 Alap-csont kezdésnek!'], who);
      save();
    }
    const c = await choose(['📤 Mexik átadása (csontért)', '🦴 Hogyan működnek a csontok?', '💬 Beszélgetés', 'Viszlát'], { question: 'Miben segíthetek?' });
    if (c === 0) { this.cutscene = true; await openTransfer(); this.cutscene = false; this.refreshFollower(); this.updateHud(); return; }
    if (c === 1) { await dialog(['Elkapás: +3 csont a Mexi családjából. Átadás: +1 csont, minden 10. szint után +1, shiny +2.', 'Erősítés: a Mexi adatlapján – csont + érme = +1 szint. Csak a csapatod legerősebb Mexijének szintjéig, így a lemaradókat tudod felhozni.', `Fejlesztés: ${BONES.evolveCost} csontért, ha a Mexi már legfeljebb 4 szintre van a fejlődéstől.`, 'Tipp: a kedvenceidet zárold le 🔒, így véletlenül sem adod át őket!'], who); return; }
    if (c !== 2) return;
    if (caught >= 4 && !s.flags.profGift1) {
      s.flags.profGift1 = true; s.inventory.profi_labda = (s.inventory.profi_labda || 0) + 3;
      await dialog([`Hű, már ${caught} különböző Mexit szereztél!`, 'Itt van 3 Profi Teniszlabda jutalmul. Csak így tovább!'], who); save(); return;
    }
    const tips = [`Eddig ${caught} fajta Mexit szereztél meg. Összesen legalább 15 vár rád!`, 'Tudtad? Két egyforma Mexi sem teljesen ugyanolyan: más a természetük és az adottságuk.', 'Nagyon ritkán shiny, különleges színű Mexik is felbukkannak! ✨', 'Éjjel más Mexik bújnak elő a fűből, mint nappal.', 'A típusok számítanak: a Víz eloltja a Tüzet, a Növény legyőzi a Vizet!'];
    await dialog(tips[randInt(0, tips.length - 1)], who);
  }

  async enterBuilding(b) {
    const inner = MAPS['int_' + (b.interior || b.key)];
    if (inner) {
      let mx = 0, my = 0;
      inner.tiles.forEach((row, y) => row.forEach((c, x) => { if (c === 'E') { mx = x; my = y; } }));
      G.state.returnTo = { map: this.mapKey, x: b.door.x, y: b.door.y + 1 };
      this.warpTo({ to: 'int_' + (b.interior || b.key), tx: mx, ty: my - 1, dir: 'up' });
      return;
    }
    this.cutscene = true;
    const s = G.state;
    const out = () => { this.player.y += 1; this.setFacing(this.player, 'down'); this.placeSprite(this.player); s.pos = { x: this.player.x, y: this.player.y, dir: 'down' }; };
    if (b.action === 'heal') {
      await dialog(['Üdv a Mexi-gyógyítóállomáson! 💖', 'Meggyógyítom a Mexijeidet...'], 'Nővér Mancsi');
      for (const m of [...s.party, ...(s.storage || [])]) healFull(m);
      this.cameras.main.flash(400, 255, 200, 220);
      s.lastHeal = { map: this.mapKey, x: b.door.x, y: b.door.y };
      await dialog('Kész! A Mexijeid újra teljesen egészségesek. Gyere vissza bármikor!', 'Nővér Mancsi');
    } else if (b.action === 'shop') {
      await dialog('Üdv a boltban! Teniszlabdák, gyógyitalok – minden, ami egy kalandhoz kell!', 'Boltos Bandi');
      await openShop();
    } else if (b.action === 'home') {
      await dialog(['Anya: Szia! Pihenj egy kicsit...', '(A Mexijeid kipihenték magukat.)']);
      for (const m of [...s.party, ...(s.storage || [])]) healFull(m);
      s.lastHeal = { map: this.mapKey, x: b.door.x, y: b.door.y };
    } else if (b.action === 'lab') {
      await dialog(s.flags.starter ? 'A laborban gőzerővel folyik a kutatás. A professzor kint van a téren.' : 'A labor zárva. A professzor kint van a téren, a labor előtt!');
    } else if (b.action === 'gym') {
      await dialog(['MEXI GYM', 'Az aréna kapuja még zárva van.', 'Hamarosan itt harcolhatsz a Napmancs, Holdmancs és Viharmancs frakciókért!']);
    } else if (b.action === 'house2') {
      await dialog(['Kék ház lakója: Ó, egy Mexi-edző!', 'A tó partján néha Kacsa Mexik totyognak... de az csak az ösvényen van, nem itt.']);
    } else if (b.action === 'temple') {
      await dialog(['HOLDMANCS-TEMPLOM', 'A kapu zárva. Bentről halk kántálás hallatszik...', 'Egy tábla: „A Holdmancs-aréna hamarosan megnyílik a bátor edzők előtt.”']);
    } else if (b.action === 'house') {
      await dialog(['Szomszéd: Hallottad? Az ösvényen túl van egy Titokzatos Erdő...', 'Állítólag ott Mágus Mexik varázsolnak a fák között!']);
    }
    out();
    save();
    this.updateHud();
    this.cutscene = false;
  }

  async runTrigger(id, tr = {}) {
    const s = G.state;
    if (id === 'gate') {
      if (s.defeatedTrainers.includes(tr.need)) return false;
      this.cutscene = true;
      await dialog(tr.text, tr.who || 'Kapuőr');
      const [dx, dy] = DV[tr.back || 'down'];
      this.player.x += dx; this.player.y += dy; this.placeSprite(this.player); this.setFacing(this.player, tr.back || 'down');
      this.cutscene = false;
      return true;
    }
    if (id === 'needStarter' && !s.flags.starter) {
      this.cutscene = true;
      await dialog(['Várj! Ne menj ki egyedül a magas fűbe!', 'A vad Mexik megtámadhatnak. Gyere, keresd meg a professzort a labor előtt!'], 'Prof. Szimat');
      this.player.y += 1; this.placeSprite(this.player); this.setFacing(this.player, 'down');
      this.cutscene = false;
      return true;
    }
    if (id === 'forestClosed') {
      if (s.defeatedTrainers.includes('lili')) return false;
      this.cutscene = true;
      await dialog(['Állj! A Titokzatos Erdő veszélyes.', 'Csak az mehet tovább, aki legyőzte Lilit, a kalandort! (Délre, a tó mellett találod.)'], 'Erdőőr');
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
      const c = this.add.circle(x * T + T / 2, y * T + T / 2, 12, color, 0.55).setDepth(99990);
      const t = this.add.text(x * T + 6, y * T + 4, '🐾', { fontSize: '18px' }).setDepth(99991);
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
    this.tileImgs[y][x].setFrame('dirt');
    this.tileProps[x + ',' + y]?.destroy();
    G.state.flags['secret_' + this.mapKey] = true;
    this.cameras.main.shake(200, 0.003);
    await dialog([`${displayName(this.follower.mon)} kiszimatolt egy rejtett átjárót a bokor mögött!`, 'Egy titkos rét tárult fel... Itt ritka Mexik élnek!']);
    save();
  }

  // ---------------- Térképváltás ----------------
  warpTo(w) {
    Sfx.play('door');
    const s = G.state;
    if (w.back && s.returnTo && MAPS[s.returnTo.map]) w = { to: s.returnTo.map, tx: s.returnTo.x, ty: s.returnTo.y, dir: 'down' };
    s.map = w.to; s.pos = { x: w.tx, y: w.ty, dir: w.dir };
    save();
    this.cutscene = true;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.cutscene = false; this.scene.restart(); });
  }
}

