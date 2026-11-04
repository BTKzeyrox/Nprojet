// Contrôle des liens du menu simplifié (M22.8) : toute page visée par une alerte, la cloche, l'assistant, la Santé du site, un lien de notification ou le guide
// existe dans le nouveau menu (pour le bon rôle), et la place affichée est la bonne. Lancer : npm run check:menu-links
import { readFileSync, readdirSync } from 'node:fs';
import { locate, menuFor, placeOfView, placeOf, OLD_ADMIN_VIEWS, EMPLOYEE_VIEWS } from '../src/utils/menuGroups';
let f = 0, t = 0;
const ok = (c: boolean, n: string) => { t++; if (!c) { f++; console.log('ECHEC ' + n); } };
const eq = (g: unknown, w: unknown, n: string) => ok(JSON.stringify(g) === JSON.stringify(w), `${n} (obtenu ${JSON.stringify(g)}, attendu ${JSON.stringify(w)})`);
const r = (p: string) => readFileSync(p, 'utf8');

// 1. Toutes les pages citées par le code (liens d'alertes, d'assistant, de cloche, de Santé, de notifications, du guide) existent dans le menu du responsable
const files = ['src/utils/alerts.ts', 'src/utils/alertsDb.ts', 'src/utils/notifications.ts', 'src/utils/assistant.ts', 'src/utils/assistantShortcuts.ts', 'src/utils/assistantMessages.ts', 'src/utils/pushAlerts.ts', 'src/utils/guideScripts.ts', 'src/utils/deepLink.ts', ...readdirSync('src/utils/health').filter(x => x.endsWith('.ts')).map(x => 'src/utils/health/' + x)];
const views = new Set<string>();
for (const file of files) { const s = r(file); for (const m of s.matchAll(/\b(?:go|view|page)\s*:\s*'([a-z][a-z-]{1,24})'/g)) views.add(m[1]); }
const known = new Set<string>([...OLD_ADMIN_VIEWS, ...EMPLOYEE_VIEWS, 'feed', 'profile', 'login']);
const unknown = [...views].filter(v => !known.has(v));
ok(views.size >= 15, `${views.size} pages citées trouvées dans le code`);
eq(unknown, [], 'aucun lien ne vise une page inconnue');
const lost = [...views].filter(v => !['profile', 'login'].includes(v) && !EMPLOYEE_VIEWS.includes(v as any) && locate('admin', v) === null);
eq(lost, [], 'chaque page citée a une place dans le menu du responsable');
// 2. Les liens de l'opérateur vont à des pages de SON menu
for (const v of ['grid', 'active-post', 'advances', 'chat', 'calendar', 'hr', 'sheets', 'my-performance', 'settings', 'feed']) ok(locate('employee', v) !== null, `opérateur : « ${v} » existe`);
// 3. Lieux affichés (recherche, assistant)
eq(placeOfView('admin', 'treasury'), 'Argent › Trésorerie', 'lieu : Trésorerie');
eq(placeOfView('admin', 'stats', '', 'fr', 'finance'), 'Argent › Finances', 'lieu : Finances');
eq(placeOfView('admin', 'stats'), 'Missions › Statistiques', 'lieu : Statistiques');
eq(placeOfView('admin', 'feed'), 'Actualités', 'lieu : une page seule = son nom');
eq(placeOfView('admin', 'charts', '', 'en'), 'Charts', 'lieu : Graphiques (EN)');
eq(placeOfView('admin', 'treasury', '', 'en'), 'Money › Treasury', 'lieu : anglais');
eq(placeOfView('accountant', 'storage'), '', 'lieu : page interdite = vide');
eq(placeOfView('admin', 'nimporte-quoi'), '', 'lieu : page inconnue = vide');
eq(placeOfView('admin', 'sessions'), 'Équipe › Sessions', 'lieu : sessions');
// 4. La recherche propose toutes les pages du menu (plus seulement 9)
const top = r('src/components/TopBar.tsx');
ok(/menuFor\(currentUser\.role, readCompany/.test(top) && /placeOf\(g, tb, 'fr'\)/.test(top) && /goToTab\(tb,/.test(top), 'recherche : toutes les pages du menu, avec leur place, ouvertes au bon onglet');
ok(/mergedMenu/.test(top) && /pages\.forEach/.test(top), 'recherche : l\'ancien menu garde son ancienne liste');
const total = menuFor('admin').reduce((n, g) => n + g.tabs.length, 0);
ok(total >= 24, `recherche du responsable : ${total} pages trouvables`);
// 5. Textes : plus de « Statistiques > Finances » comme chemin (Finances est dans Argent), sauf la mention de l'ancien menu
const stale: string[] = [];
for (const file of ['src/utils/siteKnowledge.ts', 'src/views/admin/graphs/GraphsMoney.tsx', 'src/utils/guideScripts.ts', 'src/components/AssistantChat.tsx']) { for (const m of r(file).matchAll(/Statistiques > Finances|Statistics > Finance/g)) { const ctx = r(file).slice(Math.max(0, (m.index || 0) - 20), (m.index || 0) + 40); if (!/ancien menu|old menu/.test(ctx)) stale.push(file); } }
eq(stale, [], 'aucun texte ne renvoie à « Statistiques > Finances » sans dire que c\'est l\'ancien menu');
ok(/Missions > Statistiques/.test(r('src/utils/siteKnowledge.ts')) && /Argent > Finances/.test(r('src/utils/siteKnowledge.ts')), 'carte du site : dit où sont les chiffres et les finances');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
