// Contrôle du budget prévu contre réel (M15.4). Lancer : npm run check:budget-plan
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { budgetVsActual, checkMonthlyPlan, cleanMonthlyPlan, plannedExpenses, PLAN_STATUS_LABEL, MONTHLY_PLAN_ERROR_MESSAGE } from '../src/utils/budgetPlan';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);

// ---- Plan saisi
eq(checkMonthlyPlan({ revenue_ar: 1500000, payroll_ar: 150000 }), { ok: true, value: { revenue_ar: 1500000, payroll_ar: 150000 } }, 'plan valide');
eq(checkMonthlyPlan({}), { ok: true, value: { revenue_ar: 0, payroll_ar: 0 } }, 'plan vide : deux zéros (rien de prévu)');
eq(checkMonthlyPlan({ revenue_ar: 1234.6, payroll_ar: null }), { ok: true, value: { revenue_ar: 1235, payroll_ar: 0 } }, 'montant arrondi à l\'Ar, null = 0');
eq(checkMonthlyPlan({ revenue_ar: 10000000000, payroll_ar: 0 }).ok, true, '10 milliards accepté');
const bad = (d: any, error: string, name: string) => eq(checkMonthlyPlan(d), { ok: false, error }, name);
bad({ revenue_ar: -1 }, 'revenue', 'revenus négatifs refusés');
bad({ revenue_ar: 10000000001 }, 'revenue', 'plus de 10 milliards refusé (revenus)');
bad({ revenue_ar: '1000' }, 'revenue', 'revenus en texte refusés');
bad({ revenue_ar: NaN }, 'revenue', 'NaN refusé');
bad({ revenue_ar: Infinity }, 'revenue', 'infini refusé');
bad({ payroll_ar: -5 }, 'payroll', 'paie négative refusée');
bad({ payroll_ar: 'x' }, 'payroll', 'paie en texte refusée');
bad(null, 'format', 'rien du tout refusé');
bad([], 'format', 'tableau refusé');
bad(JSON.parse('{"__proto__":{"x":1},"revenue_ar":5}'), 'format', 'clé dangereuse refusée');
eq(cleanMonthlyPlan(undefined), { revenue_ar: 0, payroll_ar: 0 }, 'nettoyage : rien = zéros');
eq(cleanMonthlyPlan({ revenue_ar: 'abc', payroll_ar: 250000.4 }), { revenue_ar: 0, payroll_ar: 250000 }, 'nettoyage : montant faux = 0, montant bon gardé');
eq(cleanMonthlyPlan({ revenue_ar: -4, payroll_ar: 1e12 }), { revenue_ar: 0, payroll_ar: 0 }, 'nettoyage : négatif et trop grand = 0');
eq(cleanMonthlyPlan([1, 2]), { revenue_ar: 0, payroll_ar: 0 }, 'nettoyage : tableau = zéros');

// ---- Dépenses prévues = budgets du module 4
eq(plannedExpenses({ Loyer: 400000, Internet: 100000, Zéro: 0, Négatif: -50, Faux: NaN, Texte: '9' as any }), 500000, 'dépenses prévues : somme des budgets positifs seulement');
eq([plannedExpenses(undefined), plannedExpenses({})], [0, 0], 'dépenses prévues : sans budget = 0');

// ---- Prévu contre réel
const cash = (id: string, kind: 'in' | 'out', amount_ar: number, date: string, category = 'Divers') => ({ id, kind, category, amount_ar, date, note: '' });
const post = (id: string, date: string, ar: number) => ({ id, status: 'completed', date, calculated_ar: ar, post_number: 1, client_name: 'X' });
const input: any = {
  cash: [cash('a', 'in', 1250000, '2026-08-10'), cash('b', 'in', 2000000, '2026-09-05'), cash('c', 'out', 500000, '2026-09-20', 'Loyer'), cash('d', 'in', 1000000, '2026-10-05'), cash('e', 'out', 300000, '2026-10-10', 'Loyer')],
  posts: [post('p1', '2026-09-12', 100000), post('p2', '2026-10-12', 100000), post('p3', '2026-10-13', 100000)],
  contracts: [], prices: {}, pricePerMission: 0,
};
const plan = { revenue_ar: 1500000, payroll_ar: 150000 }, budgets = { Loyer: 400000, Internet: 100000 };
const rows = budgetVsActual(input, plan, budgets, '2026-10-20', 6);
eq(rows.map((r) => r.month), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], 'six derniers mois, du plus ancien au plus récent');
eq(rows.map((r) => r.partial), [false, false, false, false, false, true], 'seul le mois en cours est « partiel »');
const oct = rows[5], sep = rows[4], aug = rows[3], may = rows[0];
eq(oct.revenue, { planned: 1500000, actual: 1000000, gap: -500000, status: 'open' }, 'octobre revenus : 1 000 000 sur 1 500 000, mois en cours : « en cours »');
eq(oct.expenses, { planned: 500000, actual: 300000, gap: 200000, status: 'good' }, 'octobre dépenses : 300 000 sur 500 000 = 60 % : dans le prévu, marge 200 000');
eq(oct.payroll, { planned: 150000, actual: 200000, gap: -50000, status: 'bad' }, 'octobre paie : 200 000 pour 150 000 : hors prévu');
eq(oct.profit, { planned: 850000, actual: 500000, gap: -350000, status: 'open' }, 'octobre bénéfice : prévu 850 000, réel 500 000, mois en cours');
eq(sep.revenue, { planned: 1500000, actual: 2000000, gap: 500000, status: 'good' }, 'septembre revenus : au-dessus du prévu');
eq(sep.expenses, { planned: 500000, actual: 500000, gap: 0, status: 'watch' }, 'septembre dépenses : exactement le plafond : attention (pas dépassé)');
eq(sep.payroll, { planned: 150000, actual: 100000, gap: 50000, status: 'good' }, 'septembre paie : 67 % : dans le prévu');
eq(sep.profit, { planned: 850000, actual: 1400000, gap: 550000, status: 'good' }, 'septembre bénéfice : mieux que prévu');
eq(aug.revenue.status, 'watch', 'août revenus : 1 250 000 sur 1 500 000 = 83 % : attention');
eq(may.revenue.status, 'bad', 'mai revenus : 0 sur 1 500 000, mois fini : hors prévu');
eq(may.expenses, { planned: 500000, actual: 0, gap: 500000, status: 'good' }, 'mois sans dépense : réel 0, marge complète');
eq(may.profit.status, 'bad', 'mois fini sans rien gagner : bénéfice hors prévu');

// Dépassement net des dépenses
{ const r = budgetVsActual({ ...input, cash: [cash('x', 'out', 600000, '2026-10-02')] }, plan, budgets, '2026-10-20', 1)[0]; eq(r.expenses, { planned: 500000, actual: 600000, gap: -100000, status: 'bad' }, 'dépenses au-dessus du plafond : hors prévu, écart négatif'); }
// Aucun prévu : aucune comparaison
{ const r = budgetVsActual(input, { revenue_ar: 0, payroll_ar: 0 }, undefined, '2026-10-20', 2); eq([r[1].revenue.status, r[1].expenses.status, r[1].payroll.status, r[1].profit.status], ['none', 'none', 'none', 'none'], 'aucun prévu : « rien de prévu » partout, jamais « hors prévu »'); eq(r[1].revenue.actual, 1000000, 'aucun prévu : le réel est quand même calculé'); }
// Seulement un budget de dépenses : revenus et paie sans prévu
{ const r = budgetVsActual(input, { revenue_ar: 0, payroll_ar: 0 }, budgets, '2026-10-20', 1)[0]; eq([r.revenue.status, r.payroll.status, r.expenses.status, r.profit.planned], ['none', 'none', 'good', -500000], 'budgets de dépenses seuls : le prévu de bénéfice est négatif, comparaison faite'); }
// Passage d'année
eq(budgetVsActual(input, plan, budgets, '2026-02-10', 4).map((r) => r.month), ['2025-11', '2025-12', '2026-01', '2026-02'], 'passage d\'année : novembre 2025 à février 2026');
eq([budgetVsActual(input, plan, budgets, '2026-10-20', 0).length, budgetVsActual(input, plan, budgets, '2026-10-20', 99).length], [1, 24], 'nombre de mois borné : 1 à 24');
eq(/NaN|undefined|null|Infinity/.test(JSON.stringify(rows)), false, 'aucun NaN, undefined ni infini dans les résultats');
{ const frozen = JSON.parse(JSON.stringify(input)); Object.freeze(frozen.cash); Object.freeze(frozen.posts); let threw = false; try { budgetVsActual(frozen, plan, Object.freeze({ ...budgets }), '2026-10-20', 3); } catch { threw = true; } eq(threw, false, 'les données reçues ne sont jamais modifiées'); }
eq([Object.keys(PLAN_STATUS_LABEL).length, Object.keys(MONTHLY_PLAN_ERROR_MESSAGE).length], [5, 3], 'libellés : 5 situations, 3 messages');

// ---- Site / serveur
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
  const site = readFileSync('src/utils/budgetPlan.ts', 'utf8').replace(/\r\n/g, '\n');
  const sm = src.match(/\/\/ ===== BEGIN BUDGETPLAN[^\n]*\n([\s\S]*?)\/\/ ===== END BUDGETPLAN =====/);
  const lm = site.match(/\/\/ BEGIN BUDGETPLAN\n([\s\S]*?)\/\/ END BUDGETPLAN/);
  ok(!!sm, 'serveur : bloc BUDGETPLAN présent');
  ok(!!sm && !!lm && sm[1].trim() === lm[1].trim(), 'serveur : le bloc est la copie exacte de src/utils/budgetPlan.ts');
  if (sm) {
    new Function(transformSync(sm[1] + '\n;globalThis.__b = { cleanMonthlyPlan, checkMonthlyPlan };', { loader: 'ts' }).code)();
    const s = (globalThis as any).__b;
    const samples = [{ revenue_ar: 1500000, payroll_ar: 150000 }, { revenue_ar: 'abc', payroll_ar: 250000.4 }, { revenue_ar: -4, payroll_ar: 1e12 }, null, [1], undefined, {}, { revenue_ar: 10000000000 }];
    let same = 0;
    for (const x of samples) { if (JSON.stringify(s.cleanMonthlyPlan(x)) === JSON.stringify(cleanMonthlyPlan(x))) same++; }
    eq(same, samples.length, `serveur et site nettoient pareil ${samples.length} plans`);
    eq(JSON.stringify(s.checkMonthlyPlan({ revenue_ar: 5, payroll_ar: 7 })), JSON.stringify(checkMonthlyPlan({ revenue_ar: 5, payroll_ar: 7 })), 'serveur et site jugent pareil un plan');
  }
  ok(/"monthly_plan", "team_goals", "recurring_missions", "mission_templates", "budgets", "health_acks"\]/.test(src), 'serveur : plan jamais envoyé à un opérateur (réglages réservés à l\'admin)');
  ok(/cleanMonthlyPlan\(sentPlan\)/.test(src), 'serveur : plan revérifié à chaque enregistrement des réglages');
  ok(/sentPlan = \(rec as any\)\.monthly_plan === undefined \? \(existing as any\)\?\.monthly_plan : \(rec as any\)\.monthly_plan/.test(src), 'serveur : un vieux site qui n\'envoie pas le plan ne l\'efface pas');
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
