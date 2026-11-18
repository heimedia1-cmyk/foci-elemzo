// Balansz-szimuláció (nem része a játéknak): fejlődési görbe, XP-megosztás, edzők, találkozások, gazdaság.
// Futtatás: node tools/balance-sim.mjs
import { createMexi, healFull, scaleWildLevel, canEvolve, evolve, xpForLevel } from '../public/src/systems/mexi.js';
import { BattleEngine } from '../public/src/systems/battleEngine.js';
import { MOVES } from '../public/src/data/moves.js';
import { MEXIS } from '../public/src/data/mexis.js';
import { MAPS, TRAINERS } from '../public/src/data/maps.js';
import { CONFIG } from '../public/src/data/config.js';
import { effectiveness } from '../public/src/data/types.js';
import { captureChance } from '../public/src/systems/capture.js';

const STEP_S = 0.27, BATTLE_S = 32, TRAINER_S = 70;
const pick = (t) => { const tot = t.reduce((a, [, w]) => a + w, 0); let r = Math.random() * tot; for (const [s, w] of t) if ((r -= w) < 0) return s; return t[0][0]; };
function best(e) { const m = e.pm; let bi = 0, bs = -1; m.moves.forEach((mv, i) => { const d = MOVES[mv.id]; if (mv.pp <= 0) return; const s = d.power ? d.power * effectiveness(d.type, MEXIS[e.fm.species].types) * (MEXIS[m.species].types.includes(d.type) ? 1.5 : 1) * (d.acc / 100) : 3; if (s > bs) { bs = s; bi = i; } }); return bi; }
function fight(party, foes, isTrainer, pots = 0) {
  const e = new BattleEngine({ playerParty: party, foeParty: foes, isTrainer, trainerName: 'x', inventory: { kis_ital: pots } }); let g = 0;
  while (!e.over && g++ < 400) {
    let ev;
    if (e.inventory.kis_ital > 0 && e.pm.hp < e.pm.stats.hp * 0.3) ev = e.playerAction({ type: 'item', itemId: 'kis_ital', target: e.p.active });
    else ev = e.playerAction({ type: 'move', index: best(e) });
    if (ev.some(x => x.t === 'needSwitch')) e.forcedSwitch(e.p.party.findIndex(m => m.hp > 0));
  }
  for (const m of party) for (const k of Object.keys(m)) if (k.startsWith('_')) delete m[k];
  return e.result;
}
const clone = (p) => p.map(m => JSON.parse(JSON.stringify(m)));
function winRate(party, trainer, n = 150) { let w = 0; for (let i = 0; i < n; i++) { const p = clone(party); p.forEach(healFull); if (fight(p, TRAINERS[trainer].team.map(([s, l]) => createMexi(s, l)), true, 2) === 'win') w++; } return w / n; }
function wild(mapKey, party, zone = false) {
  const enc = MAPS[mapKey].encounters; const src = zone ? enc.zones[0] : enc.default;
  const L = src.levels || enc.default.levels; const base = L[0] + Math.floor(Math.random() * (L[1] - L[0] + 1));
  return createMexi(pick(src.day || enc.default.day), scaleWildLevel(base, L[1], party));
}
function grind(party, mapKey, n, zone, stats) {
  for (let i = 0; i < n; i++) {
    const foe = wild(mapKey, party, zone);
    const r = fight(party, [foe], false);
    stats.battles++; stats.time += BATTLE_S + (CONFIG.encounterCooldownSteps + 1 / (MAPS[mapKey].cave ? CONFIG.encounterChanceCave : CONFIG.encounterChanceTallGrass)) * STEP_S;
    if (r === 'win') stats.money += Math.max(10, foe.level * 12); else if (r === 'lose') { stats.losses++; stats.money = Math.floor(stats.money * 0.9); }
    for (const m of party) { const to = canEvolve(m); if (to && m.hp > 0) evolve(m, to); }
    if (party.some(m => m.hp < m.stats.hp * 0.35) || r === 'lose') { party.forEach(healFull); stats.time += 20; }
  }
}
const lv = (p) => p.map(m => m.level).join('/');
function journey(share, verbose) {
  CONFIG.xpShare = share;
  const party = [createMexi('alap', 5), createMexi('beka', 3)]; const st = { battles: 0, time: 0, money: 1000, losses: 0 };
  const out = {};
  const gate = (tr, map, zone) => { let tries = 0; while (winRate(party, tr, 60) < 0.7 && tries++ < 60) grind(party, map, 3, zone, st); out[tr] = { lv: lv(party), battles: st.battles, min: Math.round(st.time / 60) }; st.time += TRAINER_S; };
  grind(party, 'osveny', 6, false, st);
  party.push(createMexi('mehecske', 5));
  gate('bence', 'osveny', false);
  party.push(createMexi('kacsa', 6));
  gate('lili', 'osveny', true);
  party.push(createMexi('banyasz', 9));
  gate('mate', 'erdo', false); gate('reka', 'erdo', false);
  gate('kristof', 'barlang', false); gate('hanna', 'barlang', true);
  out.end = { lv: lv(party), battles: st.battles, min: Math.round(st.time / 60) };
  // túl a tartalmon: grind a mély erdőben – mennyi idő a 20/30/40/50. szint (vezér Mexi)
  for (const target of [20, 30, 40, 50]) { let k = 0; while (Math.max(...party.map(m => m.level)) < target && k++ < 400) grind(party, 'erdo', 5, true, st); out['L' + target] = { lv: lv(party), battles: st.battles, h: +(st.time / 3600).toFixed(1) }; }
  return out;
}
const avg = (runs, key, f) => { const v = runs.map(r => f(r[key])).filter(x => Number.isFinite(x)); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : NaN; };
console.log('=== Fejlődés a tartalmon át (5 futás átlag), xpShare változatok ===');
for (const share of [0.35, 0.2, 0.5]) {
  const runs = Array.from({ length: 5 }, () => journey(share));
  const row = ['bence', 'lili', 'mate', 'reka', 'kristof', 'hanna', 'end'].map(k => `${k}: ${runs[0][k].lv} (${Math.round(avg(runs, k, x => x.battles))} harc, ${Math.round(avg(runs, k, x => x.min))} p)`).join(' | ');
  console.log(`xpShare ${share}: ${row}`);
  console.log('   szintcélok (vezér): ' + ['L20', 'L30', 'L40', 'L50'].map(k => `${k}: ${Math.round(avg(runs, k, x => x.battles))} harc / ${avg(runs, k, x => x.h).toFixed(1)} óra`).join(' | '));
}
CONFIG.xpShare = 0.35;
console.log('\n=== Találkozási gyakoriság ===');
for (const [p, cd] of [[0.13, 2], [0.10, 4], [0.08, 5], [0.10, 3]]) {
  const per = cd + 1 / p;
  console.log(`esély ${Math.round(p * 100)}%, várakozás ${cd}: átlag ${per.toFixed(1)} fűlépésenként egy harc (~${(per * STEP_S).toFixed(1)} mp séta)`);
}
// útvonal: legkevesebb fűlépés a Mexi-ösvényen dél→észak (Dijkstra, fű = 1 költség, egyéb = 0.01)
{
  const m = MAPS.osveny; const H = m.tiles.length, W = m.tiles[0].length; const { walkable } = await import('../public/src/data/mapNav.js'); const w = walkable('osveny');
  const start = { x: 15, y: 54 }, goal = (x, y) => y <= 1;
  const dist = new Map([[start.x + ',' + start.y, 0]]); const q = [[0, start.x, start.y]];
  let found = null;
  while (q.length) { q.sort((a, b) => a[0] - b[0]); const [d, x, y] = q.shift(); if (goal(x, y)) { found = d; break; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (!w.seen.has(k)) continue; const nd = d + (m.tiles[ny][nx] === '"' ? 1 : 0.01); if (nd < (dist.get(k) ?? 1e9)) { dist.set(k, nd); q.push([nd, nx, ny]); } } }
  const grassSteps = Math.round(found ?? -1);
  for (const [p, cd] of [[0.13, 2], [0.10, 4], [0.08, 5]]) console.log(`Mexi-ösvény átkelés (legkevesebb fű: ${grassSteps} fűmező): várható harcok ${(grassSteps / (cd + 1 / p)).toFixed(1)} (esély ${p * 100}% / ${cd})`);
}
console.log('\n=== Elkapási esélyek (teljes HP / 1/3 HP / 1/3 HP + alvás) ===');
for (const [sp, lvl] of [['alap', 5], ['virag', 8], ['lang', 10], ['kiber', 12], ['urhajos', 12], ['angyal', 12], ['fonix', 50]]) {
  const row = ['sima_labda', 'profi_labda', 'arany_labda', 'hos_labda'].map(b => {
    const m = createMexi(sp, lvl); const f = Math.round(captureChance(m, b) * 100); m.hp = Math.ceil(m.stats.hp / 3); const t = Math.round(captureChance(m, b) * 100); m.status = 'alvas'; const s = Math.round(captureChance(m, b) * 100);
    return `${b.replace('_labda', '')}: ${f}/${t}/${s}%`;
  }).join('  ');
  console.log(`${MEXIS[sp].name.padEnd(18)} (ritkaság ${MEXIS[sp].rarity}, fogás ${MEXIS[sp].catchRate}) ${row}`);
}

console.log('\n=== Gazdaság: 1 óra játék, 3 profil (a ~11-12. szintű tartalomnál) ===');
{
  const party0 = () => [createMexi('alap', 11), createMexi('beka', 11), createMexi('mehecske', 10), createMexi('kacsa', 10)];
  for (const [name, walkShare, catchEvery, buysBalls] of [['Kezdő (sok felfedezés)', 0.6, 3, true], ['Átlagos', 0.35, 4, true], ['Optimalizáló (csak farmol)', 0.05, 99, false]]) {
    const party = party0(); let money = 1000, t = 0, battles = 0, catches = 0, spent = 0, bones = 0;
    while (t < 3600) {
      t += walkShare * 60; // felfedezés, beszélgetés, menük
      const foe = wild('erdo', party, false); const r = fight(party, [foe], false); battles++; t += BATTLE_S + 9.7 * STEP_S;
      if (r === 'win') money += Math.max(10, foe.level * 12);
      if (battles % catchEvery === 0) { const cost = Math.round(100 / Math.max(0.15, captureChance(Object.assign(createMexi(foe.species, foe.level), { hp: 1 }), 'sima_labda'))); if (buysBalls) { money -= cost; spent += cost; } catches++; bones += 3; money += foe.level * 8; }
      if (party.some(m => m.hp < m.stats.hp * 0.35)) { party.forEach(healFull); t += 25; }
    }
    const pu = (lv) => 10 + lv * 15;
    console.log(`${name.padEnd(28)} harc ${battles}, elkapás ${catches}, kereset ${money - 1000 + spent} érme, labdára ${spent}, egyenleg ${money}, csont +${bones} → kb. ${Math.floor((money) / pu(12))} erősítés ára (12. szinten ${pu(12)} érme)`);
  }
  console.log('Küldetések naponta kb. 1000–1500 érme értékben; edzők visszavágója naponta 180–450 érme edzőnként.');
}

console.log('\n=== Mexidex: megszerzési mód fajonként ===');
{
  const how = {};
  const add = (sp, w) => { (how[sp] ||= new Set()).add(w); };
  for (const [k, m] of Object.entries(MAPS)) {
    const e = m.encounters; if (e) for (const src of [e.default, ...(e.zones || [])]) for (const t of [src.day, src.night]) for (const [sp] of t || []) add(sp, 'vad: ' + m.name);
    for (const r of m.roamers || []) add(r.species, 'kóborló: ' + m.name);
  }
  add('alap', 'kezdő Mexi'); add('beka', 'oktató-harc');
  let changed = true; while (changed) { changed = false; for (const [k, d] of Object.entries(MEXIS)) if (d.evolve && how[k] && !how[d.evolve.to]?.has('fejlődés')) { add(d.evolve.to, 'fejlődés'); changed = true; } }
  const missing = Object.keys(MEXIS).filter(k => !how[k]);
  const onlyEvo = Object.keys(MEXIS).filter(k => how[k] && [...how[k]].every(x => x === 'fejlődés'));
  console.log(`megszerezhető: ${Object.keys(how).length}/${Object.keys(MEXIS).length}; csak fejlődéssel: ${onlyEvo.length}; NEM megszerezhető: ${missing.join(', ')}`);
  for (const [k, d] of Object.entries(MEXIS)) if (d.evolve) { const lvl = d.evolve.level; const maxWild = 13 + 8; if (lvl > 30) console.log(`  figyelem: ${d.name} → ${MEXIS[d.evolve.to].name} csak ${lvl}. szinten (a tartalom ~13. szintig tart)`); }
}

console.log('\n=== 1v1 erőviszonyok (azonos szint, 20. szint, minden faj mindenki ellen, 40 harc/pár) ===');
{
  const sps = Object.keys(MEXIS).filter(k => !['sarkany', 'fonix', 'tengerur', 'aranymexi'].includes(k));
  const score = {};
  for (const a of sps) { let w = 0, n = 0; for (const b of sps) { if (a === b) continue; for (let i = 0; i < 40; i++) { const p = [createMexi(a, 20)], f = [createMexi(b, 20)]; if (fight(p, f, false) === 'win') w++; n++; } } score[a] = w / n; }
  const sorted = Object.entries(score).sort((x, y) => y[1] - x[1]);
  const base = (k) => Object.values(MEXIS[k].base).reduce((s, v) => s + v, 0);
  console.log('legerősebbek: ' + sorted.slice(0, 6).map(([k, v]) => `${MEXIS[k].name.replace(' Mexi', '')} ${Math.round(v * 100)}% (alap ${base(k)})`).join(', '));
  console.log('leggyengébbek: ' + sorted.slice(-6).map(([k, v]) => `${MEXIS[k].name.replace(' Mexi', '')} ${Math.round(v * 100)}% (alap ${base(k)})`).join(', '));
  const evoPairs = Object.entries(MEXIS).filter(([, d]) => d.evolve).map(([k, d]) => score[d.evolve.to] - score[k]);
  console.log(`fejlődés átlagos nyereség: +${Math.round(evoPairs.reduce((a, b) => a + b, 0) / evoPairs.length * 100)} százalékpont győzelmi arány`);
}
