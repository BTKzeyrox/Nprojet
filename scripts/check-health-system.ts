// Contrôle des règles « Système » (M9.2 partie A) : sauvegarde de nuit et erreurs. Pur, sans réseau. Lancer : npm run check:health-system
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, type HealthAlert } from '../src/utils/health/types';
import { SYSTEM_RULES } from '../src/utils/health/rules/system';
import { LOT3_RULES } from '../src/utils/health/rules/lot3';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const NOW = Date.parse('2026-10-21T11:00:00+03:00'), TODAY = '2026-10-21';
const ago = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over } as HealthContext);
const run = (c: HealthContext) => runHealth(c, SYSTEM_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);

ok(!run(ctx()).alerts.length && !run(ctx()).errors.length, 'rien chargé : aucune alerte, aucune erreur');
ok(!run(ctx({ backups: null, errors: null })).alerts.length, 'listes « null » (non chargées) : on se tait');

// Sauvegarde
ok(!find(run(ctx({ backups: [{ taken_at: ago(25.9) }] })), 'system:backup-missing'), 'sauvegarde : 25,9 h = rien (seuil 26 h)');
let a = find(run(ctx({ backups: [{ taken_at: ago(30) }, { taken_at: ago(60) }] })), 'system:backup-missing');
ok(!!a && a.severity === 'watch' && /30 h/.test(a.why_fr) && a.value === 30 && a.go.view === 'settings', 'sauvegarde : 30 h = à voir, prend la plus récente des deux');
ok(find(run(ctx({ backups: [{ taken_at: ago(60) }] })), 'system:backup-missing')?.severity === 'urgent', 'sauvegarde : plus de 52 h = urgent');
a = find(run(ctx({ backups: [] })), 'system:backup-missing');
ok(!!a && a.severity === 'urgent' && /Aucune sauvegarde/.test(a.title_fr) && a.title_en === 'No backup found', 'sauvegarde : liste vide = urgent, FR et EN');
ok(!!find(run(ctx({ backups: [{ taken_at: 'pas une date' }] })), 'system:backup-missing'), 'sauvegarde : dates illisibles = comme aucune sauvegarde, sans plantage');
ok(!find(run(ctx({ backups: [{ taken_at: ago(-2) }] })), 'system:backup-missing'), 'sauvegarde : date légèrement dans le futur (horloge) = rien');
ok(!!find(run(ctx({ backups: [{ taken_at: ago(30) }], thresholds: { ...HEALTH_THRESHOLDS_DEFAULT, backup_max_hours: 24 } })), 'system:backup-missing') && !find(run(ctx({ backups: [{ taken_at: ago(30) }], thresholds: { ...HEALTH_THRESHOLDS_DEFAULT, backup_max_hours: 48 } })), 'system:backup-missing'), 'sauvegarde : le seuil est réglable');

// Erreurs
const E = (id: string, extra: any = {}) => ({ id, kind: 'error', message: 'Cannot read x', count: 3, last_seen: ago(2), status: 'open', ...extra });
a = find(run(ctx({ errors: [E('e1'), E('e2', { message: 'Autre', count: 1 })] })), 'system:recent-errors');
ok(!!a && a.severity === 'watch' && a.value === 2 && /4 fois/.test(a.why_fr) && /Cannot read x/.test(a.why_fr) && a.go.view === 'errors', 'erreurs : 2 ouvertes, 4 fois au total, la plus fréquente citée');
ok(!find(run(ctx({ errors: [E('e1', { last_seen: ago(30) })] })), 'system:recent-errors'), 'erreurs : vue il y a 30 h = rien (fenêtre 24 h)');
ok(!find(run(ctx({ errors: [E('e1', { status: 'resolved' })] })), 'system:recent-errors'), 'erreurs : résolue = rien');
ok(!find(run(ctx({ errors: [E('e1', { kind: 'report' })] })), 'system:recent-errors'), 'erreurs : un signalement d\'utilisateur n\'est pas une erreur');
ok(find(run(ctx({ errors: [E('e1', { kind: 'crash' })] })), 'system:recent-errors')?.severity === 'urgent', 'erreurs : un plantage = urgent');
ok(find(run(ctx({ errors: [1, 2, 3, 4, 5].map(i => E(`e${i}`)) })), 'system:recent-errors')?.severity === 'urgent', 'erreurs : 5 différentes = urgent');
ok(!find(run(ctx({ errors: [E('e1', { last_seen: 'bizarre' })] })), 'system:recent-errors'), 'erreurs : date illisible = ignorée');
a = find(run(ctx({ errors: [E('e1', { message: undefined, count: undefined })] })), 'system:recent-errors');
ok(!!a && /1 fois/.test(a.why_fr) && /sans message/.test(a.why_fr) && alertProblem(a) === null, 'erreurs : message et compteur absents = texte propre');
a = find(run(ctx({ errors: [E('e1', { message: 'x'.repeat(500) })] })), 'system:recent-errors');
ok(!!a && a.why_fr.length < 400 && alertProblem(a) === null, 'erreurs : message très long coupé, alerte valide');
ok(a!.title_en.startsWith('1 site error is open') && !/erreur|fois|plus fréquente/.test(a!.title_en + a!.why_en), 'erreurs : anglais propre');

// Ensemble : le lot 3 complet marche avec ces deux règles et ne modifie rien
const big = ctx({ backups: [{ taken_at: ago(40) }], errors: [E('e1')] });
const frozen = JSON.stringify(big), r = runHealth(big, LOT3_RULES);
ok(!r.errors.length && r.alerts.filter(x => x.page === 'system').length === 2 && JSON.stringify(big) === frozen && r.alerts.every(x => alertProblem(x) === null), 'lot 3 complet : 2 alertes système, aucune donnée modifiée');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
