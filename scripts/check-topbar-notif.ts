// Contrôle du panneau de notifications (2026-10-29) : sur téléphone il s'accroche à la barre du haut, plus à la cloche. Lancer : npm run check:topbar-notif
import fs from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const src = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
const wrap = /<div ref=\{bellBox\} className="([^"]*)">/.exec(src);
ok(!!wrap, 'la boîte de la cloche est trouvée');
const wc = wrap ? wrap[1].split(/\s+/) : [];
ok(wc.includes('sm:relative') && !wc.includes('relative'), 'téléphone : la boîte de la cloche n\'est PAS un point d\'ancrage (relative seulement à partir de 640 px)');
const panel = /<div className=\{`([^`]*)df-notif([^`]*)`\}>/.exec(src);
ok(!!panel, 'le panneau de notifications est trouvé');
const pc = panel ? (panel[1] + 'df-notif' + panel[2]).split(/\s+/) : [];
ok(pc.includes('absolute') && pc.includes('top-full'), 'le panneau s\'ouvre juste sous la barre');
ok(pc.includes('max-sm:left-2') && pc.includes('max-sm:right-2'), 'téléphone : 8 px de marge à gauche et à droite (le panneau prend la largeur de l\'écran, il ne dépasse plus)');
ok(pc.includes('sm:right-0') && pc.includes('sm:w-[23rem]'), 'grand écran : aligné à droite, 23 rem de large (comme avant)');
ok(!pc.some(c => /^w-\[min\(94vw/.test(c)) && !pc.includes('right-0'), 'plus de largeur « 94 % de l\'écran » ni de bord droit collé à la cloche sur téléphone');
// La barre du haut est « fixed » : c'est elle qui sert d'ancrage au panneau sur téléphone
const header = /<header [^>]*className=\{`([^`]*)`\}/.exec(src);
ok(!!header && /\bfixed\b/.test(header[1]) && /\bleft-0\b/.test(header[1]) && /\bright-0\b/.test(header[1]), 'la barre du haut est fixe sur toute la largeur (ancrage du panneau)');
ok(!/overflow-hidden/.test(header ? header[1] : ''), 'la barre du haut ne coupe pas ce qui dépasse en dessous');
// Les classes existent dans le CSS compilé
const dist = fs.existsSync('dist/assets') ? fs.readdirSync('dist/assets').filter(f => f.endsWith('.css')).map(f => fs.readFileSync('dist/assets/' + f, 'utf8')).join('') : '';
if (dist) {
  ok(/@media not all and \(width>=40rem\)\{[^}]*\.max-sm\\:right-2\{right:calc\(var\(--spacing\) \* 2\)\}\.max-sm\\:left-2/.test(dist) || /\.max-sm\\:left-2/.test(dist), 'CSS compilé : les marges « max-sm » existent (téléphone seulement, moins de 640 px)');
  ok(/\.sm\\:relative\{position:relative\}/.test(dist) && /\.sm\\:w-\\\[23rem\\\]\{width:23rem\}/.test(dist), 'CSS compilé : relative et largeur de 23 rem à partir de 640 px');
} else console.log('      (dist absent : contrôle du CSS compilé ignoré ; lancer npm run build avant)');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
