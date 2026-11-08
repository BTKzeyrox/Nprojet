// Contrôles du travail saisi (module 26, M26.8) : boîtes déclarées contre Stock, boîtes par heure, régularité. Lancer : npm run check:work-checks
import { readFileSync } from 'node:fs';
import { workStockGap, workRate, isBoxProduct, isWorkLine } from '../src/utils/workChecks';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const TODAY = '2026-11-08';
const line = (o: any) => ({ id: `we-${o.date}-${o.emp || 'e1'}-${o.type || 'pack'}`, date: '2026-11-05', status: 'completed', employee_id: 'e1', quantity: 0, ...o });
const box = { id: 'p1', name: 'Boîtes', unit: 'boîte' } as any;
const mv = (q: number, date = '2026-11-04', type = 'in', pid = 'p1') => ({ id: 'm' + Math.random(), product_id: pid, type, qty: q, date }) as any;

ok(isBoxProduct({ unit: 'boîte' } as any) && isBoxProduct({ unit: ' Cartons ' } as any) && isBoxProduct({ unit: 'box' } as any) && !isBoxProduct({ unit: 'kg' } as any) && !isBoxProduct({ unit: '' } as any), 'produit « boîte » reconnu par son unité');
ok(isWorkLine(line({})) && !isWorkLine({ id: 'post-1', date: TODAY, status: 'completed' }) && !isWorkLine(line({ status: 'pending_end' })) && !isWorkLine(line({ date: 'x' })), 'seules les lignes de feuille validées comptent');

const g1 = workStockGap([line({ quantity: 500 })] as any, [box], [mv(380)], TODAY);
ok(!!g1 && g1.declared === 500 && g1.received === 380 && g1.missing === 120 && g1.pct === 24, '500 déclarées, 380 reçues : écart 120 (24 %)');
ok(workStockGap([line({ quantity: 500 })] as any, [box], [mv(480)], TODAY) === null, 'dans la tolérance de 10 % : rien');
ok(workStockGap([line({ quantity: 500 })] as any, [box], [mv(500)], TODAY) === null, 'tout reçu : rien');
ok(workStockGap([line({ quantity: 500 })] as any, [{ id: 'p2', unit: 'kg' } as any], [], TODAY) === null, 'aucun produit en boîtes : on se tait');
ok(workStockGap([line({ quantity: 5 })] as any, [box], [], TODAY) === null, 'moins de 10 déclarées : on se tait');
ok(workStockGap([line({ quantity: 15, rejected: 10 })] as any, [box], [], TODAY) === null, 'les boîtes refusées ne sont pas déclarées');
ok(workStockGap([line({ quantity: 500, date: '2026-09-01' })] as any, [box], [], TODAY) === null, 'ligne de plus de 30 jours : ignorée');
ok(workStockGap([line({ quantity: 500, date: '2026-11-20' })] as any, [box], [], TODAY) === null, 'ligne du futur : ignorée');
ok(workStockGap([line({ quantity: 500 })] as any, [box], [mv(380, '2026-11-04', 'out'), mv(100, '2026-11-04', 'adjust')], TODAY)!.received === 0, 'sorties et ajustements ne sont pas des entrées');
ok(workStockGap([line({ quantity: 500 })] as any, [box], [mv(380, '2026-08-01')], TODAY)!.received === 0, 'entrée de plus de 30 jours : ignorée');
ok(workStockGap([line({ quantity: 500 })] as any, [box], [mv(380, '2026-11-04', 'in', 'autre')], TODAY)!.received === 0, 'entrée d\'un autre produit : ignorée');
ok(workStockGap([line({ quantity: NaN }), line({ quantity: -4 }), line({ quantity: 'x' })] as any, [box], [], TODAY) === null && workStockGap([] as any, [box], [], 'nimporte') === null, 'valeurs absurdes : jamais de plantage ni de NaN');

// Boîtes par heure, régularité
const days = (qs: number[], h = 8) => qs.map((q, i) => line({ date: `2026-11-0${i + 1}`, quantity: q, hours: h }));
const r1 = workRate(days([100, 100, 100]) as any, 'e1', TODAY);
ok(r1.days === 3 && r1.quantity === 300 && r1.hours === 24 && r1.perHour === 12.5 && r1.regularity === 100, 'même quantité chaque jour : 12,5 par heure, régularité 100 %');
const r2 = workRate(days([50, 100, 150]) as any, 'e1', TODAY);
ok(r2.regularity !== null && r2.regularity < 100 && r2.regularity >= 0, 'quantités inégales : régularité plus basse');
ok(workRate(days([100, 100]) as any, 'e1', TODAY).regularity === null, 'moins de 3 jours : pas de régularité');
ok(workRate(days([100, 100, 100], 0) as any, 'e1', TODAY).perHour === null, 'sans heures : pas de « par heure » (jamais une division par zéro)');
ok(workRate(days([100, 100, 100]) as any, 'autre', TODAY).days === 0, 'on ne compte que cet employé');
ok(workRate([line({ date: '2026-11-05', quantity: 100, hours: 8 }), line({ date: '2026-11-05', quantity: 50, hours: 4, type: 'b' })] as any, 'e1', TODAY).days === 1, 'deux lignes le même jour = un jour travaillé');
ok(workRate([line({ quantity: 90, rejected: 30, hours: 6 })] as any, 'e1', TODAY).perHour === 10, 'boîtes refusées retirées avant de diviser par les heures');
ok(workRate(days([0, 0, 0]) as any, 'e1', TODAY).regularity === null, 'jamais de quantité : pas de régularité');
for (const r of [r1, r2]) ok(!/NaN|Infinity/.test(JSON.stringify(r)), 'jamais NaN ni Infinity');

// Branchements
const st = readFileSync('src/utils/health/rules/stock.ts', 'utf8'), pf = readFileSync('src/utils/performance.ts', 'utf8'), pp = readFileSync('src/views/admin/PerformancePage.tsx', 'utf8');
ok(/if \(!WORK_SETTINGS_LIVE\) return \[\];[\s\S]{0,200}workStockGap/.test(st) && /purchaseNoMove, workVsStock\]/.test(st), 'alerte Santé du site : dans la liste du Stock, muette module fermé');
ok(/workRate\(db\.getPosts\(\)/.test(pf), 'performance : boîtes par heure et régularité calculées');
ok(/showWork = WORK_SETTINGS_LIVE/.test(pp) && /data-perf-perhour/.test(pp) && /data-perf-regularity/.test(pp), 'page Performance : colonnes visibles module ouvert seulement');
// M26.12 : une ligne de la Feuille du jour n'est pas une « mission terminée »
const mc = readFileSync('src/utils/monthLevel.ts', 'utf8'), ps = readFileSync('src/utils/performanceScore.ts', 'utf8'), dsh = readFileSync('src/views/admin/AdminDashboard.tsx', 'utf8');
ok(/!isWorkLine\(p\)\); \/\/ M26\.12/.test(pf) && /entryDays/.test(pf), 'performance : les lignes de saisie sont comptées à part (jours saisis), pas en missions terminées');
ok(/!isWorkLine\(p\)\); \/\/ les lignes de la Feuille du jour/.test(dsh), 'Tableau de bord : « Missions terminées » sans les lignes de saisie');
ok(/!\(\(p as any\)\.work_type\)/.test(mc) && /\(p as any\)\.work_type\) continue; \/\/ M26\.12/.test(ps), 'niveaux du mois et score de performance : sans les lignes de saisie');
ok(/data-perf-entrydays/.test(pp), 'page Performance : colonne « Jours saisis »');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
