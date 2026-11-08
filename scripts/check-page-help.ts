// Bouton « ? » d'aide de la page (guide G2). Lancer : npm run check:page-help
import { readFileSync } from 'node:fs';
import { SITE_MAP, findPage } from '../src/utils/siteKnowledge';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const ph = readFileSync('src/components/PageHelp.tsx', 'utf8'), tb = readFileSync('src/components/TopBar.tsx', 'utf8'), sb = readFileSync('src/components/Sidebar.tsx', 'utf8');
ok(SITE_MAP.every(p => p.howto.length === 3 && p.howto.every(h => h.fr.trim() && h.en.trim() && h.fr.length <= 160 && h.en.length <= 160) && p.purpose.fr.trim() && p.purpose.en.trim()), 'chaque page a un but et 3 lignes d\'aide, en français et en anglais, courtes (160 signes au plus)');
ok(!findPage('page-inconnue') && /if \(!page\) return null/.test(ph), 'page sans fiche : pas de bouton (jamais une aide vide)');
ok(/page\.howto\.map/.test(ph) && /page\.purpose/.test(ph) && /data-page-help-steps/.test(ph), 'l\'aide montre le but et les 3 lignes de la carte du site');
ok(/e\.key === 'Escape'/.test(ph) && /onClick=\{\(\) => setOpen\(false\)\}/.test(ph) && /data-page-help-close/.test(ph), 'se ferme par la croix, en touchant à côté, ou avec Échap');
ok(/min-h-\[44px\] min-w-\[44px\]/.test(ph) && /min-h-\[44px\]/.test(ph), 'cibles tactiles de 44 px');
ok(/gp-tour-open/.test(ph) && /gp-tour-open/.test(readFileSync('src/components/TourGuide.tsx', 'utf8')), 'le bouton « Voir le guide animé » relance la visite (même événement)');
ok(/useEffect\(\(\) => \{ setOpen\(false\); \}, \[pageId\]\)/.test(ph), 'changer de page ferme l\'aide');
ok(/data-header-help/.test(tb) && /hidden md:block[^"]*" data-header-help/.test(tb), 'ordinateur : « ? » dans la barre du haut (pas sur téléphone, où la barre est pleine)');
ok(/data-sidebar-help/.test(sb) && /md:hidden[^"]*" data-sidebar-help/.test(sb) && /variant="row"/.test(sb), 'téléphone : « Aide de cette page » dans le menu');
ok(!/fetch\(|supabase|db\./.test(ph), 'aucun appel au serveur');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
