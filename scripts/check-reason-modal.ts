// Contrôle de la fenêtre de validation / refus (ReasonModal) : un clic qui atterrit sur le fond ne doit pas la fermer quand l'appui
// a commencé DANS la fenêtre (bug du téléphone : « Valider » ramenait au champ facultatif, sans rien valider, sans fin). Pur, sans réseau.
// Lancer : npm run check:reason-modal
import { readFileSync } from 'node:fs';
import { backdropDown, backdropShouldClose } from '../src/utils/modalGuard';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bg = {}, inside = {};

ok(backdropDown(bg, bg) === true && backdropDown(inside, bg) === false, 'appui : seulement sur le fond lui-même');
ok(backdropDown(null, null) === false && backdropDown(undefined, undefined) === false, 'appui sans cible : jamais le fond');
ok(backdropShouldClose(true, bg, bg) === true, 'appui sur le fond puis clic sur le fond : ferme');
ok(backdropShouldClose(false, bg, bg) === false, 'appui DANS la fenêtre puis clic sur le fond (clavier qui bouge) : ne ferme pas');
ok(backdropShouldClose(true, inside, bg) === false, 'clic dans la fenêtre : ne ferme pas');
ok(backdropShouldClose(true, null, bg) === false && backdropShouldClose(true, undefined, undefined) === false, 'clic sans cible : ne ferme pas');
ok(backdropShouldClose('oui' as any, bg, bg) === false, 'valeur bizarre pour « appui sur le fond » : ne ferme pas');

const src = readFileSync(new URL('../src/components/ReasonModal.tsx', import.meta.url), 'utf8');
ok(/onPointerDown=\{e => \{ downOnBackdrop\.current = backdropDown\(e\.target, e\.currentTarget\)/.test(src) && /backdropShouldClose\(downOnBackdrop\.current, e\.target, e\.currentTarget\)/.test(src), 'câblage : le fond ne ferme que si l\'appui a commencé sur le fond');
ok(!/className="fixed inset-0[^"]*"[^>]*onClick=\{onClose\}/.test(src), 'câblage : plus de fermeture directe au moindre clic sur le fond');
ok(/autoFocus=\{!optional\}/.test(src) && !/\n\s*autoFocus\n/.test(src), 'câblage : le champ facultatif ne prend pas le focus tout seul (pas de clavier)');
ok(/disabled=\{!ok\}/.test(src) && /const ok = optional \|\| clean\.length >= MIN/.test(src), 'le bouton « Valider » reste utilisable sans rien écrire (approbation) ; le refus exige un motif');
ok(/type="button" onClick=\{onClose\}/.test(src), 'le bouton « Annuler » ferme toujours la fenêtre');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
