// Onglets de Réglages : la rangée ne glisse plus de côté, ne bouge pas quand on change d'onglet. Lancer : npm run check:settings-tabs
import { readFileSync } from 'node:fs';
let f = 0, t = 0;
const ok = (c: boolean, n: string) => { t++; if (!c) { f++; console.log('ECHEC ' + n); } };
const s = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
const row = /<div ref=\{tabsRef\}[\s\S]*?<\/div>/.exec(s)?.[0] || '';
ok(/data-settings-tabs/.test(row) && /grid grid-cols-3/.test(row) && !/overflow-x|overflow-auto|overflow-scroll/.test(row), 'rangée : grille de 3 colonnes, aucun défilement de côté (les 6 onglets sont toujours visibles)');
ok(/min-h-\[44px\]/.test(row) && /whitespace-nowrap/.test(row) && /role="tab"/.test(row) && /aria-selected=\{tab === id\}/.test(row), 'onglets : 44 px de haut, une seule ligne, rôle « tab »');
ok(!/border-b-2 -mb-px/.test(row), 'onglets : plus de trait du bas qui décale la rangée d\'un pixel');
ok(/SETTINGS_TABS\.some\(x => x\[0\] === v\)/.test(s) && /sessionStorage\.setItem\('df_settings_tab', id\)/.test(s) && /catch \{/.test(s.slice(s.indexOf("const [tab, setTab]"), s.indexOf("const tabsRef"))), 'onglet retenu pendant la session (valeur inconnue ou stockage refusé : Général)');
ok(/scrollIntoView\?\.\(\{ block: 'start' \}\)/.test(s) && /scroll-mt-20/.test(row), 'changer d\'onglet : la page repart du haut des onglets, sans sauter');
ok(/\['general', 'Général'\], \['team', 'Équipe'\], \['missions', 'Missions'\], \['company', 'Conditions'\], \['performance', 'Performance'\], \['data', 'Données'\]/.test(s), 'les 6 onglets sont toujours là');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
