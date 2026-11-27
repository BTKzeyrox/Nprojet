// Actualités : le formulaire de publication est réduit tant que personne ne veut publier.
import { readFileSync } from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const s = readFileSync('src/views/FeedView.tsx', 'utf8');
const i = s.indexOf('const Composer'), j = s.indexOf('export const FeedView');
const c = s.slice(i, j);
ok(/useState\(false\); \/\/ formulaire réduit/.test(c), 'départ : formulaire fermé');
ok(/if \(!open\) \{/.test(c) && /data-composer-open\b/.test(c), 'barre fermée avec un bouton qui ouvre');
ok(/data-composer-minimize/.test(c) && /setOpen\(false\)/.test(c), 'bouton « Réduire »');
ok(/setBusy\(false\);\s*setOpen\(false\);/.test(c), 'le formulaire se referme après un envoi réussi');
ok(/Continuer ma publication/.test(c), 'brouillon gardé et signalé quand fermé');
ok(c.indexOf('if (!open)') > c.indexOf('useRef<HTMLInputElement>') , 'règle des hooks : le retour anticipé vient après tous les hooks');
ok(/data-composer-layout/.test(c) && /lg:grid-cols-\[minmax\(0,1fr\)_20rem\]/.test(c) && /data-composer-options/.test(c) && /data-composer-count/.test(c), 'formulaire : texte en grand à gauche, options à droite sur grand écran, compteur de caractères');
ok(/data-audience-picker/.test(readFileSync('src/components/AudiencePicker.tsx', 'utf8')) && /<AudiencePicker value=\{aud\}/.test(c) && /Nouvelle publication/.test(c), 'formulaire : titre clair et choix « Visible par » gardé dans le formulaire');
ok(!/data-audience-badge/.test(s), 'la publication n\'affiche plus le badge « Seulement : … » (le choix reste dans le formulaire)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }

