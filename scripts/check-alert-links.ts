// Contrôle des liens exacts de TOUTES les alertes et notifications (au-delà du Stockage) et de l'animation unique de 1,5 s.
// Sans réseau, sans écran. Lancer : npm run check:alert-links
import fs from 'node:fs';

const g: any = globalThis;
const bus = new EventTarget();
g.window = { dispatchEvent: (e: Event) => bus.dispatchEvent(e), addEventListener: (n: string, f: any) => bus.addEventListener(n, f), removeEventListener: (n: string, f: any) => bus.removeEventListener(n, f) };

const { computeAlerts } = await import('../src/utils/alerts');
const { payrollRules } = await import('../src/utils/health/rules/payroll').then(m => ({ payrollRules: Object.values(m).filter((x: any) => x && typeof x === 'object' && typeof x.run === 'function') as any[] }));
const { planHealthNotifs } = await import('../src/utils/healthNotif');
const { FLASH_MS } = await import('../src/utils/navTarget');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

// ---- 1) Accueil : « avance trop grosse » mène à l'avance la plus grosse ----
const adv = (id: string, amount: number, date = '2026-10-01'): any => ({ id, employee_id: 'e1', employee_name: 'Rina', amount_ar: amount, status: 'pending', request_date: date, reason: '' });
const alerts = computeAlerts({ today: '2026-10-29', settings: {}, cash: [], posts: [], contracts: [], advances: [adv('a1', 50000), adv('a2', 90000), adv('a3', 20000)], products: [], moves: [] } as any);
const big = alerts.find(a => a.id === 'advance-big');
ok(!!big && big.go === 'advances' && big.nav === 'adv-a2', 'accueil : « avance trop grosse » ouvre Avances et fait clignoter la plus grosse demande');

// ---- 2) Santé : avance qui attend ----
const payroll = payrollRules.flatMap(r => r.run({ today: '2026-10-29', now: Date.parse('2026-10-29T08:00:00Z'), advances: [adv('x1', 10000, '2026-10-20'), adv('x2', 20000, '2026-10-10'), adv('x3', 5000, '2026-10-27')], thresholds: { advance_pending_days: 3 }, users: [], cash: [], posts: [] }));
const waiting = payroll.find((a: any) => a.rule === 'advance-pending-old');
ok(!!waiting && waiting.go.view === 'advances' && waiting.go.nav === 'adv-x2', 'Santé : « avance en attente » ouvre Avances à la plus ancienne demande');

// ---- 3) Cloche : une alerte qui sait où mener ouvre directement l'endroit, les autres la Santé ----
const A = (id: string, go: any): any => ({ id, severity: 'urgent', title_fr: id, title_en: id, go });
const notifs = planHealthNotifs([A('p:1', { view: 'advances', nav: 'adv-x2' }), A('p:2', { view: 'validations', filter: 'ends', nav: 'val-post-7' }), A('p:3', { view: 'stats', tab: 'finance', nav: 'x' }), A('p:4', { view: 'clients' })], '2026-10-29', Date.parse('2026-10-29T05:00:00Z'), []);
const byId = (id: string) => notifs.find(x => x.id === `health-${id}`)!;
ok(byId('p:1').view === 'advances' && byId('p:1').nav === 'adv-x2', 'cloche : une alerte avec une cible ouvre directement la page et l\'élément');
ok(byId('p:2').view === 'validations' && byId('p:2').filter === 'ends' && byId('p:2').nav === 'val-post-7', 'cloche : le filtre de Validations est transmis');
ok(byId('p:3').view === 'health' && byId('p:4').view === 'health', 'cloche : sans cible, ou avec un onglet à choisir, l\'alerte ouvre la Santé du site (comme avant)');

// ---- 4) Animation unique de 1,5 s ----
const css = read('src/index.css'), nav = read('src/utils/navTarget.ts');
ok(FLASH_MS === 1500, 'durée du clignotement : 1,5 s');
ok(/\.nav-flash \{\s*animation: navflashshort 1\.5s/.test(css) && !/navflash 2\.8s/.test(css), 'animation CSS : 1,5 s pour toutes les alertes (plus de 2,8 s)');
ok(/prefers-reduced-motion: reduce\) \{[^}]*\.nav-flash, \.nav-flash-short \{ animation: none; box-shadow/.test(css), '« réduire les animations » : contour fixe, sans mouvement');
ok(/\}, ms\);/.test(nav) && /FLASH_MS/.test(nav), 'le clignotement s\'arrête après 1,5 s');

// ---- 5) Branchements (lecture du code) ----
const has = (f: string, re: RegExp, m: string) => ok(re.test(read(f)), m);
has('src/views/admin/InvoicesView.tsx', /data-nav=\{`inv-\$\{inv\.id\}`\}/, 'Factures : chaque facture a son adresse');
has('src/views/admin/ClientsPage.tsx', /data-nav=\{`client-\$\{c\.id\}`\}/, 'Clients : chaque client a son adresse');
has('src/views/admin/EmployeesManagement.tsx', /data-nav=\{`emp-\$\{u\.id\}`\}/, 'Équipe : chaque employé a son adresse');
has('src/components/AdvanceHistory.tsx', /data-nav=\{`adv-\$\{a\.id\}`\}/, 'Avances : chaque demande a son adresse');
has('src/utils/alerts.ts', /nav: `inv-\$\{chase\[0\]\.invoices\[0\]\.id\}`/, 'accueil : « factures en retard » vise la plus en retard');
has('src/utils/alerts.ts', /nav: `client-\$\{worstClient\.id\}`/, 'accueil : « clients à surveiller » vise le pire client');
has('src/utils/health/rules/invoices.ts', /nav: `inv-/, 'Santé : factures en retard / brouillons oubliés visent une facture');
has('src/utils/health/rules/clients.ts', /nav: `client-\$\{c\.id\}`/, 'Santé : client stratégique silencieux vise ce client');
has('src/utils/health/rules/team.ts', /nav: `emp-\$\{u\.id\}`/, 'Santé : employé inactif vise cet employé');
has('src/utils/health/rules/missions.ts', /nav: `val-post-\$\{old\.p\.id\}`/, 'Santé : mission à valider vise la mission la plus ancienne');
for (const f of ['src/views/admin/AdminDashboard.tsx', 'src/views/admin/StatsPage.tsx', 'src/views/admin/HealthPage.tsx', 'src/components/AssistantChat.tsx']) has(f, /setNavTarget\(/, `${f.split('/').pop()} : transmet la cible exacte`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
