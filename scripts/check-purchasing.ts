// Contrôle des règles pures du module 4 (fournisseurs, bons de commande, réception, inventaire, budgets, statistiques), sans réseau.
// Lancer : npm run check:purchasing
import {
  budgetRows, canTransition, checkBudgets, checkPurchaseDraft, checkSupplierDraft, inventoryAdjustments, inventoryRows, isLate, lineTotal, nextPurchaseRef,
  planReceipt, poHasReceipt, poIsFullyReceived, poReceivedValue, poTotal, remainingQty, supplierRanking, topPurchased,
} from '../src/utils/purchasing';
import type { CashEntry, Product, PurchaseOrder, StockMove, Supplier } from '../src/types';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const J = (x: unknown) => JSON.stringify(x);

// ---------- fournisseurs ----------
{
  const r = checkSupplierDraft({ name: '  Rabe  ', contact: ' 034 ', lead_days: '5', note: ' n ' });
  ok(r.ok && r.clean.name === 'Rabe' && r.clean.contact === '034' && r.clean.lead_days === 5 && r.clean.note === 'n', 'fournisseur : textes nettoyés, délai en nombre');
  ok(checkSupplierDraft({ name: 'X' }).ok && !('lead_days' in (checkSupplierDraft({ name: 'X' }) as any).clean), 'fournisseur : un nom suffit, pas de délai inventé');
  const bad = (d: any, e: string, name: string) => { const x = checkSupplierDraft(d); ok(!x.ok && x.error === e, name); };
  bad({ name: '' }, 'name', 'nom vide refusé'); bad({ name: '   ' }, 'name', 'nom d\'espaces refusé');
  bad({ name: 'X', lead_days: -1 }, 'lead', 'délai négatif refusé'); bad({ name: 'X', lead_days: 366 }, 'lead', 'délai > 365 refusé'); bad({ name: 'X', lead_days: 'abc' }, 'lead', 'délai illisible refusé'); bad({ name: 'X', lead_days: [4] }, 'lead', 'délai en tableau refusé');
  ok(checkSupplierDraft({ name: 'X', lead_days: 0 }).ok && checkSupplierDraft({ name: 'X', lead_days: 365 }).ok && checkSupplierDraft({ name: 'X', lead_days: '' }).ok, 'délai 0, 365 et vide acceptés');
  ok((checkSupplierDraft({ name: 'N'.repeat(200), note: 'n'.repeat(900) }) as any).clean.name.length === 80 && (checkSupplierDraft({ name: 'N', note: 'n'.repeat(900) }) as any).clean.note.length === 500, 'longueurs limitées');
}

// ---------- bons : création ----------
const draft = (over: any = {}) => ({ supplier_id: 'su-1', date: '2026-10-21', lines: [{ product_id: 'p-1', qty: '10', unit_cost: '500' }], ...over });
{
  const r = checkPurchaseDraft(draft({ expected_date: '2026-10-28', note: 'x', lines: [{ product_id: 'p-1', qty: '10', unit_cost: '1 500' }, { product_id: 'p-2', qty: '2,5', unit_cost: '' }] }));
  ok(r.ok && r.clean.lines[0].unit_cost_ar === 1500 && r.clean.lines[1].qty === 2.5 && r.clean.lines[1].unit_cost_ar === 0 && r.clean.lines.every((l) => l.received_qty === 0) && r.clean.expected_date === '2026-10-28', 'bon valide : montants lus, prix vide = 0, rien de reçu');
  const bad = (over: any, e: string, name: string) => { const x = checkPurchaseDraft(draft(over)); ok(!x.ok && x.error === e, name); };
  bad({ supplier_id: '' }, 'supplier', 'fournisseur manquant refusé'); bad({ date: '2026-13-01' }, 'date', 'date impossible refusée'); bad({ expected_date: '2026-10-01' }, 'expected', 'livraison avant la commande refusée');
  bad({ lines: [] }, 'lines', 'bon vide refusé'); bad({ lines: Array.from({ length: 51 }, (_, i) => ({ product_id: `p${i}`, qty: 1, unit_cost: 1 })) }, 'lines', '51 lignes refusées');
  bad({ lines: [{ product_id: 'p-1', qty: 1, unit_cost: 1 }, { product_id: 'p-1', qty: 1, unit_cost: 1 }] }, 'duplicate', 'même produit deux fois refusé');
  bad({ lines: [{ product_id: '', qty: 1, unit_cost: 1 }] }, 'product', 'produit manquant refusé');
  for (const q of [0, -1, 'abc', '', [2], true, 2e9]) bad({ lines: [{ product_id: 'p-1', qty: q, unit_cost: 1 }] }, 'qty', `quantité ${J(q)} refusée`);
  for (const c of [-1, 'abc', [2], true, 2e12]) bad({ lines: [{ product_id: 'p-1', qty: 1, unit_cost: c }] }, 'cost', `prix ${J(c)} refusé`);
  const idx = checkPurchaseDraft(draft({ lines: [{ product_id: 'p-1', qty: 1, unit_cost: 1 }, { product_id: 'p-2', qty: 0, unit_cost: 1 }] }));
  ok(!idx.ok && idx.index === 1, 'l\'erreur indique la ligne en cause');
}

// ---------- totaux, numéros ----------
const L = (product_id: string, qty: number, unit_cost_ar: number, received_qty = 0) => ({ product_id, qty, unit_cost_ar, received_qty });
const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({ id: 'po-1', ref: 'BC-0001', supplier_id: 'su-1', date: '2026-10-21', status: 'ordered', lines: [L('p-1', 10, 500), L('p-2', 4, 1250)], note: '', ...over });
{
  ok(lineTotal(L('p', 2.5, 101)) === 253 && poTotal(po()) === 10 * 500 + 4 * 1250, 'totaux : quantité × prix, arrondis à l\'Ar');
  ok(poReceivedValue(po({ lines: [L('p-1', 10, 500, 4), L('p-2', 4, 1250, 0)] })) === 2000, 'valeur reçue : seulement ce qui est reçu');
  ok(remainingQty(L('p', 5, 1, 2)) === 3 && remainingQty(L('p', 5, 1, 5)) === 0 && poIsFullyReceived(po({ lines: [L('p', 2, 1, 2)] })) && !poIsFullyReceived(po()) && !poIsFullyReceived(po({ lines: [] })), 'reste à recevoir et bon entièrement reçu');
  ok(poHasReceipt(po({ lines: [L('p', 2, 1, 0.5)] })) && !poHasReceipt(po()), 'bon avec réception ou non');
  ok(nextPurchaseRef([]) === 'BC-0001' && nextPurchaseRef([{ ref: 'BC-0007' }, { ref: 'BC-0002' }, { ref: 'FA-0099' }, { ref: 'xx' }]) === 'BC-0008' && nextPurchaseRef([{ ref: 'BC-9999' }]) === 'BC-10000', 'numéro suivant : plus grand BC existant + 1, autres ignorés');
}

// ---------- états ----------
{
  const t = (p: Partial<PurchaseOrder>, to: any) => canTransition(po(p), to);
  ok(t({ status: 'draft' }, 'ordered') && t({ status: 'draft' }, 'cancelled') && !t({ status: 'draft' }, 'received') && !t({ status: 'draft', lines: [] }, 'ordered'), 'brouillon → commandé ou annulé ; pas reçu ; pas sans ligne');
  ok(t({ status: 'ordered' }, 'cancelled') && !t({ status: 'ordered', lines: [L('p', 2, 1, 1)] }, 'cancelled') && !t({ status: 'ordered' }, 'draft') && !t({ status: 'ordered' }, 'received'), 'commandé → annulé seulement si rien reçu ; jamais brouillon ; « reçu » seulement par réception');
  ok(!t({ status: 'received' }, 'cancelled') && !t({ status: 'cancelled' }, 'ordered') && !t({ status: 'received' }, 'ordered'), 'reçu et annulé sont définitifs');
}

// ---------- réception ----------
{
  const r1 = planReceipt(po(), { 'p-1': 10, 'p-2': 4 });
  ok(r1.ok && r1.plan.status === 'received' && r1.plan.moves.length === 2 && r1.plan.amount === 10 * 500 + 4 * 1250 && r1.plan.lines.every((l) => l.received_qty === l.qty), 'réception complète : 2 entrées, une dépense de la somme, état « reçu »');
  const r2 = planReceipt(po(), { 'p-1': 4 });
  ok(r2.ok && r2.plan.status === 'ordered' && r2.plan.moves.length === 1 && r2.plan.moves[0].qty === 4 && r2.plan.amount === 2000 && r2.plan.lines[0].received_qty === 4 && r2.plan.lines[1].received_qty === 0, 'réception partielle : reste « commandé », seules les lignes reçues avancent');
  const part = po({ lines: [L('p-1', 10, 500, 4), L('p-2', 4, 1250)] });
  const r3 = planReceipt(part, { 'p-1': 6, 'p-2': '4' });
  ok(r3.ok && r3.plan.status === 'received' && r3.plan.amount === 6 * 500 + 4 * 1250, 'la 2e réception complète le bon : « reçu »');
  ok(J(planReceipt(part, { 'p-1': 3 }).ok && (planReceipt(part, { 'p-1': 3 }) as any).plan.lines[0].received_qty) === '7', 'les quantités reçues s\'additionnent');
  const err = (p: PurchaseOrder, got: any, e: string, name: string) => { const x = planReceipt(p, got); ok(!x.ok && x.error === e, name); };
  err(po(), { 'p-1': 11 }, 'qty', 'plus que commandé refusé'); err(part, { 'p-1': 7 }, 'qty', 'plus que le reste à recevoir refusé');
  err(po(), { 'p-1': -1 }, 'qty', 'quantité négative refusée'); err(po(), { 'p-1': 'abc' }, 'qty', 'quantité illisible refusée'); err(po(), { 'p-1': [2] as any }, 'qty', 'quantité en tableau refusée');
  err(po(), {}, 'none', 'rien reçu refusé'); err(po(), { 'p-1': 0, 'p-2': '' }, 'none', 'que des zéros ou des vides refusé');
  err(po(), { 'p-9': 1 }, 'product', 'produit qui n\'est pas dans le bon refusé');
  err(po({ status: 'draft' }), { 'p-1': 1 }, 'status', 'réception d\'un brouillon refusée'); err(po({ status: 'received' }), { 'p-1': 1 }, 'status', 'réception d\'un bon déjà reçu refusée'); err(po({ status: 'cancelled' }), { 'p-1': 1 }, 'status', 'réception d\'un bon annulé refusée');
  const free = planReceipt(po({ lines: [L('p-1', 2, 0)] }), { 'p-1': 2 });
  ok(free.ok && free.plan.amount === 0 && free.plan.status === 'received', 'ligne sans prix : entrée de stock, aucune dépense (montant 0)');
  const before = J(po());
  planReceipt(po(), { 'p-1': 3 }); ok(J(po()) === before, 'le plan ne modifie jamais le bon d\'origine');
  const dec = planReceipt(po({ lines: [L('p-1', 3, 100)] }), { 'p-1': 0.1 });
  const dec2 = planReceipt(po({ lines: [L('p-1', 0.3, 100)] }), { 'p-1': 0.1 });
  ok(dec.ok && dec2.ok && (dec2.plan.lines[0].received_qty === 0.1), 'décimales : 0,1 reçu sur 0,3');
  const three = planReceipt(po({ lines: [L('p-1', 0.3, 100)] }), { 'p-1': 0.1 });
  const two = three.ok ? planReceipt(po({ lines: three.plan.lines }), { 'p-1': 0.1 }) : three;
  const one = two.ok ? planReceipt(po({ lines: two.plan.lines }), { 'p-1': 0.1 }) : two;
  ok(one.ok && one.plan.status === 'received' && one.plan.lines[0].received_qty === 0.3, 'trois réceptions de 0,1 sur 0,3 : « reçu » exactement (pas d\'erreur d\'arrondi)');
}

// ---------- retard ----------
{
  ok(isLate(po({ expected_date: '2026-10-20' }), '2026-10-21') && !isLate(po({ expected_date: '2026-10-21' }), '2026-10-21') && !isLate(po({ expected_date: '2026-10-20', status: 'received' }), '2026-10-21') && !isLate(po(), '2026-10-21'), 'retard : commandé, livraison prévue dépassée ; pas le jour même ; pas si reçu ; pas sans date');
}

// ---------- inventaire ----------
const prod = (id: string, name: string, buy = 100): Product => ({ id, name, category: '', unit: 'unité', buy_price_ar: buy, sell_price_ar: 0, alert_threshold: 0 });
const mv = (id: string, product_id: string, type: 'in' | 'out' | 'adjust', qty: number, date = '2026-10-10', extra: Partial<StockMove> = {}): StockMove => ({ id, product_id, type, qty, date, note: '', ...extra });
{
  const products = [prod('p-2', 'Colle'), prod('p-1', 'Agrafes')];
  const moves = [mv('m1', 'p-1', 'in', 20), mv('m2', 'p-1', 'out', 5), mv('m3', 'p-2', 'in', 7)];
  const rows = inventoryRows(products, moves, { 'p-1': '12', 'p-2': '' });
  ok(rows[0].product.id === 'p-1' && rows[0].expected === 15 && rows[0].counted === 12 && rows[0].diff === -3 && rows[1].counted === null && rows[1].diff === null && !rows[1].bad, 'inventaire : attendu = entrées − sorties, écart = compté − attendu, non compté = pas d\'écart');
  ok(J(inventoryAdjustments(rows)) === J([{ product_id: 'p-1', qty: -3, expected: 15, counted: 12 }]), 'ajustements : seulement les produits comptés avec un écart');
  const same = inventoryRows(products, moves, { 'p-1': 15, 'p-2': '7' });
  ok(same.every((r) => r.diff === 0) && inventoryAdjustments(same).length === 0, 'comptage identique au stock : aucun ajustement');
  const bad = inventoryRows(products, moves, { 'p-1': '-1', 'p-2': 'abc' });
  ok(bad.every((r) => r.bad && r.counted === null) && inventoryAdjustments(bad).length === 0, 'quantité négative ou illisible : marquée fausse, aucun ajustement');
  ok(inventoryRows(products, moves, { 'p-1': [3] as any })[0].bad && inventoryRows(products, moves, { 'p-1': 2e9 })[0].bad, 'comptage en tableau ou énorme refusé');
  ok(inventoryRows(products, moves, { 'p-1': '0' })[0].diff === -15, 'compter 0 est un vrai comptage (écart −15)');
  const up = inventoryRows(products, moves, { 'p-1': '20.5' });
  ok(up[0].diff === 5.5 && inventoryAdjustments(up)[0].qty === 5.5, 'écart positif et décimal');
  const withAdj = inventoryRows(products, [...moves, mv('m4', 'p-1', 'adjust', -3, '2026-10-11', { reason: 'inventory', counted_qty: 12, expected_qty: 15 })], { 'p-1': '12' });
  ok(withAdj[0].expected === 12 && withAdj[0].diff === 0, 'après l\'ajustement, le stock attendu = le compté (écart 0)');
  ok(inventoryRows([], [], {}).length === 0, 'aucun produit : liste vide');
}

// ---------- budgets ----------
{
  const r = checkBudgets({ Loyer: '500 000', Achats: 1200000.4, Internet: '', Autres: 0 });
  ok(r.ok && J(r.clean) === J({ Loyer: 500000, Achats: 1200000 }), 'budgets : montants lus, vide et 0 retirés');
  for (const b of [{ Loyer: -1 }, { Loyer: 'abc' }, { Loyer: [5] }, { Loyer: true }, { Loyer: 2e12 }, { '': 5 }, { __proto__x: 1 } as any]) {
    const x = checkBudgets(b as any); if (!('__proto__x' in b)) ok(!x.ok, `budget ${J(b)} refusé`);
  }
  ok(!checkBudgets(JSON.parse('{"__proto__":5}')).ok && !checkBudgets({ constructor: 5 } as any).ok, 'noms dangereux refusés');
  ok(!checkBudgets(Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`c${i}`, 1]))).ok && checkBudgets(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, 1]))).ok, '30 catégories permises, 31 refusées');
  const cash = (id: string, category: string, amount_ar: number, date: string, kind: 'in' | 'out' = 'out'): CashEntry => ({ id, kind, category, amount_ar, date, note: '' });
  const entries = [cash('1', 'Loyer', 400000, '2026-10-03'), cash('2', 'Loyer', 100000, '2026-10-20'), cash('3', 'Loyer', 999, '2026-09-30'), cash('4', 'Loyer', 5000, '2026-10-04', 'in'), cash('5', 'Achats', 79, '2026-10-05'), cash('6', 'Internet', 80, '2026-10-05'), cash('7', 'Matériel', 101, '2026-10-05'), cash('8', 'Transport', 100, '2026-10-05')];
  const rows = budgetRows({ Loyer: 500000, Achats: 100, Internet: 100, Matériel: 100, Transport: 100, Libre: 100 }, entries, '2026-10');
  const by = Object.fromEntries(rows.map((x) => [x.category, x]));
  ok(by.Loyer.spent === 500000 && by.Loyer.pct === 100 && by.Loyer.status === 'warn' && by.Loyer.left === 0, 'budget : seules les dépenses du mois comptent (pas les entrées, pas le mois d\'avant) ; 100 % pile = attention, pas dépassé');
  ok(by.Achats.pct === 79 && by.Achats.status === 'ok' && by.Internet.pct === 80 && by.Internet.status === 'warn' && by.Matériel.status === 'over' && by.Matériel.left === -1 && by.Transport.status === 'warn', 'seuils : 79 % ok, 80 % attention, 100 % attention, 101 dépensé sur 100 = dépassé');
  ok(by.Libre.spent === 0 && by.Libre.pct === 0 && by.Libre.status === 'ok', 'catégorie sans dépense : 0 %');
  ok(rows[0].status === 'over' && rows.map((x) => x.pct).every((p, i, a) => i === 0 || a[i - 1] >= p), 'tri : les plus avancés d\'abord');
  ok(budgetRows(undefined, entries, '2026-10').length === 0 && budgetRows({}, entries, '2026-10').length === 0 && budgetRows({ A: 0 }, entries, '2026-10').length === 0, 'aucun budget : liste vide');
}

// ---------- statistiques d'achat ----------
{
  const sup = (id: string, name: string): Supplier => ({ id, name, contact: '', note: '', active: true });
  const suppliers = [sup('s1', 'Rabe'), sup('s2', 'Zoma'), sup('s3', 'Jamais')];
  const orders = [
    po({ id: 'o1', supplier_id: 's1', date: '2026-10-01', status: 'received', lines: [L('p-1', 10, 500, 10)] }),
    po({ id: 'o2', supplier_id: 's1', date: '2026-10-10', status: 'ordered', expected_date: '2026-10-15', lines: [L('p-1', 10, 500, 4)] }),
    po({ id: 'o3', supplier_id: 's2', date: '2026-10-05', status: 'received', lines: [L('p-2', 2, 10000, 2)] }),
    po({ id: 'o4', supplier_id: 's2', date: '2026-10-06', status: 'draft' }), po({ id: 'o5', supplier_id: 's2', date: '2026-10-07', status: 'cancelled' }), po({ id: 'o6', supplier_id: 's1', date: '2026-08-01', status: 'received', lines: [L('p-1', 1, 1, 1)] }),
  ];
  const moves = [mv('a', 'p-1', 'in', 10, '2026-10-04', { po_id: 'o1', unit_cost_ar: 500 }), mv('b', 'p-1', 'in', 4, '2026-10-14', { po_id: 'o2', unit_cost_ar: 500 }), mv('c', 'p-2', 'in', 2, '2026-10-12', { po_id: 'o3', unit_cost_ar: 10000 })];
  const rank = supplierRanking(suppliers, orders, moves, '2026-10-01', '2026-10-31', '2026-10-21');
  ok(rank.length === 2 && rank[0].supplier.id === 's2' && rank[0].spentAr === 20000 && rank[0].orders === 1 && rank[1].supplier.id === 's1', 'classement : par dépense ; brouillons, annulés, hors période et fournisseurs sans bon exclus');
  ok(rank[1].orders === 2 && rank[1].received === 1 && rank[1].spentAr === 5000 + 2000 && rank[1].late === 1, 'fournisseur : bons, reçus, valeur reçue (partielle comprise) et retards');
  ok(rank[1].avgLeadDays === (3 + 4) / 2 && rank[0].avgLeadDays === 7, 'délai réel : 1re réception − commande, moyenne');
  const noRecv = supplierRanking([sup('s1', 'R')], [po({ id: 'x', supplier_id: 's1', status: 'ordered', date: '2026-10-01' })], [], '2026-10-01', '2026-10-31', '2026-10-21');
  ok(noRecv[0].avgLeadDays === null && noRecv[0].spentAr === 0, 'sans réception : délai inconnu (null), pas 0');
  const prods = [prod('p-1', 'Agrafes'), prod('p-2', 'Colle')];
  const top = topPurchased(prods, [...moves, mv('d', 'p-1', 'in', 5, '2026-10-20', { unit_cost_ar: 700 }), mv('e', 'p-1', 'in', 5, '2026-10-21'), mv('f', 'p-1', 'out', 3, '2026-10-21'), mv('g', 'p-9', 'in', 1, '2026-10-21', { unit_cost_ar: 9999999 }), mv('h', 'p-1', 'in', 1, '2026-09-01', { unit_cost_ar: 99999 })], '2026-10-01', '2026-10-31');
  ok(top.length === 2 && top[0].product.id === 'p-2' && top[0].spentAr === 20000 && top[0].avgUnitCost === 10000, 'produits achetés : classés par dépense');
  ok(top[1].product.id === 'p-1' && top[1].qty === 19 && top[1].spentAr === 5000 + 2000 + 3500 && top[1].lastUnitCost === 700 && top[1].avgUnitCost === Math.round(10500 / 19), 'produit : quantité, dépense, prix moyen et dernier prix payé (entrées sans prix, sorties, produit inconnu et hors période ignorés)');
  ok(topPurchased(prods, moves, '2026-10-01', '2026-10-31', 1).length === 1, 'limite du classement');
}

console.log(`\n${n - fails}/${n} contrôles ${fails ? 'ECHEC(S) : ' + fails : 'réussis'}`);
process.exit(fails ? 1 : 0);
