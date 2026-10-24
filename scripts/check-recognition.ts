// Contrôle de la reconnaissance (module 3, M3.7), sans réseau. Lancer : npm run check:recognition
import { readSeen, badgesToCelebrate, congratsText, employeeOfMonthPost, monthLabel, BADGE_NAMES } from '../src/utils/recognition';
import type { Badge } from '../src/utils/performanceScore';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const b = (id: Badge['id'], level: 1 | 2 | 3): Badge => ({ id, level, value: 0, why: { fr: 'x', en: 'x' } });

// première fois : on mémorise sans féliciter
{
  const r = badgesToCelebrate(null, [b('quality', 2), b('rookie', 1)]);
  ok(r.celebrate.length === 0 && r.next.quality === 2 && r.next.rookie === 1, 'première fois : rien à fêter, tout est mémorisé');
}
// nouveau badge, niveau plus haut, même niveau, niveau plus bas
{
  const seen = { quality: 1 as number };
  ok(badgesToCelebrate(seen, [b('quality', 1)]).celebrate.length === 0, 'même niveau : pas de message');
  const up = badgesToCelebrate(seen, [b('quality', 2)]);
  ok(up.celebrate.length === 1 && up.celebrate[0].level === 2 && up.next.quality === 2, 'niveau plus haut : message, mémoire montée');
  const nw = badgesToCelebrate(seen, [b('quality', 1), b('punctuality', 1)]);
  ok(nw.celebrate.length === 1 && nw.celebrate[0].id === 'punctuality', 'nouveau badge : message pour lui seul');
  const down = badgesToCelebrate({ quality: 3 }, [b('quality', 1)]);
  ok(down.celebrate.length === 0 && down.next.quality === 3, 'niveau plus bas : pas de message, la mémoire ne baisse jamais');
  const lost = badgesToCelebrate({ quality: 2 }, []);
  ok(lost.celebrate.length === 0 && lost.next.quality === 2, 'badge perdu : rien, mémoire gardée (pas de faux message au regain)');
  const two = badgesToCelebrate({}, [b('quality', 3), b('rendement', 1), b('versatility', 2)]);
  ok(two.celebrate.length === 3, 'mémoire vide mais non nulle : tous les badges sont fêtés');
}
// données non modifiées
{
  const seen = { quality: 1 }, cur = [b('quality', 2)];
  const s1 = JSON.stringify([seen, cur]);
  badgesToCelebrate(seen, cur);
  ok(JSON.stringify([seen, cur]) === s1, 'les données reçues ne sont pas modifiées');
}
// lecture de la mémoire
{
  ok(readSeen(null) === null && readSeen('') === null && readSeen('pas du json') === null && readSeen('[1,2]') === null && readSeen('"x"') === null && readSeen('null') === null, 'mémoire absente ou cassée : « première fois »');
  const r = readSeen(JSON.stringify({ quality: 2, punctuality: 9, rendement: '3', hack: 1, rookie: 1.5, regularity: 0 }));
  ok(r !== null && r.quality === 2 && !('punctuality' in r) && !('rendement' in r) && !('hack' in r) && !('rookie' in r) && !('regularity' in r), 'mémoire : seuls les niveaux 1 à 3 entiers de badges connus sont gardés');
  ok(JSON.stringify(readSeen('{}')) === '{}', 'mémoire vide valide : {} (différent de « jamais rien mémorisé »)');
}
// textes de félicitations
{
  ok(congratsText(b('quality', 3), 'fr') === 'Bravo ! Tu as obtenu le badge « Qualité », niveau Or.', 'félicitations FR');
  ok(congratsText(b('punctuality', 1), 'en') === 'Congratulations! You earned the “Punctuality” badge, Bronze level.', 'félicitations EN');
  ok(congratsText(b('rookie', 1), 'fr') === 'Bravo ! Tu as obtenu le badge « Recrue prometteuse ».' && !congratsText(b('rookie', 1), 'fr').includes('niveau'), 'recrue : pas de niveau dans le message');
  ok((Object.keys(BADGE_NAMES) as Array<keyof typeof BADGE_NAMES>).every(k => !/[àâçéèêëîïôùûœ]/i.test(BADGE_NAMES[k].en) && BADGE_NAMES[k].fr && BADGE_NAMES[k].en), 'noms de badges : FR et EN, pas d\'accent dans l\'anglais');
  ok(!/\d+\s*(Ar|MGA|€)/.test(congratsText(b('quality', 2), 'fr')), 'aucun montant dans les félicitations');
}
// publication « Employé du mois »
{
  ok(monthLabel('2026-10', 'fr') === 'octobre 2026' && monthLabel('2026-02', 'en') === 'February 2026' && monthLabel('2026-12', 'fr') === 'décembre 2026' && monthLabel('2026-13', 'fr') === '2026-13', 'mois : noms FR et EN, mois faux laissé tel quel');
  const one = employeeOfMonthPost('2026-09', [{ id: 'u1', name: 'Rina', score: 92 }], 'fr')!;
  ok(one.title === 'Employé du mois : septembre 2026' && one.text.includes('Notre employé du mois de septembre 2026 : Rina.') && !one.text.includes('92'), 'un gagnant : titre et texte FR, le score n\'est pas publié');
  const two = employeeOfMonthPost('2026-09', [{ id: 'u1', name: 'Rina', score: 90 }, { id: 'u2', name: 'Tojo', score: 90 }], 'fr')!;
  ok(two.text.includes('Nos employés') && two.text.includes('Rina et Tojo'), 'ex æquo : les deux noms');
  const three = employeeOfMonthPost('2026-09', [{ id: 'a', name: 'A', score: 1 }, { id: 'b', name: 'B', score: 1 }, { id: 'c', name: 'C', score: 1 }], 'en')!;
  ok(three.text.includes('A, B and C') && three.title === 'Employee of the month: September 2026', 'trois ex æquo en anglais : « A, B and C »');
  ok(employeeOfMonthPost('2026-09', [], 'fr') === null && employeeOfMonthPost('septembre', [{ id: 'u', name: 'X', score: 1 }], 'fr') === null && employeeOfMonthPost('2026-09', [{ id: 'u', name: '  ', score: 1 }], 'fr') === null, 'pas de gagnant, mois faux, nom vide : rien à publier');
  const evil = employeeOfMonthPost('2026-09', [{ id: 'u', name: '<script>x</script>Rina', score: 1 }], 'fr')!;
  ok(!/[<>]/.test(evil.text), 'nom avec balises : nettoyé');
  const long = employeeOfMonthPost('2026-09', Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: 'N'.repeat(40), score: 1 })), 'fr')!;
  ok(long.text.length <= 2000 && long.title.length <= 120, 'très long : limites de Actualités respectées (2000 et 120)');
  ok(!/\d+\s*(Ar|MGA)/.test(one.text + two.text), 'aucun montant dans la publication');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
