// Saisie sur une période de paie clôturée : refusée par le serveur (et l'annulation voit aussi les périodes « payées »).
import fs from 'node:fs';
import { dayInClosedPeriod } from '../src/utils/payrollClosed';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const per = (status: string, a: string, b: string) => ({ data: { kind: 'period', status, period_start: a, period_end: b } });

ok(dayInClosedPeriod([per('closed', '2026-11-01', '2026-11-15')], '2026-11-08') === true, 'jour dans une période clôturée : refusé');
ok(dayInClosedPeriod([per('closed', '2026-11-01', '2026-11-15')], '2026-11-01') === true && dayInClosedPeriod([per('closed', '2026-11-01', '2026-11-15')], '2026-11-15') === true, 'les deux bornes (premier et dernier jour) sont dans la période');
ok(dayInClosedPeriod([per('closed', '2026-11-01', '2026-11-15')], '2026-10-31') === false && dayInClosedPeriod([per('closed', '2026-11-01', '2026-11-15')], '2026-11-16') === false, 'la veille et le lendemain de la période : permis');
ok(dayInClosedPeriod([per('paid', '2026-11-01', '2026-11-15')], '2026-11-08') === true, 'période « payée » : refusé aussi (avant, seule « clôturée » était vue)');
ok(dayInClosedPeriod([per('open', '2026-11-01', '2026-11-15'), per('draft', '2026-11-01', '2026-11-15')], '2026-11-08') === false, 'période ouverte : permis');
ok(dayInClosedPeriod([], '2026-11-08') === false && dayInClosedPeriod(null as any, '2026-11-08') === false && dayInClosedPeriod([null, 5, 'x'] as any, '2026-11-08') === false, 'aucune période, liste absente ou lignes illisibles : permis, jamais de plantage');
ok(dayInClosedPeriod([{ status: 'closed', period_start: '2026-11-01', period_end: '2026-11-15' }], '2026-11-08') === true, 'accepte aussi l\'objet directement (sans « data »)');
ok(dayInClosedPeriod([per('open', '2026-11-01', '2026-11-15'), per('closed', '2026-10-01', '2026-10-31'), per('closed', '2026-11-01', '2026-11-15')], '2026-11-08') === true, 'plusieurs périodes : une seule clôturée suffit');

// ---- serveur : même règle, branchée dans la saisie ET dans l'annulation ----
const api = fs.readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const util = fs.readFileSync('src/utils/payrollClosed.ts', 'utf8');
const body = (s: string) => (s.match(/\(periods: any\[\], date: string\): boolean => \(periods \|\| \[\]\)\.some\(\(r: any\) => \{([\s\S]*?)\}\);/) || [])[1]?.replace(/\s+/g, ' ').trim();
ok(!!body(api) && body(api) === body(util), 'serveur : la fonction dayInClosedPeriod est la même copie que l\'util du site');
const entry = api.slice(api.indexOf('async function workEntryRoute'), api.indexOf('async function workCancelRoute'));
ok(/dayInClosedPeriod\(closedPeriods \|\| \[\], String\(b\.date\)\)\) return res\.status\(409\)/.test(entry), 'serveur : la saisie d\'une feuille est refusée (409) sur un jour clôturé');
ok(entry.indexOf('dayInClosedPeriod') < entry.indexOf('planWorkEntries('), 'serveur : le contrôle se fait AVANT de calculer et d\'enregistrer quoi que ce soit');
ok(/rouvre la période dans Paie/.test(entry), 'serveur : le message dit quoi faire (autre date, ou rouvrir la période)');
const cancel = api.slice(api.indexOf('async function workCancelRoute'), api.indexOf('async function workCancelRoute') + 2500);
ok(/const closed = dayInClosedPeriod\(prs \|\| \[\], String\(post\.date\)\)/.test(cancel), 'serveur : l\'annulation voit aussi les périodes payées (même fonction)');
ok(/status\(409\)/.test(cancel) || /plan\.error === 'closed' \? 409/.test(cancel), 'serveur : annulation refusée en 409 sur un jour clôturé (inchangé)');

console.log(`\n${pass}/${pass + fail} contrôles réussis`);
if (fail) process.exit(1);
