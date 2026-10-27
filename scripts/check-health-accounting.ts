// Contrôle des règles Comptabilité du module 11 (M14.9). Pur, sans réseau. Lancer : npm run check:health-accounting
import { runHealth, alertProblem, type HealthContext } from '../src/utils/health/registry';
import { HEALTH_THRESHOLDS_DEFAULT, HEALTH_PAGES, type HealthAlert } from '../src/utils/health/types';
import { ACCOUNTING_RULES } from '../src/utils/health/rules/accounting';
import { ALL_RULES } from '../src/utils/health/all';
import { MENU_ITEM_OF_PAGE, isKnownView } from '../src/utils/health/menu';
import { ADVICE } from '../src/utils/advice';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-27', NOW = Date.parse('2026-10-27T11:00:00+03:00');
const ctx = (over: Partial<HealthContext> = {}): HealthContext => ({ today: TODAY, now: NOW, users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, ...over });
const run = (c: HealthContext) => runHealth(c, ACCOUNTING_RULES);
const find = (r: ReturnType<typeof run>, id: string): HealthAlert | undefined => r.alerts.find(a => a.id === id);
const E = (id: string, date: string, lines: [string, number, number][]) => ({ id, date, journal: 'OD', label: id, lines: lines.map(([account, debit, credit]) => ({ account, debit, credit })) });
const SALE = (id: string, date: string, ht: number, tva: number) => E(id, date, [['411', ht + tva, 0], ['706', 0, ht], ['4457', 0, tva]]);

ok(run(ctx()).alerts.length === 0 && run(ctx()).errors.length === 0, 'aucune donnée : aucune alerte, aucune erreur');
ok(run(ctx({ entries: null })).alerts.length === 0 && run(ctx({ entries: [] })).alerts.length === 0, 'écritures non chargées ou vides : les règles se taisent');

// --- déséquilibrée
let r = run(ctx({ entries: [E('a', '2026-10-20', [['512', 1000, 0], ['706', 0, 900]]), E('b', '2026-10-21', [['512', 500, 0], ['706', 0, 400]]), E('ok', '2026-10-22', [['512', 100, 0], ['706', 0, 100]])] as any }));
let a = find(r, 'accounting:unbalanced');
ok(!!a && a.severity === 'urgent' && a.value === 2 && a.since === '2026-10-20' && a.go.view === 'accounting' && a.title_fr === '2 écritures déséquilibrées', 'déséquilibrée : 2 écritures comptées, la plus ancienne donne « depuis », urgent');
ok(find(run(ctx({ entries: [E('a', '2026-10-20', [['512', 1000, 0], ['706', 0, 900]])] as any })), 'accounting:unbalanced')!.title_fr === '1 écriture déséquilibrée', 'singulier correct');
ok(!find(run(ctx({ entries: [E('a', '2026-10-20', [['512', 1000, 0], ['706', 0, 1000]])] as any })), 'accounting:unbalanced'), 'écriture équilibrée : aucune alerte');
ok(run(ctx({ entries: [{ id: 'x', date: 'pas-une-date', lines: [] }, { id: 'y', date: '2026-10-01' }, null] as any })).errors.length === 0, 'écritures abîmées (date fausse, sans lignes, null) : aucun plantage');

// --- période non close
const oct = [E('o', '2026-10-05', [['512', 100, 0], ['706', 0, 100]])];
ok(!find(run(ctx({ entries: oct as any })), 'accounting:period-open'), 'mois en cours : jamais signalé');
const sep = [E('s', '2026-09-05', [['512', 100, 0], ['706', 0, 100]])];
a = find(run(ctx({ entries: sep as any })), 'accounting:period-open');
ok(!!a && a.severity === 'watch' && a.value === 1 && a.since === '2026-09-30' && a.title_fr === '1 mois fini pas encore clos', 'septembre fini depuis 27 jours, pas clos : à voir');
ok(!find(run(ctx({ today: '2026-10-10', entries: sep as any })), 'accounting:period-open'), 'délai de grâce : 10 jours pile après la fin du mois, pas d\'alerte');
ok(!!find(run(ctx({ today: '2026-10-11', entries: sep as any })), 'accounting:period-open'), 'délai de grâce : 11 jours après la fin du mois, alerte');
ok(!find(run(ctx({ entries: sep as any, settings: { acct_close: { through: '2026-09-30', log: [] } } as any })), 'accounting:period-open'), 'mois clos : plus d\'alerte');
ok(!!find(run(ctx({ entries: [...sep, E('t', '2026-08-15', [['512', 1, 0], ['706', 0, 1]])] as any, settings: { acct_close: { through: '2026-08-31' } } as any })), 'accounting:period-open'), 'clos jusqu\'à août, écritures de septembre : alerte');
a = find(run(ctx({ entries: [...sep, E('t', '2026-08-15', [['512', 1, 0], ['706', 0, 1]])] as any })), 'accounting:period-open');
ok(a?.value === 2 && a.since === '2026-08-31' && a.title_fr === '2 mois finis pas encore clos', 'deux mois non clos : compte 2, « depuis » = le plus ancien');
ok(!!find(run(ctx({ entries: sep as any, settings: { acct_close: { through: 'n\'importe quoi' } } as any })), 'accounting:period-open'), 'clôture illisible : traitée comme « aucune clôture »');

// --- TVA
const v = [SALE('v1', '2026-09-10', 10000, 2000)];
a = find(run(ctx({ entries: v as any })), 'accounting:vat-due');
ok(!!a && a.severity === 'watch' && a.value === 2000 && /2 000 Ar/.test(a.why_fr) && /2,000 Ar/.test(a.why_en) && a.go.view === 'accounting', 'TVA à payer sur septembre : 2 000 Ar, à voir');
ok(!find(run(ctx({ today: '2026-10-15', entries: v as any })), 'accounting:vat-due') && !!find(run(ctx({ today: '2026-10-16', entries: v as any })), 'accounting:vat-due'), 'rappel seulement après 15 jours (15 pile : rien, 16 : alerte)');
ok(!find(run(ctx({ entries: v as any, settings: { acct_close: { through: '2026-09-30' } } as any })), 'accounting:vat-due'), 'mois clos : la TVA n\'est plus signalée');
ok(!find(run(ctx({ entries: [SALE('v2', '2026-10-02', 10000, 2000)] as any })), 'accounting:vat-due'), 'mois en cours : pas de rappel de TVA');
ok(!find(run(ctx({ entries: [...v, E('d', '2026-09-12', [['4456', 2500, 0], ['512', 0, 2500]])] as any })), 'accounting:vat-due'), 'crédit de TVA (déductible > collectée) : aucune alerte');
a = find(run(ctx({ entries: [...v, E('d', '2026-09-12', [['4456', 500, 0], ['512', 0, 500]])] as any })), 'accounting:vat-due');
ok(a?.value === 1500, 'TVA déductible retirée : 2 000 − 500 = 1 500');
ok(!find(run(ctx({ entries: [E('z', '2026-09-10', [['512', 100, 0], ['706', 0, 100]])] as any })), 'accounting:vat-due'), 'aucune TVA dans les écritures : aucune alerte');

// --- ensemble
const all = run(ctx({ entries: [...sep, ...v, E('bad', '2026-10-20', [['512', 10, 0], ['706', 0, 5]])] as any }));
ok(all.alerts.length === 3 && all.errors.length === 0 && all.alerts.every(x => alertProblem(x) === null), 'format commun respecté par les 3 alertes');
ok(all.alerts.every(x => !/[àâçéèêëîïôùûœ]/i.test(x.title_en + x.why_en + (x.todo_en || ''))), 'anglais sans accents ni mots français');
ok(all.alerts[0].severity === 'urgent', 'l\'alerte urgente passe en premier');
ok(['unbalanced', 'period-open', 'vat-due'].every(k => !!ADVICE[k] && ADVICE[k].fr.length > 20 && ADVICE[k].en.length > 20), 'chaque règle a sa solution dans l\'assistant');
ok(!/\b(sanction|faute|coupable)/i.test(['unbalanced', 'period-open', 'vat-due'].map(k => ADVICE[k].fr).join(' ')), 'solutions sans accusation');
ok((HEALTH_PAGES as readonly string[]).includes('accounting') && MENU_ITEM_OF_PAGE.accounting === 'accounting' && isKnownView('accounting'), 'page surveillée « accounting » : pastille sur l\'entrée Comptabilité, destination connue');
ok(ACCOUNTING_RULES.every(x => ALL_RULES.includes(x)), 'les 3 règles sont dans la liste complète des règles');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
