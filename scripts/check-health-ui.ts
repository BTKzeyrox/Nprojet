// Contrôle de l'assemblage « Santé du site » (M11.7) : toutes les règles ensemble, marques Ignorer/Vérifié, pastilles du menu, destinations. Pur. Lancer : npm run check:health-ui
import { runHealth, applyAcks, alertProblem, pageStates, type HealthContext } from '../src/utils/health/registry';
import { ALL_RULES } from '../src/utils/health/all';
import { HEALTH_THRESHOLDS_DEFAULT, HEALTH_PAGES, type HealthAlert } from '../src/utils/health/types';
import { parseAcks, addAck, removeAck } from '../src/utils/health/acks';
import { menuBadges, MENU_ITEM_OF_PAGE, isKnownView, allPagesCovered } from '../src/utils/health/menu';
import { buildDemoData } from '../src/demo/demoData';
import fs from 'node:fs';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const A = (id: string, page: any, sev: any, extra: any = {}): HealthAlert => ({ id, page, rule: id.split(':')[1], severity: sev, title_fr: 't', title_en: 't', why_fr: 'w', why_en: 'w', since: null, go: { view: 'stats' }, value: 5, ...extra });

// Règles assemblées
const ids = ALL_RULES.map(r => r.id);
ok(ids.length === new Set(ids).size, `règles : ${ids.length} règles, identifiants uniques`);
ok(ALL_RULES.every(r => (HEALTH_PAGES as readonly string[]).includes(r.page)), 'règles : chaque règle vise une page connue');
for (const needed of ['missions.validation-wait', 'team.absent-streak', 'payroll.advance-pending-old', 'finance.cash-negative', 'clients.strategic-silent', 'stock.negative', 'data.client-gone', 'conditions.missing', 'system.backup-missing', 'stats.expense-spike']) ok(ids.includes(needed), `règles : « ${needed} » est dans la liste complète`);

// Marques
const al = A('team:late-often:u1', 'team', 'watch');
let list = addAck([], al, 'ignored', 'x'.repeat(500), '2026-10-21T08:00:00.000Z');
ok(list.length === 1 && list[0].reason.length === 200 && list[0].status === 'ignored' && list[0].value_at === 5, 'marque : ajoutée, raison coupée à 200 caractères, mesure gardée');
list = addAck(list, al, 'checked', 'ok', '2026-10-21T09:00:00.000Z');
ok(list.length === 1 && list[0].status === 'checked', 'marque : une seule par alerte (la nouvelle remplace)');
ok(removeAck(list, al.id).length === 0, 'marque : « Remettre » la retire');
ok(parseAcks('pas du json').length === 0 && parseAcks(null).length === 0 && parseAcks('{"a":1}').length === 0, 'marques : texte illisible = liste vide, sans exception');
ok(parseAcks(JSON.stringify([...list, { id: 'MAUVAIS ID', status: 'ignored' }, null, 5])).length === 1, 'marques : les entrées invalides sont jetées, la bonne reste');
let big: any[] = []; for (let i = 0; i < 350; i++) big = addAck(big, A(`team:r${i}:u1`, 'team', 'watch'), 'checked', '', new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString());
ok(big.length === 300 && big[299].id === 'team:r349:u1', 'marques : au plus 300, on garde les plus récentes');
const s1 = applyAcks([al], list, '2026-10-22', 14);
ok(s1.visible.length === 0 && s1.hidden.length === 1, 'marque : l\'alerte vérifiée est cachée');
const s2 = applyAcks([A(al.id, 'team', 'urgent')], list, '2026-10-22', 14);
ok(s2.visible.length === 1, 'marque : l\'alerte revient si elle devient urgente');
const s3 = applyAcks([A(al.id, 'team', 'watch', { value: 9 })], list, '2026-10-22', 14);
ok(s3.visible.length === 1, 'marque : l\'alerte revient si la mesure grossit');
ok(applyAcks([al], list, '2026-11-20', 14).visible.length === 0, 'marque : « Vérifié » ne revient pas avec le temps (seulement si ça s\'aggrave)');
const ig = addAck([], al, 'ignored', '', '2026-10-21T09:00:00.000Z');
ok(applyAcks([al], ig, '2026-11-03', 14).visible.length === 0 && applyAcks([al], ig, '2026-11-04', 14).visible.length === 1, 'marque : « Ignorer » revient au bout de 14 jours pile');

// Pastilles
const bad = menuBadges([A('team:a', 'team', 'watch'), A('team:b', 'team', 'urgent'), A('team:c', 'team', 'info'), A('clients:a', 'clients', 'info'), A('finance:a', 'finance', 'watch'), A('stock:a', 'stock', 'urgent')]);
ok(bad.employees?.count === 2 && bad.employees?.urgent === true && !bad.clients && bad.stats?.count === 1 && bad.storage?.count === 1 && bad.storage?.urgent === true, 'pastilles : « info » ne compte pas ; Équipe → Employés (2, urgent) ; Finances → Statistiques (1) ; Stock → Stockage (1, urgent)');
ok(allPagesCovered(), 'pastilles : toutes les pages surveillées ont une entrée de menu ou « aucune » écrite');
ok(Object.values(MENU_ITEM_OF_PAGE).every(v => v === null || isKnownView(v)), 'pastilles : chaque entrée de menu visée existe');
const sidebar = fs.readFileSync('src/components/Sidebar.tsx', 'utf8');
ok(Object.values(MENU_ITEM_OF_PAGE).every(v => v === null || sidebar.includes(`id: '${v}'`)), 'pastilles : chaque entrée visée est bien dans le menu (fichier Sidebar)');
ok(sidebar.includes("id: 'health'") && fs.readFileSync('src/App.tsx', 'utf8').includes("activeView === 'health'"), 'menu et page : « Santé du site » est dans le menu et dans l\'application');
const en = JSON.parse(fs.readFileSync('src/utils/enDict.json', 'utf8'));
ok(en['Santé du site'] === 'Site health', 'anglais : le nom du menu est traduit');

// Démo : tout ensemble
const demo = buildDemoData(), today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const ctx = { today, now: Date.now(), users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, moves: demo.stock, advances: demo.advances, settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, backups: [{ taken_at: new Date(Date.now() - 3600000).toISOString() }], errors: [] } as HealthContext;
const t0 = Date.now(); const r = runHealth(ctx, ALL_RULES); const ms = Date.now() - t0;
ok(r.errors.length === 0 && r.alerts.every(x => alertProblem(x) === null), `démo : ${r.alerts.length} alertes valides, aucune règle en erreur`);
ok(r.alerts.every(x => isKnownView(x.go.view)), 'démo : chaque alerte mène à une page qui existe');
ok(ms < 500, `démo : toutes les règles en ${ms} ms (limite 500 ms)`);
ok(Object.values(pageStates(r.alerts)).every(s => ['ok', 'watch', 'urgent'].includes(s)), 'démo : un état par page');
console.log('   alertes de la démo :', r.alerts.map(x => `${x.severity}:${x.id}`).join(' | ') || '(aucune)');

// Un employé ne voit rien : la glue refuse sans admin (vérifié par lecture du code)
const glue = fs.readFileSync('src/utils/healthDb.ts', 'utf8');
ok(/role !== 'admin'\) return \{ alerts: \[\]/.test(glue) && /loadHealthExternal[\s\S]{0,200}role !== 'admin'\) return/.test(glue), 'employé : aucune alerte et aucun chargement serveur (contrôlé dans le code)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
