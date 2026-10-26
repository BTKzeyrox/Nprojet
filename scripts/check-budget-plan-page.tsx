// Essai de la carte « Prévu contre réel » (M15.4), sans écran réel et sans réseau : démo responsable et salarié, FR et EN, calculs, enregistrement.
// Lancer : npm run check:budget-plan-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.fetch = async () => { throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { PlanVsActualCard } = await import('../src/views/admin/PlanVsActualCard');
const { budgetVsActual, plannedExpenses } = await import('../src/utils/budgetPlan');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en') => renderToString(<PlanVsActualCard lang={lang} />).replace(/<!--.*?-->/g, '');
const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

// ---------- démo responsable ----------
db.enterDemo('admin');
const s = db.getSettings();
const plan = db.getMonthlyPlan();
ok(plan.revenue_ar === 2000000 && plan.payroll_ar === 800000, 'démo : plan mensuel inventé (revenus 2 000 000, paie 800 000)');
const rows = budgetVsActual({ cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), prices: s, pricePerMission: s.price_per_mission || 0, clients: db.getClients() }, plan, s.budgets, todayMada(), 6);
const fr = view('fr'), en = view('en');
ok(fr.length > 1500 && !bad(fr) && !bad(en), 'la carte s\'affiche en FR et EN, sans NaN ni undefined');
ok(fr.includes('Prévu contre réel') && fr.includes('Revenus prévus / mois') && fr.includes('mois en cours'), 'FR : titre, réglage du plan, mois en cours signalé');
ok(en.includes('Planned vs actual') && en.includes('Planned revenue / month') && en.includes('current month') && !/Prévu|Réel|Écart|Revenus|Dépenses|Paie|Bénéfice|Enregistrer/.test(en), 'EN : pas de français dans les libellés');
ok((fr.match(/<li /g) || []).length === 6, 'six mois affichés');
ok((fr.match(/Prévu :/g) || []).length >= 6 * 3, 'quatre lignes par mois (une peut être « — » sans prévu) avec « Prévu »');
ok(rows.length === 6 && rows.every(r => r.revenue.planned === 2000000 && r.payroll.planned === 800000 && r.expenses.planned === plannedExpenses(s.budgets)), 'le prévu de chaque mois = plan (revenus, paie) + total des budgets (dépenses)');
const cur = rows[5];
ok(fr.includes(`Réel : ${fmt(cur.revenue.actual)}`.replace(/\s/g, ' ')) || fr.replace(/[\u202f\u00a0]/g, ' ').includes(`Réel : ${fmt(cur.revenue.actual).replace(/[\u202f\u00a0]/g, ' ')}`), 'le réel du mois en cours affiché est celui qui est calculé');
ok(rows.every(r => Number.isFinite(r.profit.actual) && r.profit.actual === r.revenue.actual - r.expenses.actual - r.payroll.actual), 'bénéfice réel = revenus − dépenses − paie, tous mois');
ok(plannedExpenses(s.budgets) === 66000, 'démo : dépenses prévues = total des 4 budgets par catégorie du module 4 (66 000)');

// ---------- enregistrement ----------
let r = db.saveMonthlyPlan({ revenue_ar: 3000000, payroll_ar: 900000 });
ok(r.success && db.getMonthlyPlan().revenue_ar === 3000000 && db.getMonthlyPlan().payroll_ar === 900000, 'plan enregistré et relu');
ok(view('fr').replace(/[\u202f\u00a0]/g, ' ').includes('3 000 000'), 'le nouveau prévu apparaît dans la carte');
r = db.saveMonthlyPlan({ revenue_ar: 0, payroll_ar: 0 });
ok(r.success && db.getMonthlyPlan().revenue_ar === 0, 'plan remis à zéro : accepté (= rien de prévu)');
const emptyFr = view('fr');
ok(!bad(emptyFr) && emptyFr.includes('Rien de prévu'), 'sans plan : « Rien de prévu », pas d\'erreur');
const before = JSON.stringify(db.getMonthlyPlan());
ok(db.saveMonthlyPlan({ revenue_ar: -1 }).error === 'Revenus prévus : un montant en Ar, de 0 à 10 000 000 000.', 'revenus négatifs refusés avec un message clair');
ok(db.saveMonthlyPlan({ payroll_ar: 'abc' }).error === 'Paie prévue : un montant en Ar, de 0 à 10 000 000 000.', 'paie en texte refusée avec un message clair');
ok(db.saveMonthlyPlan({ revenue_ar: 1e12 }).success === false, 'plus de 10 milliards refusé');
ok(JSON.stringify(db.getMonthlyPlan()) === before, 'les refus ne changent rien');

// ---------- démo salarié : aucun plan, aucune écriture ----------
db.enterDemo('employee');
ok(db.getMonthlyPlan().revenue_ar === 0 && db.getMonthlyPlan().payroll_ar === 0, 'salarié : ne reçoit aucun plan (zéros)');
ok(!('monthly_plan' in (db.getSettings() as any)) && !('budgets' in (db.getSettings() as any) && (db.getSettings() as any).budgets), 'salarié : ni plan ni budgets dans ses réglages');
ok(db.saveMonthlyPlan({ revenue_ar: 5, payroll_ar: 5 }).success === false, 'salarié : ne peut pas écrire le plan');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
