// „Következő cél”: a játék állásából kiszámolt, mindig látható iránymutatás (tiszta függvény, tesztelhető).
import { MEXIS } from '../data/mexis.js';

const UNOBTAINABLE = ['sarkany', 'fonix', 'tengerur', 'aranymexi'];
const GYMS = [
  ['lotti', 'Győzd le Lottit (Nádas Gym)', 'Holdtisztásról keletre, a Nádas-mocsáron túl van Nádas falu. Lotti Víz Mexikkel harcol – Villám és Növény támadás kell ellene.'],
  ['volt', 'Győzd le Voltot (Neonváros Gym)', 'Nádasról keletre, a Neon-sztrádán túl Neonváros. Volt Villám Mexikkel harcol – a Föld Mexik bírják a legjobban.'],
  ['kaori', 'Győzd le Kaorit (Sakura-liget Gym)', 'Neonvárosból északra, a Sakura-ösvényen át éred el Sakura-ligetet. Kaori Árnyék Mexikkel harcol – Fény kell ellene.'],
  ['frida', 'Győzd le Fridát (Jégvár Gym)', 'Sakura-ligetből északra, a Fagyos hágón túl Jégvár. Frida Jég Mexikkel harcol – hozz Tűz Mexit!'],
  ['pal', 'Győzd le Parázs Pált (Sárkányhegy Gym)', 'Jégvárból keletre, a Hamu-úton túl Sárkányhegy. Pál Tűz Mexikkel harcol – Víz és Föld kell ellene.'],
  ['luna', 'Győzd le Lunát, a bajnokot!', 'Sárkányhegyről északra a Holdmancs-aréna. Luna Fény Mexikkel harcol – az Árnyék Mexik bírják a legjobban.'],
];
export function nextGoal(s) {
  const f = s.flags || {}, d = s.defeatedTrainers || [];
  const beat = (...t) => t.every(x => d.includes(x));
  if (!f.starter) return { short: 'Látogasd meg Prof. Szimatot', long: 'Menj be Mancsfalván a Mexi-kutató laborba, és beszélj Prof. Szimattal – ő adja az első Mexidet.' };
  if (!f.firstFrog) return { short: 'Kapd el az első vad Mexit', long: 'Menj északra a Mexi-ösvényre, és sétálj a magas fűben. Ha előbukkan egy vad Mexi, gyengítsd le, majd dobj rá teniszlabdát.' };
  if (!beat('bence')) return { short: 'Győzd le Bencét', long: 'Bence a Mexi-ösvényen vár (a falutól északra). Ha megsérültek a Mexijeid, a falu gyógyítóállomásán ingyen meggyógyulnak.' };
  if (!beat('lili')) return { short: 'Győzd le Lilit', long: 'Lili, a kalandor a Mexi-ösvényen vár. Ha legyőzöd, az erdőőr átenged a Titokzatos Erdőbe.' };
  if (!beat('mate', 'reka') && s.map !== 'erdo') return { short: 'Irány a Titokzatos Erdő', long: 'A Mexi-ösvény északi végén az erdőőr már átenged. Az erdőben Máté és Réka edzők várnak.' };
  if (!beat('mate', 'reka')) return { short: 'Edzők a Titokzatos Erdőben', long: 'Győzd le Mátét és Rékát a Titokzatos Erdőben.' };
  if (!beat('bodza')) return { short: 'Győzd le Bodzát (Mancsfalva Gym)', long: 'Menj vissza Mancsfalvára, és lépj be a Gymbe (a nagy narancs épület). Bodza Semleges Mexikkel harcol. Ha megvan a Napmancs-jelvény, Holdtisztás keleti kapuján átmehetsz a Nádas-mocsárba.' };
  for (const [id, short, long] of GYMS) if (!beat(id)) return { short, long };
  const all = Object.keys(MEXIS).filter(k => !UNOBTAINABLE.includes(k)).length;
  const have = Object.keys(s.dex?.caught || {}).filter(k => !UNOBTAINABLE.includes(k)).length;
  if (have < all) return { short: `Mexidex: ${have}/${all}`, long: `Gyűjtsd össze az összes megszerezhető Mexit (${have}/${all}). Nézd meg a Mexidexben, hol élnek – sok csak fejlődéssel szerezhető meg. ` };
  return { short: '👑 Bajnok vagy!', long: 'Legyőzted Lunát, te vagy a MexiVerse bajnoka! Gyűjts shiny Mexiket, és hívd ki a gym-vezetőket visszavágóra.' };
}
