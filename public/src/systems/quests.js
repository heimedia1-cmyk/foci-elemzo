// Napi küldetések egyedül játszóknak: minden nap 3 új feladat (a dátumból sorsolva), plusz egy heti nagy cél.
import { G } from './state.js';
import { MEXIS } from '../data/mexis.js';
import { TYPES } from '../data/types.js';

// key: melyik számláló; type: típus-feltétel; goal: mennyit; reward: { money } | { item, qty } | { bones }
const POOL = [
  { id: 'catch3', text: 'Kapj el 3 Mexit', key: 'caught', goal: 3, reward: { item: 'profi_labda', qty: 2 } },
  { id: 'catch5', text: 'Kapj el 5 Mexit', key: 'caught', goal: 5, reward: { money: 600 } },
  { id: 'win6', text: 'Győzz le 6 vad Mexit', key: 'wildWins', goal: 6, reward: { money: 400 } },
  { id: 'win10', text: 'Győzz le 10 vad Mexit', key: 'wildWins', goal: 10, reward: { item: 'nagy_ital', qty: 2 } },
  { id: 'type', text: 'Kapj el 2 {type} típusú Mexit', key: 'typeCaught', goal: 2, typed: true, reward: { item: 'arany_labda', qty: 1 } },
  { id: 'steps', text: 'Tegyél meg 400 lépést a térképen', key: 'steps', goal: 400, reward: { item: 'sima_labda', qty: 5 } },
  { id: 'trainer', text: 'Nyerj meg 1 edzőcsatát (újrahívás is számít)', key: 'trainerWins', goal: 1, reward: { money: 500 } },
  { id: 'levels', text: 'Lépj szintet 4-szer bármelyik Mexiddel', key: 'levelUps', goal: 4, reward: { item: 'ebreszto', qty: 1 } },
  { id: 'transfer', text: 'Adj át 2 Mexit a Professzornak', key: 'transfers', goal: 2, reward: { bonesAny: 3 } },
  { id: 'super', text: 'Találj el 5-ször nagyon hatásos támadással', key: 'superHits', goal: 5, reward: { item: 'profi_labda', qty: 3 } },
];
const WEEKLY = { id: 'weekly', text: 'Heti cél: kapj el 25 Mexit', key: 'caught', goal: 25, reward: { item: 'hos_labda', qty: 1 } };
const TYPE_POOL = ['tuz', 'viz', 'noveny', 'fold', 'arnyek', 'villam', 'jeg', 'feny', 'gep', 'semleges'];

const pad = (n) => String(n).padStart(2, '0');
/** Helyi dátum (ÉÉÉÉ-HH-NN). A napi küldetések helyi éjfélkor váltanak. */
export const dayId = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** A hét azonosítója = a hét HÉTFŐJÉNEK helyi dátuma. A heti cél hétfő 00:00-kor vált. */
export const weekId = (d = new Date()) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return 'W' + dayId(m); };
const today = () => dayId();
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** A mai küldetések (ha új nap van, újakat sorsol). */
export function dailyQuests() {
  const s = G.state; const d = today();
  s.questLog ??= { daily: {}, weekly: {} }; // átvett jutalmak naplója (óra-/időzónaváltás ellen)
  if (!s.quests || s.quests.date !== d) {
    const seed = hash(d + (s.player?.name || ''));
    const picks = []; const pool = [...POOL];
    for (let i = 0; picks.length < 3 && pool.length; i++) {
      const q = pool.splice((seed >>> (i * 3)) % pool.length, 1)[0];
      if (!picks.some(p => p.key === q.key || (q.key === 'typeCaught' && p.key === 'caught') || (q.key === 'caught' && p.key === 'typeCaught'))) picks.push(q);
    }
    const type = TYPE_POOL[seed % TYPE_POOL.length];
    const done = s.questLog.daily[d] || [];
    s.quests = { date: d, type, list: picks.map(q => ({ id: q.id, prog: done.includes(q.id) ? questDef(q.id).goal : 0, claimed: done.includes(q.id) })) };
  }
  const w = weekId();
  if (!s.weekly || s.weekly.week !== w) s.weekly = { week: w, prog: s.questLog.weekly[w] ? WEEKLY.goal : 0, claimed: !!s.questLog.weekly[w] };
  return s.quests;
}
export const questDef = (id) => (id === 'weekly' ? WEEKLY : POOL.find(q => q.id === id));
export const questText = (q) => questDef(q.id).text.replace('{type}', TYPES[G.state.quests.type]?.name || '');
export const rewardText = (r) => r.money ? `${r.money} érme` : r.item ? `${r.qty}× ${r.item}` : `${r.bonesAny} csont`;

/** Esemény jelzése a játékból: questEvent('caught', { species }) stb. */
export function questEvent(key, info = {}, n = 1) {
  if (!G.state) return;
  const q = dailyQuests(); let done = null;
  for (const it of q.list) {
    const def = questDef(it.id); if (it.claimed || it.prog >= def.goal) continue;
    let k = key;
    if (def.key === 'typeCaught') { if (key !== 'caught' || !MEXIS[info.species]?.types.includes(q.type)) continue; k = 'typeCaught'; }
    if (def.key !== k) continue;
    it.prog = Math.min(def.goal, it.prog + n);
    if (it.prog >= def.goal) done = def;
  }
  if (key === WEEKLY.key && !G.state.weekly.claimed) G.state.weekly.prog = Math.min(WEEKLY.goal, G.state.weekly.prog + n);
  return done;
}

/** Jutalom átvétele. */
export function claimQuest(id) {
  const s = G.state; const def = questDef(id);
  const it = id === 'weekly' ? s.weekly : s.quests.list.find(x => x.id === id);
  if (!it || it.claimed || it.prog < def.goal) return null;
  it.claimed = true;
  s.questLog ??= { daily: {}, weekly: {} };
  if (id === 'weekly') s.questLog.weekly[s.weekly.week] = true; else (s.questLog.daily[s.quests.date] ||= []).push(id);
  for (const k of ['daily', 'weekly']) { const keys = Object.keys(s.questLog[k]).sort(); for (const old of keys.slice(0, -21)) delete s.questLog[k][old]; }
  const r = def.reward;
  if (r.money) s.money += r.money;
  if (r.item) s.inventory[r.item] = (s.inventory[r.item] || 0) + r.qty;
  if (r.bonesAny) { const fam = s.party[0] ? familyOf(s.party[0].species) : 'alap'; s.bones[fam] = (s.bones[fam] || 0) + r.bonesAny; }
  return r;
}
function familyOf(sp) { for (const [k, d] of Object.entries(MEXIS)) if (d.evolve?.to === sp) return familyOf(k); return sp; }
