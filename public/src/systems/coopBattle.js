// Közös (2v2) harc logikája – a szerveren fut, így a két játékos ugyanazt látja.
// Két játékos egy-egy aktív Mexivel harcol két vad Mexi ellen.
// Szintkiegyenlítés: a harcban a túl erős Mexik a közös szinthatárra állnak be (csak erre a harcra).
import { MEXIS } from '../data/mexis.js';
import { MOVES, STATUS } from '../data/moves.js';
import { ITEMS } from '../data/items.js';
import { CONFIG } from '../data/config.js';
import { effectiveness, effectivenessText } from '../data/types.js';
import { calcDamage, stageMult } from './battleEngine.js';
import { calcStats, displayName, gainXp, xpYield, rand, randInt } from './mexi.js';
import { throwBall } from './capture.js';

const STRUGGLE = { name: 'Küzdelem', type: 'semleges', cat: 'fiz', power: 40, acc: 100, pp: 1 };
const clone = (o) => JSON.parse(JSON.stringify(o));
const newStages = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

/** Egy Mexi harci másolata a szinthatárral. */
function battleCopy(m, cap) {
  const c = clone(m);
  c._realLevel = m.level;
  if (c.level > cap) {
    const ratio = m.hp / m.stats.hp;
    c.level = cap;
    c.stats = calcStats(c);
    c.hp = m.hp <= 0 ? 0 : Math.max(1, Math.round(c.stats.hp * ratio));
  }
  return c;
}

export function coopLevelCap(levelA, levelB, areaMax) {
  return Math.max(Math.min(levelA, levelB) + 3, areaMax + 2);
}

export class CoopBattle {
  /**
   * @param players [{ id, name, party: [Mexi], inventory: {} }]  (2 játékos)
   * @param foes [Mexi, Mexi]
   * @param cap  szinthatár a harcra
   */
  constructor({ players, foes, cap }) {
    this.cap = cap;
    this.allies = players.map((p) => {
      const party = p.party.map(m => battleCopy(m, cap));
      const active = party.findIndex(m => m.hp > 0);
      return { id: p.id, name: p.name, real: p.party, party, active, stages: newStages(), sleep: 0, participants: new Set([active]), inventory: p.inventory || {}, caught: [], coins: 0, xpLog: [] };
    });
    this.foes = foes.map(m => ({ mon: m, stages: newStages(), sleep: 0, gone: false }));
    this.pending = {};
    this.over = false;
    this.result = null;
    this.turn = 0;
  }

  // ---- állapot a klienseknek ----
  snapshot() {
    const mon = (m) => m && ({ species: m.species, nickname: m.nickname, level: m.level, hp: m.hp, max: m.stats.hp, status: m.status, shiny: m.shiny, moves: m.moves });
    return {
      turn: this.turn, cap: this.cap,
      allies: this.allies.map(a => ({ id: a.id, name: a.name, active: a.active, out: !this.canAct(a), mon: mon(a.party[a.active]), party: a.party.map(m => ({ species: m.species, nickname: m.nickname, level: m.level, hp: m.hp, max: m.stats.hp, status: m.status })) })),
      foes: this.foes.map(f => ({ gone: f.gone, mon: mon(f.mon) })),
    };
  }

  canAct(a) { return a.party.some(m => m.hp > 0) && a.party[a.active]?.hp > 0; }
  livingFoes() { return this.foes.map((f, i) => i).filter(i => !this.foes[i].gone && this.foes[i].mon.hp > 0); }
  waitingFor() { return this.allies.filter(a => this.canAct(a) && !this.pending[a.id]).map(a => a.id); }

  ref(kind, i) { return kind + i; }
  label(r) {
    const k = r[0], i = +r[1];
    if (k === 'a') { const a = this.allies[i]; return `${a.name} ${displayName(a.party[a.active])}`; }
    return `A vad ${displayName(this.foes[i].mon)}`;
  }
  monOf(r) { const i = +r[1]; return r[0] === 'a' ? this.allies[i].party[this.allies[i].active] : this.foes[i].mon; }
  sideOf(r) { const i = +r[1]; return r[0] === 'a' ? this.allies[i] : this.foes[i]; }

  /** Egy játékos lépése. Ha mindenki lépett, a kör lefut és visszaadja az eseményeket. */
  submit(playerId, action) {
    if (this.over) return null;
    const a = this.allies.find(x => x.id === playerId);
    if (!a || !this.canAct(a)) return null;
    this.pending[playerId] = action;
    if (this.waitingFor().length) return null;
    return this.resolve();
  }

  /** Időtúllépés: aki nem lépett, az első használható támadását használja. */
  forceResolve() {
    for (const id of this.waitingFor()) this.pending[id] = { type: 'move', index: 0, target: this.livingFoes()[0] ?? 0 };
    return this.resolve();
  }

  speedOf(r) { const m = this.monOf(r); let s = m.stats.spe * stageMult(this.sideOf(r).stages.spe); if (m.status === 'benitas') s *= 0.5; return s; }

  resolve() {
    const ev = [];
    this.turn++;
    const acts = [];
    // 1) futás: bármelyik játékos választja → mindenki elmenekül
    for (const [i, a] of this.allies.entries()) {
      const act = this.pending[a.id];
      if (act?.type === 'run') {
        ev.push({ t: 'msg', text: `${a.name}: Fussunk!` }, { t: 'msg', text: 'Sikerült elmenekülni!' });
        return this.finish(ev, 'run');
      }
    }
    // 2) csere, tárgy, labda – támadás előtt
    for (const [i, a] of this.allies.entries()) {
      const act = this.pending[a.id];
      if (!act || !this.canAct(a)) continue;
      if (act.type === 'switch') this.doSwitch(i, act.index, ev);
      else if (act.type === 'item') this.useItem(i, act, ev);
      else if (act.type === 'ball') { this.throwBall(i, act, ev); if (this.checkEnd(ev)) return this.done(ev); }
      else if (act.type === 'move') acts.push({ ref: 'a' + i, index: act.index, target: act.target });
    }
    // 3) vad Mexik célpontot választanak
    for (const fi of this.livingFoes()) {
      const f = this.foes[fi];
      const usable = f.mon.moves.map((mv, k) => ({ mv, k })).filter(x => x.mv.pp > 0);
      const targets = this.allies.map((a, k) => k).filter(k => this.canAct(this.allies[k]));
      if (!targets.length) break;
      acts.push({ ref: 'f' + fi, index: usable.length ? usable[randInt(0, usable.length - 1)].k : -1, target: targets[randInt(0, targets.length - 1)] });
    }
    // 4) sorrend: elsőbbség, majd sebesség
    const pri = (x) => { const m = this.monOf(x.ref); const mv = m.moves[x.index]; return mv ? (MOVES[mv.id].priority || 0) : 0; };
    acts.sort((x, y) => pri(y) - pri(x) || this.speedOf(y.ref) - this.speedOf(x.ref) || rand() - 0.5);
    for (const act of acts) {
      const m = this.monOf(act.ref);
      if (!m || m.hp <= 0) continue;
      if (act.ref[0] === 'f' && this.foes[+act.ref[1]].gone) continue;
      // célpont újraválasztása, ha az eredeti már nincs
      let tRef;
      if (act.ref[0] === 'a') {
        const live = this.livingFoes();
        if (!live.length) break;
        tRef = 'f' + (live.includes(act.target) ? act.target : live[0]);
      } else {
        const live = this.allies.map((a, k) => k).filter(k => this.canAct(this.allies[k]));
        if (!live.length) break;
        tRef = 'a' + (live.includes(act.target) ? act.target : live[0]);
      }
      this.executeMove(act.ref, act.index, tRef, ev);
      this.checkFaints(ev);
      if (this.checkEnd(ev)) return this.done(ev);
    }
    this.endOfTurn(ev);
    this.checkFaints(ev);
    this.checkEnd(ev);
    return this.done(ev);
  }

  done(ev) { this.pending = {}; return ev; }

  executeMove(r, idx, tRef, ev) {
    const side = this.sideOf(r), att = this.monOf(r), def = this.monOf(tRef), tSide = this.sideOf(tRef);
    const name = this.label(r);
    if (att.status === 'alvas') {
      if (side.sleep > 0) { side.sleep--; ev.push({ t: 'msg', text: `${name} alszik...` }); return; }
      att.status = null; ev.push({ t: 'status', ref: r, status: null }, { t: 'msg', text: `${name} felébredt!` });
    }
    if (att.status === 'fagyas') {
      if (rand() < 0.2) { att.status = null; ev.push({ t: 'status', ref: r, status: null }, { t: 'msg', text: `${name} kiolvadt!` }); }
      else { ev.push({ t: 'msg', text: `${name} le van fagyva!` }); return; }
    }
    if (att.status === 'benitas' && rand() < 0.25) { ev.push({ t: 'msg', text: `${name} béna, nem tud mozdulni!` }); return; }
    let move;
    if (idx < 0 || !att.moves[idx] || att.moves[idx].pp <= 0) {
      const alt = att.moves.findIndex(x => x.pp > 0);
      if (alt >= 0) { idx = alt; att.moves[idx].pp--; move = MOVES[att.moves[idx].id]; } else move = STRUGGLE;
    } else { att.moves[idx].pp--; move = MOVES[att.moves[idx].id]; }
    // státusz-támadások a saját oldalra hatnak, ha 'self' a célpont
    const selfTarget = move.cat === 'stat' && (move.effect?.target === 'self' || move.effect?.heal);
    const T = selfTarget ? r : tRef, TM = selfTarget ? att : def, TS = selfTarget ? side : tSide;
    ev.push({ t: 'msg', text: `${name}: ${move.name}!` }, { t: 'anim', ref: r, target: T, moveType: move.type, cat: move.cat });
    if (rand() * 100 >= move.acc) { ev.push({ t: 'msg', text: 'De nem talált!' }); return; }
    if (move.power > 0) {
      const { dmg, eff, crit } = calcDamage(att, def, move, side.stages, tSide.stages);
      if (eff === 0) { ev.push({ t: 'msg', text: `${this.label(tRef)}: ${effectivenessText(0)}` }); return; }
      def.hp = Math.max(0, def.hp - dmg);
      ev.push({ t: 'damage', ref: tRef, hp: def.hp, max: def.stats.hp, eff, crit });
      if (crit) ev.push({ t: 'msg', text: 'Kritikus találat!' });
      const et = effectivenessText(eff); if (et) ev.push({ t: 'msg', text: et });
      if (r[0] === 'a') this.allies[+r[1]].participants.add(this.allies[+r[1]].active);
    }
    const e = move.effect;
    if (!e) return;
    if (e.status && TM.hp > 0 && !selfTarget) {
      const chance = e.chance ?? 100;
      if (!TM.status && rand() * 100 < chance && !(e.status === 'eges' && MEXIS[TM.species].types.includes('tuz')) && !(e.status === 'fagyas' && MEXIS[TM.species].types.includes('jeg'))) {
        TM.status = e.status; if (e.status === 'alvas') TS.sleep = randInt(1, 3);
        ev.push({ t: 'status', ref: T, status: e.status }, { t: 'msg', text: `${this.label(T)}: ${STATUS[e.status].name}!` });
      } else if (move.cat === 'stat') ev.push({ t: 'msg', text: 'Nem sikerült!' });
    }
    if (e.stat && TM.hp > 0) {
      if (e.chance && rand() * 100 >= e.chance) return;
      const st = TS.stages; const before = st[e.stat];
      st[e.stat] = Math.max(-6, Math.min(6, st[e.stat] + e.stages));
      if (before !== st[e.stat]) ev.push({ t: 'stat', ref: T, stages: e.stages }, { t: 'msg', text: `${this.label(T)}: ${e.stages > 0 ? 'erősödött' : 'gyengült'}!` });
    }
    if (e.heal) {
      const b = att.hp; att.hp = Math.min(att.stats.hp, att.hp + Math.floor(att.stats.hp * e.heal));
      if (att.hp > b) ev.push({ t: 'heal', ref: r, hp: att.hp, max: att.stats.hp }, { t: 'msg', text: `${name} gyógyult!` });
    }
  }

  endOfTurn(ev) {
    const refs = [...this.allies.map((a, i) => 'a' + i).filter((r, i) => this.canAct(this.allies[i])), ...this.livingFoes().map(i => 'f' + i)];
    for (const r of refs) {
      const m = this.monOf(r);
      if (m.hp > 0 && (m.status === 'eges' || m.status === 'mereg')) {
        m.hp = Math.max(0, m.hp - Math.max(1, Math.floor(m.stats.hp / 8)));
        ev.push({ t: 'msg', text: `${this.label(r)}: ${m.status === 'eges' ? 'megégett' : 'mérgezés sebzi'}!` }, { t: 'damage', ref: r, hp: m.hp, max: m.stats.hp, eff: 1, dot: true });
      }
    }
  }

  checkFaints(ev) {
    this.foes.forEach((f, i) => {
      if (f.gone || f.mon.hp > 0) return;
      f.gone = true;
      ev.push({ t: 'faint', ref: 'f' + i }, { t: 'msg', text: `${this.label('f' + i)} harcképtelen lett!` });
      this.reward(f.mon, ev);
    });
    this.allies.forEach((a, i) => {
      const m = a.party[a.active];
      if (!m || m.hp > 0 || m._fainted) return;
      m._fainted = true;
      ev.push({ t: 'faint', ref: 'a' + i }, { t: 'msg', text: `${a.name} ${displayName(m)} harcképtelen lett!` });
      const next = a.party.findIndex(x => x.hp > 0);
      if (next >= 0) this.doSwitch(i, next, ev, true);
      else ev.push({ t: 'msg', text: `${a.name} összes Mexije kidőlt. A társa folytatja!` });
    });
  }

  /** Minden játékos külön kap jutalmat: XP (harcoló teljes, többi fél), érme. */
  reward(foe, ev) {
    for (const a of this.allies) {
      const amount = xpYield(foe, false);
      a.coins += Math.max(10, Math.round(foe.level * 12));
      a.party.forEach((m, k) => {
        if (m.hp <= 0) return;
        const got = a.participants.has(k) ? amount : Math.max(1, Math.floor(amount * CONFIG.xpShare));
        a.xpLog.push({ index: k, xp: got });
      });
      a.participants = new Set([a.active]);
    }
    ev.push({ t: 'msg', text: `Mindketten XP-t és ${Math.max(10, Math.round(foe.level * 12))} érmét kaptatok!` });
  }

  doSwitch(i, index, ev, forced = false) {
    const a = this.allies[i];
    if (!a.party[index] || a.party[index].hp <= 0 || index === a.active) return;
    a.active = index; a.stages = newStages(); a.sleep = a.party[index].status === 'alvas' ? randInt(1, 2) : 0;
    a.participants.add(index);
    ev.push({ t: 'switch', ref: 'a' + i, mon: this.snapshot().allies[i].mon }, { t: 'msg', text: `${a.name}: Rajta, ${displayName(a.party[index])}!` });
  }

  useItem(i, act, ev) {
    const a = this.allies[i]; const it = ITEMS[act.itemId]; const m = a.party[act.target ?? a.active];
    if (!it || !m || !(a.inventory[act.itemId] > 0)) return;
    if (it.kind === 'heal' && m.hp > 0 && m.hp < m.stats.hp) { a.inventory[act.itemId]--; m.hp = Math.min(m.stats.hp, m.hp + it.heal); }
    else if (it.kind === 'cure' && m.status && (it.cures === 'all' || it.cures === m.status)) { a.inventory[act.itemId]--; m.status = null; }
    else if (it.kind === 'revive' && m.hp <= 0) { a.inventory[act.itemId]--; m.hp = Math.floor(m.stats.hp / 2); m._fainted = false; }
    else { ev.push({ t: 'msg', text: 'Ennek most nincs hatása.' }); return; }
    if ((act.target ?? a.active) === a.active) ev.push({ t: 'heal', ref: 'a' + i, hp: m.hp, max: m.stats.hp });
    ev.push({ t: 'msg', text: `${a.name} használta: ${it.name}.` }, { t: 'party', ref: 'a' + i, party: this.snapshot().allies[i].party });
  }

  throwBall(i, act, ev) {
    const a = this.allies[i];
    const live = this.livingFoes(); if (!live.length) return;
    const ti = live.includes(act.target) ? act.target : live[0];
    if (!(a.inventory[act.itemId] > 0)) return;
    a.inventory[act.itemId]--;
    const f = this.foes[ti];
    const r = throwBall(f.mon, act.itemId);
    ev.push({ t: 'msg', text: `${a.name} eldobta: ${ITEMS[act.itemId].name}!` }, { t: 'ball', ref: 'a' + i, target: 'f' + ti, itemId: act.itemId, shakes: r.shakes, caught: r.caught });
    if (r.caught) {
      f.gone = true;
      a.caught.push(f.mon);
      ev.push({ t: 'msg', text: `Megvan! ${MEXIS[f.mon.species].name} ${a.name} csapatába került!` });
      this.reward(f.mon, ev);
    } else ev.push({ t: 'msg', text: ['Kiugrott!', 'Majdnem sikerült!', 'Hajszálon múlt!', 'Hajszálon múlt!'][r.shakes] });
  }

  checkEnd(ev) {
    if (this.over) return true;
    if (!this.livingFoes().length) { this.finish(ev, 'win'); return true; }
    if (!this.allies.some(a => this.canAct(a))) { ev.push({ t: 'msg', text: 'Mindkettőtök Mexijei kidőltek...' }); this.finish(ev, 'lose'); return true; }
    return false;
  }

  finish(ev, result) {
    this.over = true; this.result = result;
    ev.push({ t: 'end', result });
    return ev;
  }

  /** Harc utáni eredmény egy játékosnak: a valódi Mexijei frissítve (HP arányosan, XP, státusz, PP). */
  resultFor(playerId) {
    const a = this.allies.find(x => x.id === playerId);
    const party = a.real.map((real, k) => {
      const c = a.party[k];
      const m = clone(real);
      m.hp = c.hp <= 0 ? 0 : Math.max(1, Math.round((c.hp / c.stats.hp) * m.stats.hp));
      m.status = c.status; m.moves = c.moves.map(x => ({ ...x }));
      return m;
    });
    const events = [];
    for (const { index, xp } of a.xpLog) {
      const m = party[index]; if (!m || m.hp <= 0) continue;
      for (const r of gainXp(m, xp)) events.push({ ...r, index, name: displayName(m) });
    }
    const totalXp = a.xpLog.reduce((s, x) => s + x.xp, 0);
    return { result: this.result, party, caught: a.caught.map(clone), coins: this.result === 'lose' ? 0 : a.coins, inventory: a.inventory, xpEvents: events, totalXp };
  }
}
