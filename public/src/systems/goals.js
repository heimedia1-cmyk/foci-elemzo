// „Következő cél”: a játék állásából kiszámolt, mindig látható iránymutatás (tiszta függvény, tesztelhető).
import { MEXIS } from '../data/mexis.js';

const UNOBTAINABLE = ['sarkany', 'fonix', 'tengerur', 'aranymexi'];
export function nextGoal(s) {
  const f = s.flags || {}, d = s.defeatedTrainers || [];
  const beat = (...t) => t.every(x => d.includes(x));
  if (!f.starter) return { short: 'Látogasd meg Prof. Szimatot', long: 'Menj be Mancsfalván a Mexi-kutató laborba, és beszélj Prof. Szimattal – ő adja az első Mexidet.' };
  if (!f.firstFrog) return { short: 'Kapd el az első vad Mexit', long: 'Menj északra a Mexi-ösvényre, és sétálj a magas fűben. Ha előbukkan egy vad Mexi, gyengítsd le, majd dobj rá teniszlabdát.' };
  if (!beat('bence')) return { short: 'Győzd le Bencét', long: 'Bence a Mexi-ösvényen vár (a falutól északra). Ha megsérültek a Mexijeid, a falu gyógyítóállomásán ingyen meggyógyulnak.' };
  if (!beat('lili')) return { short: 'Győzd le Lilit', long: 'Lili, a kalandor a Mexi-ösvényen vár. Ha legyőzöd, az erdőőr átenged a Titokzatos Erdőbe.' };
  if (!beat('mate', 'reka') && s.map !== 'erdo') return { short: 'Irány a Titokzatos Erdő', long: 'A Mexi-ösvény északi végén az erdőőr már átenged. Az erdőben Máté és Réka edzők várnak.' };
  if (!beat('mate', 'reka')) return { short: 'Edzők a Titokzatos Erdőben', long: 'Győzd le Mátét és Rékát a Titokzatos Erdőben.' };
  if (!beat('kristof', 'hanna')) return { short: 'Fedezd fel a Kristálybarlangot', long: 'A Kristálybarlang bejárata a Mexi-ösvény nyugati oldalán van. Bent Kristóf és Hanna vár – és egy kincsesláda a tó mögött.' };
  const all = Object.keys(MEXIS).filter(k => !UNOBTAINABLE.includes(k)).length;
  const have = Object.keys(s.dex?.caught || {}).filter(k => !UNOBTAINABLE.includes(k)).length;
  if (have < all) return { short: `Mexidex: ${have}/${all}`, long: `Gyűjtsd össze az összes megszerezhető Mexit (${have}/${all}). Nézd meg a Mexidexben, hol élnek – sok csak fejlődéssel szerezhető meg. Hamarosan: Holdmancs-aréna!` };
  return { short: 'Hamarosan: Holdmancs-aréna', long: 'Minden jelenlegi kihívást teljesítettél! Erősítsd a csapatod, gyűjts shiny Mexiket – a Holdmancs-aréna hamarosan megnyílik.' };
}
