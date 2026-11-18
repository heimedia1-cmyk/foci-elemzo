// BattleEngine – körökre osztott harc tiszta logikája (UI-tól független, tesztelhető).
// A jelenet (BattleScene) eseménylistákat kap vissza, és azokat játssza le sorban.
import { MEXIS } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { CONFIG } from '../data/config.js';
import { effectiveness, effectivenessText } from '../data/types.js';
import { rand, randInt, displayName, xpYield, gainXp } from './mexi.js';
import { throwBall } from './capture.js';

const STRUGGLE = { name: 'Küzdelem', type: 'semleges', cat: 'fiz', power: 40, acc: 100, pp: 1 };

export function stageMult(s) { return s >= 0 ? (2 + s) / 2 : 2 / (2 - s); }

function newSide(party, active) {
  return { party, active, stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, sleep: 0, participants: new Set([active]) };
}

/** Sebzésszámítás (exportálva a tesztekhez). */
export function calcDamage(att, def, move, attStages = {}, defStages = {}, opts = {}) {
  if (!move.power) return { dmg: 0, eff: 1, crit: false };
  const phys = move.cat === 'fiz';
  let A = phys ? att.stats.atk : att.stats.spa;
  let D = phys ? def.stats.def : def.stats.spd;
  A *= stageMult(phys ? (attStages.atk || 0) : (attStages.spa || 0));
  D *= stageMult(phys ? (defStages.def || 0) : (defStages.spd || 0));
  if (phys && att.status === 'eges') A *= 0.5;
  const eff = effectiveness(move.type, MEXIS[def.species].types);
  if (eff === 0) return { dmg: 0, eff, crit: false };
  const critP = move.effect?.highCrit ? CONFIG.highCritChance : CONFIG.critChance;
  const crit = opts.forceCrit ?? (rand() < critP);
  const stab = MEXIS[att.species].types.includes(move.type) ? CONFIG.stab : 1;
  const r = opts.fixedRandom ?? (0.85 + rand() * 0.15);
  let dmg = (((2 * att.level) / 5 + 2) * move.power * (A / D)) / 50 + 2;
  dmg = dmg * stab * eff * (crit ? 1.5 : 1) * r;
  return { dmg: Math.max(1, Math.floor(dmg)), eff, crit };
}

export class BattleEngine {
  /**
   * @param {object} o
   * @param {Array} o.playerParty  – a játékos csapata (élő referenciák, a harc módosítja őket)
   * @param {Array} o.foeParty     – ellenfél Mexijei
   * @param {boolean} o.isTrainer
   * @param {string} [o.trainerName]
   * @param {object} o.inventory   – { itemId: darab } (élő referencia)
   */
  constructor({ playerParty, foeParty, isTrainer = false, trainerName = '', inventory = {}, guaranteeCatch = false }) {
    this.guaranteeCatch = guaranteeCatch;
    const firstAlive = playerParty.findIndex(m => m.hp > 0);
    this.p = newSide(playerParty, firstAlive);
    this.f = newSide(foeParty, 0);
    this.isTrainer = isTrainer;
    this.trainerName = trainerName;
    this.inventory = inventory;
    this.over = false;
    this.result = null;
    this.runAttempts = 0;
    this.caught = null;
  }

  get pm() { return this.p.party[this.p.active]; }
  get fm() { return this.f.party[this.f.active]; }
  sideOf(key) { return key === 'p' ? this.p : this.f; }
  mon(key) { return key === 'p' ? this.pm : this.fm; }
  label(key) {
    const n = displayName(this.mon(key));
    if (key === 'p') return n;
    return this.isTrainer ? `Az ellenfél ${n}` : `A vad ${n}`;
  }

  effSpeed(key) {
    const m = this.mon(key);
    let s = m.stats.spe * stageMult(this.sideOf(key).stages.spe);
    if (m.status === 'benitas') s *= 0.5;
    return s;
  }

  /** A játékos lépése. Visszaad egy eseménylistát. */
  playerAction(action) {
    const ev = [];
    if (this.over) return ev;

    if (action.type === 'run') {
      if (this.isTrainer) { ev.push({ t: 'msg', text: 'Edzőcsatából nem lehet elmenekülni!' }); return ev; }
      this.runAttempts++;
      const odds = (this.pm.stats.spe * 32) / Math.max(1, (this.fm.stats.spe / 4) % 256) + 30 * this.runAttempts;
      if (this.pm.stats.spe >= this.fm.stats.spe || rand() * 256 < odds) {
        ev.push({ t: 'msg', text: 'Sikerült elmenekülni!' });
        this.finish(ev, 'run');
        return ev;
      }
      ev.push({ t: 'msg', text: 'Nem sikerült elmenekülni!' });
      this.foeTurnOnly(ev);
      return ev;
    }

    if (action.type === 'switch') {
      if (this.doSwitch('p', action.index, ev) === false) return ev; // érvénytelen csere: nem veszi el a kört
      this.foeTurnOnly(ev);
      return ev;
    }

    if (action.type === 'item') {
      const ok = this.useItem(action.itemId, action.target ?? this.p.active, ev);
      if (!ok) return ev;
      if (ITEMS[action.itemId].kind === 'ball') {
        if (this.over) return ev;
      }
      this.foeTurnOnly(ev);
      return ev;
    }

    if (action.type === 'move') {
      const pMove = this.pickMoveData(this.pm, action.index);
      const fIdx = this.chooseFoeMove();
      const fMove = this.pickMoveData(this.fm, fIdx);
      const pPri = pMove.priority || 0, fPri = fMove.priority || 0;
      let first = 'p';
      if (fPri > pPri) first = 'f';
      else if (fPri === pPri) {
        const ps = this.effSpeed('p'), fs = this.effSpeed('f');
        if (fs > ps || (fs === ps && rand() < 0.5)) first = 'f';
      }
      const order = first === 'p' ? [['p', action.index], ['f', fIdx]] : [['f', fIdx], ['p', action.index]];
      for (const [k, idx] of order) {
        if (this.over) break;
        if (this.mon(k).hp <= 0 || this.mon(k === 'p' ? 'f' : 'p').hp <= 0) continue;
        this.executeMove(k, idx, ev);
        if (this.checkFaints(ev)) break;
      }
      if (!this.over) this.endOfTurn(ev);
      return ev;
    }
    return ev;
  }

  /** Harcképtelenség után a játékos új Mexit választ (nem kerül körbe). */
  forcedSwitch(index) {
    const ev = [];
    const ok = this.p.party[index]?.hp > 0 ? index : this.p.party.findIndex(m => m.hp > 0);
    if (ok >= 0) this.doSwitch('p', ok, ev, true);
    return ev;
  }

  foeTurnOnly(ev) {
    if (this.over || this.fm.hp <= 0 || this.pm.hp <= 0) return;
    this.executeMove('f', this.chooseFoeMove(), ev);
    if (!this.checkFaints(ev)) this.endOfTurn(ev);
  }

  pickMoveData(m, idx) {
    if (idx === -1 || !m.moves[idx]) return STRUGGLE;
    return MOVES[m.moves[idx].id];
  }

  chooseFoeMove() {
    const m = this.fm;
    const usable = m.moves.map((mv, i) => ({ mv, i })).filter(x => x.mv.pp > 0);
    if (!usable.length) return -1;
    if (!this.isTrainer) return usable[randInt(0, usable.length - 1)].i;
    // Edző-MI: a várhatóan legerősebb támadás, de nem mindig
    const target = this.pm;
    const scored = usable.map(({ mv, i }) => {
      const d = MOVES[mv.id];
      let score;
      if (d.cat === 'stat') {
        if (d.effect?.status) score = target.status ? 0 : 45;
        else if (d.effect?.heal) score = m.hp < m.stats.hp * 0.4 ? 90 : 5;
        else score = 25;
      } else {
        const stab = MEXIS[m.species].types.includes(d.type) ? 1.5 : 1;
        score = d.power * effectiveness(d.type, MEXIS[target.species].types) * stab * (d.acc / 100);
      }
      return { i, score };
    }).sort((a, b) => b.score - a.score);
    return rand() < 0.75 ? scored[0].i : scored[randInt(0, scored.length - 1)].i;
  }

  executeMove(k, idx, ev) {
    const side = this.sideOf(k), oKey = k === 'p' ? 'f' : 'p', oSide = this.sideOf(oKey);
    const att = this.mon(k), def = this.mon(oKey);
    const name = this.label(k);

    // Státusz, ami akadályozhatja a cselekvést
    if (att.status === 'alvas') {
      if (side.sleep > 0) { side.sleep--; ev.push({ t: 'msg', text: `${name} alszik...` }); return; }
      att.status = null; ev.push({ t: 'status', side: k, status: null }); ev.push({ t: 'msg', text: `${name} felébredt!` });
    }
    if (att.status === 'fagyas') {
      if (rand() < 0.2) { att.status = null; ev.push({ t: 'status', side: k, status: null }); ev.push({ t: 'msg', text: `${name} kiolvadt!` }); }
      else { ev.push({ t: 'msg', text: `${name} le van fagyva!` }); return; }
    }
    if (att.status === 'benitas' && rand() < 0.25) { ev.push({ t: 'msg', text: `${name} béna, nem tud mozdulni!` }); return; }

    let move;
    if (idx === -1 || !att.moves[idx] || att.moves[idx].pp <= 0) {
      move = STRUGGLE;
      if (idx === -1) ev.push({ t: 'msg', text: `${name}: elfogyott minden PP!` });
    } else {
      att.moves[idx].pp--;
      move = MOVES[att.moves[idx].id];
    }
    ev.push({ t: 'msg', text: `${name}: ${move.name}!` });
    ev.push({ t: 'anim', side: k, moveType: move.type, cat: move.cat });

    if (rand() * 100 >= move.acc) { ev.push({ t: 'msg', text: 'De nem talált!' }); return; }

    if (move.power > 0) {
      const { dmg, eff, crit } = calcDamage(att, def, move, side.stages, oSide.stages);
      if (eff === 0) { ev.push({ t: 'msg', text: `${this.label(oKey)}: ${effectivenessText(0)}` }); return; }
      def.hp = Math.max(0, def.hp - dmg);
      ev.push({ t: 'damage', side: oKey, hp: def.hp, max: def.stats.hp, eff, crit });
      if (crit) ev.push({ t: 'msg', text: 'Kritikus találat!' });
      const et = effectivenessText(eff);
      if (et) ev.push({ t: 'msg', text: et });
    }

    const e = move.effect;
    if (!e) return;
    if (e.status && def.hp > 0) {
      const chance = e.chance ?? 100;
      if (!def.status && rand() * 100 < chance) {
        if (e.status === 'eges' && MEXIS[def.species].types.includes('tuz')) { if (move.cat === 'stat') ev.push({ t: 'msg', text: 'Nincs hatása...' }); return; }
        if (e.status === 'fagyas' && MEXIS[def.species].types.includes('jeg')) return;
        // altatási szabály: a játékos ugyanazt az ellenfelet egy harcban csak egyszer altathatja el
        if (e.status === 'alvas' && oKey === 'f') { this.slept ??= new Set(); if (this.slept.has(def)) { if (move.cat === 'stat') ev.push({ t: 'msg', text: `${this.label('f')} már egyszer elaludt ebben a harcban – most nem alszik el.` }); return; } this.slept.add(def); }
        def.status = e.status;
        if (e.status === 'alvas') oSide.sleep = randInt(1, 3);
        ev.push({ t: 'status', side: oKey, status: e.status });
        ev.push({ t: 'msg', text: `${this.label(oKey)}: ${STATUS[e.status].name}!` });
      } else if (move.cat === 'stat') {
        ev.push({ t: 'msg', text: def.status ? 'Már van rajta státuszhatás.' : 'Nem sikerült!' });
      }
    }
    if (e.stat) {
      if (e.chance && rand() * 100 >= e.chance) return;
      const tKey = e.target === 'self' ? k : oKey;
      if (this.mon(tKey).hp <= 0) return;
      const st = this.sideOf(tKey).stages;
      const before = st[e.stat];
      st[e.stat] = Math.max(-6, Math.min(6, st[e.stat] + e.stages));
      const names = { atk: 'támadása', def: 'védekezése', spa: 'spec. támadása', spd: 'spec. védekezése', spe: 'sebessége' };
      if (before === st[e.stat]) ev.push({ t: 'msg', text: 'Ennél tovább nem változhat!' });
      else {
        ev.push({ t: 'stat', side: tKey, stat: e.stat, stages: e.stages });
        ev.push({ t: 'msg', text: `${this.label(tKey)} ${names[e.stat]} ${e.stages > 0 ? (e.stages > 1 ? 'nagyon megnőtt' : 'megnőtt') : 'csökkent'}!` });
      }
    }
    if (e.heal) {
      const before = att.hp;
      att.hp = Math.min(att.stats.hp, att.hp + Math.floor(att.stats.hp * e.heal));
      if (att.hp === before) ev.push({ t: 'msg', text: 'A HP már tele van.' });
      else { ev.push({ t: 'heal', side: k, hp: att.hp, max: att.stats.hp }); ev.push({ t: 'msg', text: `${name} gyógyult!` }); }
    }
  }

  endOfTurn(ev) {
    for (const k of ['p', 'f']) {
      const m = this.mon(k);
      if (m.hp <= 0) continue;
      if (m.status === 'eges' || m.status === 'mereg') {
        const d = Math.max(1, Math.floor(m.stats.hp / 8));
        m.hp = Math.max(0, m.hp - d);
        ev.push({ t: 'msg', text: `${this.label(k)}: ${m.status === 'eges' ? 'megégett' : 'mérgezés sebzi'}!` });
        ev.push({ t: 'damage', side: k, hp: m.hp, max: m.stats.hp, eff: 1, crit: false, dot: true });
      }
    }
    this.checkFaints(ev);
  }

  /**
   * Igaz, ha a kör megszakad (valaki kiesett).
   * Egyidejű kiütés (pl. körvégi égés/méreg mindkét utolsó Mexin): DÖNTETLEN – a játékosnak nincs harcképes
   * Mexije, ezért gyógyulni megy, de pénzt nem veszít; edző esetén nem számít győzelemnek.
   */
  checkFaints(ev) {
    const fF = this.fm.hp <= 0 && !this.fm._fainted;
    const pF = this.pm.hp <= 0 && !this.pm._fainted;
    if (!fF && !pF) return false;
    if (fF) {
      this.fm._fainted = true;
      ev.push({ t: 'faint', side: 'f' }, { t: 'msg', text: `${this.label('f')} harcképtelen lett!` });
      this.awardXp(ev);
    }
    if (pF) {
      this.pm._fainted = true;
      ev.push({ t: 'faint', side: 'p' }, { t: 'msg', text: `${this.label('p')} harcképtelen lett!` });
    }
    const foeLeft = this.f.party.some(m => m.hp > 0), meLeft = this.p.party.some(m => m.hp > 0);
    if (!foeLeft && !meLeft) { ev.push({ t: 'msg', text: 'Döntetlen! Mindkét oldal utolsó Mexije egyszerre esett ki.' }); this.finish(ev, 'draw'); return true; }
    if (!foeLeft) { if (this.isTrainer) ev.push({ t: 'msg', text: `Legyőzted: ${this.trainerName}!` }); this.finish(ev, 'win'); return true; }
    if (!meLeft) { ev.push({ t: 'msg', text: 'Nincs több harcképes Mexid...' }); this.finish(ev, 'lose'); return true; }
    if (fF) this.doSwitch('f', this.f.party.findIndex(m => m.hp > 0), ev, true);
    if (pF) ev.push({ t: 'needSwitch' });
    return true;
  }

  /** XP: aki harcolt, a teljes összeget kapja; a csapat többi harcképes tagja a felét (közös tapasztalat). */
  awardXp(ev) {
    const defeated = this.fm;
    const amount = xpYield(defeated, this.isTrainer);
    const share = Math.max(1, Math.floor(amount * CONFIG.xpShare));
    let sharedTo = 0;
    this.p.party.forEach((m, i) => {
      if (!m || m.hp <= 0) return;
      const fought = this.p.participants.has(i);
      const got = fought ? amount : share;
      if (fought) ev.push({ t: 'msg', text: `${displayName(m)} ${got} XP-t kapott!` });
      else sharedTo++;
      const res = gainXp(m, got);
      ev.push({ t: 'xp', index: i });
      for (const r of res) {
        if (r.type === 'levelup') ev.push({ t: 'levelup', index: i, level: r.level }, { t: 'msg', text: `${displayName(m)} elérte a(z) ${r.level}. szintet!` });
        if (r.type === 'learned') ev.push({ t: 'msg', text: `${displayName(m)} megtanulta: ${MOVES[r.move].name}!` });
        if (r.type === 'canLearn') ev.push({ t: 'canLearn', index: i, move: r.move });
      }
    });
    if (sharedTo) ev.push({ t: 'msg', text: `A csapat többi tagja is kapott ${share} XP-t.` });
    this.p.participants = new Set([this.p.active]);
  }

  doSwitch(k, index, ev, forced = false) {
    const side = this.sideOf(k);
    const target = side.party[index];
    if (!Number.isInteger(index) || !target || target.hp <= 0 || (index === side.active && !forced)) { ev.push({ t: 'msg', text: 'Ezt a Mexit most nem lehet becserélni.' }); return false; }
    if (k === 'p' && !forced) ev.push({ t: 'msg', text: `Gyere vissza, ${displayName(this.pm)}!` });
    side.active = index;
    side.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    side.sleep = this.mon(k).status === 'alvas' ? randInt(1, 2) : 0;
    if (k === 'p') side.participants.add(index);
    ev.push({ t: 'switch', side: k, index });
    ev.push({ t: 'msg', text: k === 'p' ? `Rajta, ${displayName(this.pm)}!` : `${this.trainerName} előhívta: ${displayName(this.fm)}!` });
    return true;
  }

  useItem(itemId, target, ev) {
    const it = ITEMS[itemId];
    if (!it || !(this.inventory[itemId] > 0)) { ev.push({ t: 'msg', text: 'Nincs ilyen tárgyad.' }); return false; }
    if (it.kind === 'ball') {
      if (this.isTrainer) { ev.push({ t: 'msg', text: 'Más edző Mexijét nem lehet elkapni!' }); return false; }
      this.inventory[itemId]--;
      const r = this.guaranteeCatch ? { shakes: 3, caught: true } : throwBall(this.fm, itemId);
      ev.push({ t: 'msg', text: `Eldobtad: ${it.name}!` });
      ev.push({ t: 'ball', itemId, shakes: r.shakes, caught: r.caught });
      if (r.caught) {
        ev.push({ t: 'msg', text: `Megvan! ${MEXIS[this.fm.species].name} a tiéd!` });
        this.caught = this.fm;
        this.awardXp(ev);
        this.finish(ev, 'caught');
      } else {
        const lines = ['Jaj, kiugrott a labdából!', 'Majdnem sikerült!', 'Úgy tűnt, megvan... de kiszökött!', 'Hajszálon múlt!'];
        ev.push({ t: 'msg', text: lines[r.shakes] });
      }
      return true;
    }
    const m = this.p.party[target];
    if (!m) { ev.push({ t: 'msg', text: 'Nincs ilyen csapattag.' }); return false; }
    if (it.kind === 'heal') {
      if (m.hp <= 0 || m.hp >= m.stats.hp) { ev.push({ t: 'msg', text: 'Ennek most nincs hatása.' }); return false; }
      this.inventory[itemId]--;
      m.hp = Math.min(m.stats.hp, m.hp + it.heal);
      if (target === this.p.active) ev.push({ t: 'heal', side: 'p', hp: m.hp, max: m.stats.hp });
      ev.push({ t: 'msg', text: `${displayName(m)} gyógyult (${it.name}).` });
      return true;
    }
    if (it.kind === 'cure') {
      if (!m.status || (it.cures !== 'all' && it.cures !== m.status)) { ev.push({ t: 'msg', text: 'Ennek most nincs hatása.' }); return false; }
      this.inventory[itemId]--;
      m.status = null;
      if (target === this.p.active) ev.push({ t: 'status', side: 'p', status: null });
      ev.push({ t: 'msg', text: `${displayName(m)} meggyógyult!` });
      return true;
    }
    if (it.kind === 'revive') {
      if (m.hp > 0) { ev.push({ t: 'msg', text: 'Ennek most nincs hatása.' }); return false; }
      this.inventory[itemId]--;
      m.hp = Math.floor(m.stats.hp / 2);
      m._fainted = false;
      ev.push({ t: 'msg', text: `${displayName(m)} újra harcképes!` });
      return true;
    }
    ev.push({ t: 'msg', text: 'Ezt harcban nem lehet használni.' });
    return false;
  }

  finish(ev, result) {
    this.over = true;
    this.result = result;
    for (const m of this.p.party) delete m._fainted;
    for (const m of this.f.party) delete m._fainted;
    ev.push({ t: 'end', result });
  }
}
