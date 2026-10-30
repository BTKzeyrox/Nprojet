// En-tête sans bouclier, recherche « Rechercher… » avec loupe et croix ; « Signaler un problème » dans le Journal des erreurs.
import { readFileSync } from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const r = (f: string) => readFileSync(f, 'utf8');
const top = r('src/components/TopBar.tsx'), side = r('src/components/Sidebar.tsx'), log = r('src/views/admin/ErrorsLog.tsx');
ok(!/Shield/.test(top) && !/GESTION PRO/.test(top), 'en-tête : plus d\'icône bouclier ni de texte GESTION PRO');
ok(/placeholder="Rechercher…"/.test(top), 'recherche : texte « Rechercher… »');
ok(/<Search className/.test(top), 'recherche : icône loupe');
ok(/data-search-clear/.test(top) && /\{q && \(/.test(top) && /setQ\(''\)/.test(top), 'recherche : croix qui efface, seulement quand il y a du texte');
ok(/data-report-problem/.test(log) && /ReportProblemModal/.test(log), 'Journal des erreurs : bouton « Signaler un problème »');
ok(/onReportProblem && !isAdmin/.test(side), 'menu : le responsable n\'a plus le bouton (il est dans le Journal) ; l\'opérateur le garde');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
