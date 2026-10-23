// Contrôle de la sécurité des fournisseurs, bons de commande et budgets dans le serveur df-api (module 4), sans réseau.
// Lancer : npm run check:purchasing-server
// 1) teste les vraies fonctions du serveur (extraites du fichier) ; 2) les compare aux règles du site (src/utils/purchasing.ts) ;
// 3) vérifie par lecture du code les droits (admin seulement), les liens (le fournisseur et les produits doivent exister) et les suppressions ;
// 4) vérifie la migration (RLS, aucun accès public). Si quelqu'un retire une protection, ce contrôle échoue.
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { canTransition, checkBudgets, checkPurchaseDraft, checkSupplierDraft, planReceipt } from '../src/utils/purchasing';
import type { PurchaseOrder } from '../src/types';

const read = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const J = (x: unknown) => JSON.stringify(x);
const clone = <T,>(x: T): T => structuredClone(x);

const block = (name: string) => {
  const m = new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`).exec(src);
  ok(!!m, `bloc « ${name} » trouvé dans le serveur`);
  return transformSync(m![1], { loader: 'ts' }).code;
};
const srv = new Function(`${block('CASH')}\n${block('STOCK')}\n${block('SUPPLIERS')}\n${block('PRIVACY')}
return { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE, cleanCash, cleanStockMove, cleanSupplier, cleanPurchase, cleanBudgets, applyBudgets, stripSettings, SETTINGS_ADMIN_KEYS };`)() as any;
const { cleanSupplier, cleanPurchase, cleanBudgets, applyBudgets, cleanStockMove, cleanCash } = srv;
const NOW = '2026-10-21T08:00:00.000Z', LATER = '2026-10-22T08:00:00.000Z';

// ---------- droits ----------
for (const c of ['suppliers', 'purchases']) {
  ok(srv.ADMIN_ONLY_READ.includes(c), `lecture réservée à l'admin : ${c}`);
  ok(srv.ADMIN_ONLY_WRITE.includes(c), `écriture réservée à l'admin : ${c}`);
}
ok(['cash', 'products', 'stock', 'clients'].every((c) => srv.ADMIN_ONLY_READ.includes(c) && srv.ADMIN_ONLY_WRITE.includes(c)), 'les protections des finances, du stock et des clients sont toujours là');
ok(srv.SETTINGS_ADMIN_KEYS.includes('budgets'), 'les budgets ne sont jamais envoyés à un employé (liste des réglages réservés)');
{
  const rec = { id: 'general', price_per_mission: 1000, budgets: { Loyer: 500000 } };
  ok(!('budgets' in srv.stripSettings(clone(rec), { role: 'employee' })) && 'budgets' in srv.stripSettings(clone(rec), { role: 'admin' }), 'employé : réglages sans budgets ; admin : avec');
}

// ---------- fournisseurs ----------
const goodS = { id: 'su-1', name: 'Quincaillerie Rabe', contact: '034 11 111 11', lead_days: 5, note: 'livre le jeudi' };
{
  const v = cleanSupplier(goodS, undefined, 'admin-1', NOW);
  ok(v.ok && v.save.created_by === 'admin-1' && v.save.created_at === NOW && v.save.updated_at === NOW && v.save.active === true && v.save.lead_days === 5, 'fournisseur valide accepté, créateur et dates posés par le serveur');
  const up = cleanSupplier({ ...goodS, name: 'Rabe & fils' }, { created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z' }, 'admin-1', LATER);
  ok(up.ok && up.save.created_by === 'admin-0' && up.save.created_at === '2026-10-01T00:00:00.000Z' && up.save.updated_at === LATER, 'modification : créateur et date de création conservés');
  ok(!('lead_days' in cleanSupplier({ id: 'su-2', name: 'Min' }, undefined, 'a', NOW).save) && cleanSupplier({ id: 'su-2', name: 'Min' }, undefined, 'a', NOW).ok, 'fiche minimale (un nom) acceptée, sans délai inventé');
  ok(cleanSupplier({ ...goodS, active: false }, undefined, 'a', NOW).save.active === false && cleanSupplier({ ...goodS, active: 'non' }, undefined, 'a', NOW).save.active === true, 'archivé = seulement active === false');
  ok(cleanSupplier({ ...goodS, lead_days: 0 }, undefined, 'a', NOW).save.lead_days === 0 && cleanSupplier({ ...goodS, lead_days: '' }, undefined, 'a', NOW).ok, 'délai 0 accepté, délai vide accepté');
  const bad = (patch: any, reason: string, name: string) => { const r = cleanSupplier({ ...goodS, ...patch }, undefined, 'a', NOW); ok(!r.ok && r.reason === reason, name); };
  bad({ name: '' }, 'name', 'nom vide refusé'); bad({ name: '   ' }, 'name', 'nom d\'espaces refusé'); bad({ name: undefined }, 'name', 'nom absent refusé');
  bad({ id: '' }, 'id', 'identifiant vide refusé'); bad({ id: 'x'.repeat(81) }, 'id', 'identifiant trop long refusé'); bad({ id: 42 }, 'id', 'identifiant non texte refusé');
  bad({ lead_days: -1 }, 'lead', 'délai négatif refusé'); bad({ lead_days: 366 }, 'lead', 'délai de 366 jours refusé'); bad({ lead_days: 'abc' }, 'lead', 'délai illisible refusé');
  bad({ lead_days: [5] }, 'lead', 'délai en tableau refusé'); bad({ lead_days: true }, 'lead', 'délai booléen refusé'); bad({ lead_days: NaN }, 'lead', 'délai NaN refusé');
  ok(cleanSupplier(null, undefined, 'a', NOW).reason === 'id', 'enregistrement vide refusé');
  ok(cleanSupplier({ ...goodS, name: 'A'.repeat(200), note: 'n'.repeat(900), contact: 'c'.repeat(500) }, undefined, 'a', NOW).save.name.length === 80, 'textes coupés aux longueurs permises');
  // même résultat que les règles du site
  const cases: any[] = [goodS, { id: 'x', name: '  Espaces  ', contact: ' c ', lead_days: '7', note: ' n ' }, { id: 'x', name: 'Z', lead_days: '0' }, { id: 'x', name: 'Z', lead_days: 365 }, { id: 'x', name: 'Z', lead_days: '1,5' }];
  const same = cases.every((c) => { const a = cleanSupplier(c, undefined, 'a', NOW), b = checkSupplierDraft(c); return a.ok === b.ok && (!a.ok || (a.save.name === (b as any).clean.name && a.save.contact === (b as any).clean.contact && a.save.lead_days === (b as any).clean.lead_days && a.save.note === (b as any).clean.note)); });
  ok(same, `fournisseur : mêmes résultats que les règles du site sur ${cases.length} cas`);
}

// ---------- bons de commande : création ----------
const L = (product_id: string, qty: number, unit_cost_ar: number, received_qty = 0) => ({ product_id, qty, unit_cost_ar, received_qty });
const goodP = { id: 'po-1', ref: 'BC-0001', supplier_id: 'su-1', date: '2026-10-21', expected_date: '2026-10-28', status: 'draft', lines: [L('p-1', 10, 500), L('p-2', 4.5, 1200)], note: 'urgent' };
const mk = (over: any = {}) => ({ ...clone(goodP), ...over });
{
  const v = cleanPurchase(goodP, undefined, 'admin-1', NOW);
  ok(v.ok && v.save.status === 'draft' && v.save.created_by === 'admin-1' && v.save.created_at === NOW && v.save.lines.length === 2 && v.save.expected_date === '2026-10-28', 'bon valide accepté (brouillon), créateur et dates posés par le serveur');
  ok(cleanPurchase(mk({ status: 'ordered' }), undefined, 'a', NOW).ok, 'création directe « commandé » acceptée');
  ok(!('expected_date' in cleanPurchase(mk({ expected_date: '' }), undefined, 'a', NOW).save), 'livraison prévue vide : champ non écrit');
  const bad = (over: any, reason: string, name: string, ex?: any) => { const r = cleanPurchase(mk(over), ex, 'a', NOW); ok(!r.ok && r.reason === reason, name); };
  bad({ id: '' }, 'id', 'identifiant vide refusé'); bad({ ref: 'FA-0001' }, 'ref', 'numéro qui ne commence pas par BC- refusé'); bad({ ref: 'BC-' }, 'ref', 'numéro sans chiffres refusé'); bad({ ref: 'BC-1234567890' }, 'ref', 'numéro trop long refusé');
  bad({ supplier_id: '' }, 'supplier', 'fournisseur vide refusé'); bad({ supplier_id: 5 }, 'supplier', 'fournisseur non texte refusé');
  bad({ date: '2026-02-30' }, 'date', 'date impossible refusée'); bad({ date: '' }, 'date', 'date vide refusée');
  bad({ expected_date: '2026-10-20' }, 'expected', 'livraison avant la commande refusée'); bad({ expected_date: 'demain' }, 'expected', 'livraison illisible refusée');
  bad({ status: 'inconnu' }, 'status', 'état inconnu refusé'); bad({ status: 'received' }, 'status', 'création directe « reçu » refusée'); bad({ status: 'cancelled' }, 'status', 'création directe « annulé » refusée');
  bad({ lines: [] }, 'lines', 'bon sans ligne refusé'); bad({ lines: 'x' }, 'lines', 'lignes qui ne sont pas un tableau refusées'); bad({ lines: Array.from({ length: 51 }, (_, i) => L(`p-${i}`, 1, 1)) }, 'lines', '51 lignes refusées');
  bad({ lines: [L('p-1', 1, 1), L('p-1', 2, 1)] }, 'duplicate', 'même produit deux fois refusé'); bad({ lines: [L('', 1, 1)] }, 'product', 'produit vide refusé');
  bad({ lines: [L('p-1', 0, 1)] }, 'qty', 'quantité 0 refusée'); bad({ lines: [L('p-1', -2, 1)] }, 'qty', 'quantité négative refusée'); bad({ lines: [{ product_id: 'p-1', qty: 'abc', unit_cost_ar: 1 }] }, 'qty', 'quantité illisible refusée');
  bad({ lines: [{ product_id: 'p-1', qty: [3], unit_cost_ar: 1 }] }, 'qty', 'quantité en tableau refusée'); bad({ lines: [{ product_id: 'p-1', qty: true, unit_cost_ar: 1 }] }, 'qty', 'quantité booléenne refusée'); bad({ lines: [L('p-1', 2e9, 1)] }, 'qty', 'quantité énorme refusée');
  bad({ lines: [L('p-1', 1, -5)] }, 'cost', 'prix négatif refusé'); bad({ lines: [L('p-1', 1, 2e12)] }, 'cost', 'prix énorme refusé'); bad({ lines: [{ product_id: 'p-1', qty: 1, unit_cost_ar: 'abc' }] }, 'cost', 'prix illisible refusé');
  bad({ lines: [L('p-1', 5, 10, 6)] }, 'received', 'reçu plus que commandé refusé');
  bad({ lines: [L('p-1', 5, 10, 2)] }, 'received', 'création avec une quantité déjà reçue refusée');
  ok(cleanPurchase(mk({ lines: [{ product_id: 'p-1', qty: 2, unit_cost_ar: '' }] }), undefined, 'a', NOW).save.lines[0].unit_cost_ar === 0, 'prix vide = 0 (à compléter)');
  ok(cleanPurchase(mk({ lines: [{ product_id: 'p-1', qty: 2.456, unit_cost_ar: 100.6 }] }), undefined, 'a', NOW).save.lines[0].qty === 2.46 && cleanPurchase(mk({ lines: [{ product_id: 'p-1', qty: 2, unit_cost_ar: 100.6 }] }), undefined, 'a', NOW).save.lines[0].unit_cost_ar === 101, 'quantité arrondie à 2 décimales, prix à l\'Ar');
  ok(cleanPurchase(mk({ note: 'n'.repeat(900) }), undefined, 'a', NOW).save.note.length === 300, 'note coupée à 300 caractères');
  // mêmes résultats que les règles du site (création)
  const drafts: any[] = [
    { supplier_id: 'su-1', date: '2026-10-21', expected_date: '2026-10-28', note: 'x', lines: [{ product_id: 'p-1', qty: '10', unit_cost: '500' }, { product_id: 'p-2', qty: '4,5', unit_cost: '' }] },
    { supplier_id: 'su-1', date: '2026-10-21', lines: [{ product_id: 'p-1', qty: 1, unit_cost: 1 }] },
    { supplier_id: 'su-1', date: '2026-10-21', lines: [{ product_id: 'p-1', qty: 1, unit_cost: 1 }, { product_id: 'p-1', qty: 1, unit_cost: 1 }] },
    { supplier_id: 'su-1', date: '2026-10-21', expected_date: '2026-10-01', lines: [{ product_id: 'p-1', qty: 1, unit_cost: 1 }] },
    { supplier_id: 'su-1', date: '2026-10-21', lines: [] },
  ];
  const same = drafts.every((d) => {
    const c = checkPurchaseDraft(d);
    const s = cleanPurchase({ id: 'po', ref: 'BC-0001', status: 'draft', supplier_id: d.supplier_id, date: d.date, expected_date: d.expected_date, note: d.note, lines: d.lines.map((l: any) => ({ product_id: l.product_id, qty: l.qty, unit_cost_ar: l.unit_cost, received_qty: 0 })) }, undefined, 'a', NOW);
    return c.ok === s.ok && (!c.ok || J(c.clean.lines) === J(s.save.lines));
  });
  ok(same, `bon : mêmes lignes et mêmes refus que les règles du site sur ${drafts.length} cas`);
}

// ---------- bons de commande : états ----------
const ordered = (lines = [L('p-1', 10, 500), L('p-2', 4, 1200)], extra: any = {}) => ({ ...clone(goodP), status: 'ordered', lines, created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z', ...extra });
{
  const tr = (existing: any, patch: any, expectOk: boolean, name: string, reason?: string) => { const r = cleanPurchase({ ...clone(existing), ...patch }, clone(existing), 'a', LATER); ok(r.ok === expectOk && (expectOk || r.reason === reason || reason === undefined), name + (r.ok ? '' : ` (${r.reason})`)); return r; };
  const draft = { ...clone(goodP), status: 'draft', created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z' };
  tr(draft, { status: 'ordered' }, true, 'brouillon → commandé accepté');
  tr(draft, { status: 'cancelled' }, true, 'brouillon → annulé accepté');
  tr(draft, { status: 'received', lines: [L('p-1', 10, 500, 10), L('p-2', 4.5, 1200, 4.5)] }, false, 'brouillon → reçu refusé', 'status');
  tr(draft, { lines: [L('p-9', 3, 100)], note: 'modifié' }, true, 'brouillon : lignes et note modifiables');
  tr(draft, { supplier_id: 'su-2', date: '2026-10-22' }, true, 'brouillon : fournisseur et date modifiables');
  const o = ordered();
  tr(o, { lines: [L('p-1', 10, 500, 4), L('p-2', 4, 1200)] }, true, 'commandé : réception partielle acceptée (reste « commandé »)');
  tr(o, { lines: [L('p-1', 10, 500, 4), L('p-2', 4, 1200)], status: 'received' }, false, 'commandé : « reçu » refusé tant que tout n\'est pas reçu', 'status');
  tr(o, { lines: [L('p-1', 10, 500, 10), L('p-2', 4, 1200, 4)], status: 'received' }, true, 'commandé : tout reçu → « reçu » accepté');
  tr(o, { lines: [L('p-1', 10, 500, 10), L('p-2', 4, 1200, 4)] }, false, 'commandé : tout reçu mais encore « commandé » refusé', 'status');
  tr(o, { status: 'draft' }, false, 'commandé → brouillon refusé', 'status');
  tr(o, { status: 'cancelled' }, true, 'commandé sans réception → annulé accepté');
  tr(ordered([L('p-1', 10, 500, 3), L('p-2', 4, 1200)]), { status: 'cancelled' }, false, 'commandé avec réception → annulé refusé', 'received');
  tr(o, { lines: [L('p-1', 11, 500), L('p-2', 4, 1200)] }, false, 'commandé : quantité commandée figée', 'frozen');
  tr(o, { lines: [L('p-3', 10, 500), L('p-2', 4, 1200)] }, false, 'commandé : produit figé', 'frozen');
  tr(o, { lines: [L('p-1', 10, 500)] }, false, 'commandé : ligne retirée refusée', 'frozen');
  tr(o, { lines: [L('p-1', 10, 500), L('p-2', 4, 1200), L('p-3', 1, 1)] }, false, 'commandé : ligne ajoutée refusée', 'frozen');
  tr(o, { supplier_id: 'su-2' }, false, 'commandé : fournisseur figé', 'frozen');
  tr(o, { date: '2026-10-22' }, false, 'commandé : date figée', 'frozen');
  tr(o, { expected_date: '2026-11-15' }, true, 'commandé : livraison prévue modifiable');
  tr(o, { lines: [L('p-1', 10, 650), L('p-2', 4, 1200)] }, true, 'commandé : prix d\'une ligne pas encore reçue modifiable');
  const part = ordered([L('p-1', 10, 500, 4), L('p-2', 4, 1200)]);
  tr(part, { lines: [L('p-1', 10, 650, 4), L('p-2', 4, 1200)] }, false, 'commandé : prix d\'une ligne déjà reçue figé', 'frozen');
  tr(part, { lines: [L('p-1', 10, 500, 3), L('p-2', 4, 1200)] }, false, 'commandé : la quantité reçue ne recule jamais', 'received');
  tr(part, { lines: [L('p-1', 10, 500, 7), L('p-2', 4, 1200, 1)] }, true, 'commandé : la quantité reçue avance');
  tr(o, { ref: 'BC-0002' }, false, 'numéro de bon figé', 'ref');
  // définitifs
  const rec = { ...clone(goodP), status: 'received', lines: [L('p-1', 10, 500, 10), L('p-2', 4.5, 1200, 4.5)], created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z' };
  tr(rec, { note: 'vérifié' }, true, 'reçu : la note reste modifiable');
  tr(rec, { status: 'ordered' }, false, 'reçu → commandé refusé', 'final');
  tr(rec, { lines: [L('p-1', 10, 999, 10), L('p-2', 4.5, 1200, 4.5)] }, false, 'reçu : lignes figées', 'final');
  tr(rec, { date: '2026-10-25' }, false, 'reçu : date figée', 'final');
  const can = { ...clone(goodP), status: 'cancelled', created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z' };
  tr(can, { note: 'erreur de saisie' }, true, 'annulé : la note reste modifiable');
  tr(can, { status: 'draft' }, false, 'annulé → brouillon refusé', 'final');
  tr(can, { status: 'ordered' }, false, 'annulé → commandé refusé', 'final');
  ok(cleanPurchase(mk({ note: 'x' }), clone(draft), 'a', LATER).save.created_at === '2026-10-01T00:00:00.000Z', 'modification : date de création conservée');

  // les règles du site (canTransition, planReceipt) donnent le même verdict que le serveur
  const poOf = (x: any): PurchaseOrder => ({ ...x }) as PurchaseOrder;
  const cmp: [any, string][] = [[draft, 'ordered'], [draft, 'cancelled'], [draft, 'received'], [o, 'cancelled'], [o, 'received'], [o, 'draft'], [part, 'cancelled'], [rec, 'ordered'], [can, 'ordered']];
  const agree = cmp.every(([ex, to]) => {
    const lines = to === 'received' ? ex.lines.map((l: any) => ({ ...l, received_qty: l.qty })) : ex.lines;
    const server = cleanPurchase({ ...clone(ex), status: to, lines: clone(lines) }, clone(ex), 'a', LATER).ok;
    const site = canTransition(poOf(ex), to as any);
    return to === 'received' ? true : server === site; // « reçu » ne passe que par une réception (testé plus bas)
  });
  ok(agree, `états : mêmes verdicts que les règles du site (canTransition) sur ${cmp.length} cas`);
  const recv: { po: any; got: Record<string, number> }[] = [
    { po: o, got: { 'p-1': 10, 'p-2': 4 } }, { po: o, got: { 'p-1': 3 } }, { po: part, got: { 'p-1': 6, 'p-2': 4 } }, { po: part, got: { 'p-2': 1.5 } },
  ];
  const planOk = recv.every(({ po, got }) => {
    const r = planReceipt(poOf(po), got);
    if (!r.ok) return false;
    const s = cleanPurchase({ ...clone(po), lines: clone(r.plan.lines), status: r.plan.status }, clone(po), 'a', LATER);
    return s.ok && s.save.status === r.plan.status && J(s.save.lines) === J(r.plan.lines);
  });
  ok(planOk, `réception : le plan du site (${recv.length} cas) est toujours accepté par le serveur, même état et mêmes lignes`);
  ok(!cleanPurchase({ ...clone(o), lines: [L('p-1', 10, 500, 10), L('p-2', 4, 1200, 4)], status: 'ordered' }, clone(o), 'a', LATER).ok, 'une réception complète qui laisse l\'état « commandé » est refusée');
}

// ---------- budgets ----------
{
  const cb = (i: any, fb: any = { Loyer: 1 }) => cleanBudgets(i, fb);
  ok(J(cb({ Loyer: 500000, Achats: '1 200 000', Internet: '' })) === J({ Loyer: 500000, Achats: 1200000 }), 'budgets valides gardés, valeur vide retirée');
  ok(J(cb({ Loyer: 0 })) === J({}), 'budget 0 = plafond retiré');
  ok(J(cb({ Loyer: -5 })) === J({ Loyer: 1 }), 'budget négatif refusé : l\'existant est gardé');
  ok(J(cb({ Loyer: 'abc' })) === J({ Loyer: 1 }) && J(cb({ Loyer: [5] })) === J({ Loyer: 1 }) && J(cb({ Loyer: true })) === J({ Loyer: 1 }) && J(cb({ Loyer: 2e12 })) === J({ Loyer: 1 }), 'budget illisible, tableau, booléen, énorme : l\'existant est gardé');
  ok(J(cb('x')) === J({ Loyer: 1 }) && J(cb([1])) === J({ Loyer: 1 }) && J(cb(null)) === J({ Loyer: 1 }), 'budgets qui ne sont pas un objet : l\'existant est gardé');
  ok(J(cb(JSON.parse('{"__proto__":{"x":1}}'))) === J({ Loyer: 1 }) && J(cb({ constructor: 5 })) === J({ Loyer: 1 }), 'noms dangereux refusés');
  ok(!(({}) as any).x && J(cb(Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`c${i}`, 1])))) === J({ Loyer: 1 }), '31 catégories refusées');
  ok(J(cb({ Loyer: 100 })) === J({ Loyer: 100 }) && cb({ Loyer: 100.6 }).Loyer === 101, 'montant arrondi à l\'Ar');
  const inputs: any[] = [{ Loyer: 500000, Achats: '1 200 000' }, { Loyer: '', Achats: 5 }, { ['A'.repeat(60)]: 7 }, { Loyer: '1,5' }, {}];
  const same = inputs.every((i) => { const c = checkBudgets(i); return c.ok && J(cleanBudgets(i, {})) === J(c.clean); });
  ok(same, `budgets : mêmes résultats que les règles du site sur ${inputs.length} cas`);
  const saved = { id: 'general', price_per_mission: 1000 };
  ok(J(applyBudgets(clone(saved), { budgets: { Loyer: 5 } }, { budgets: { Loyer: 1 } }).budgets) === J({ Loyer: 5 }), 'réglages : budgets nouveaux écrits');
  ok(J(applyBudgets(clone(saved), {}, { budgets: { Loyer: 1 } }).budgets) === J({ Loyer: 1 }), 'réglages : un ancien site qui n\'envoie pas « budgets » ne les efface pas');
  ok(!('budgets' in applyBudgets(clone(saved), { budgets: {} }, { budgets: { Loyer: 1 } })), 'réglages : budgets vidés = champ retiré');
  ok(J(applyBudgets(clone(saved), { budgets: { Loyer: -1 } }, { budgets: { Loyer: 1 } }).budgets) === J({ Loyer: 1 }), 'réglages : budgets faux refusés, l\'existant est gardé');
  ok(applyBudgets({ id: 'general', budgets: { pirate: 9 } }, {}, undefined).budgets === undefined, 'réglages : des budgets glissés dans l\'enregistrement sans passer par la vérification ne sont pas gardés');
}

// ---------- liens sur les dépenses et les mouvements de stock ----------
{
  const move = { id: 'mv-1', product_id: 'p-1', type: 'in', qty: 10, date: '2026-10-21', note: '', unit_cost_ar: 500, supplier_id: 'su-1', po_id: 'po-1' };
  const m = cleanStockMove(move, undefined, 'a', NOW);
  ok(m.ok && m.save.supplier_id === 'su-1' && m.save.po_id === 'po-1', 'entrée de stock : fournisseur et bon de commande gardés');
  ok(!('supplier_id' in cleanStockMove({ ...move, supplier_id: 5 }, undefined, 'a', NOW).save) && !('po_id' in cleanStockMove({ ...move, po_id: ['x'] }, undefined, 'a', NOW).save), 'entrée de stock : lien qui n\'est pas un texte ignoré');
  ok(cleanStockMove({ ...move, supplier_id: 's'.repeat(200) }, undefined, 'a', NOW).save.supplier_id.length === 80, 'lien coupé à 80 caractères');
  const adj = { id: 'mv-2', product_id: 'p-1', type: 'adjust', qty: -2, date: '2026-10-21', note: 'Inventaire', reason: 'inventory', counted_qty: 8, expected_qty: 10 };
  const a = cleanStockMove(adj, undefined, 'a', NOW);
  ok(a.ok && a.save.reason === 'inventory' && a.save.counted_qty === 8 && a.save.expected_qty === 10, 'ajustement d\'inventaire : quantité comptée et attendue gardées');
  ok(cleanStockMove({ ...adj, type: 'in', qty: 2 }, undefined, 'a', NOW).reason === 'reason' && cleanStockMove({ ...adj, type: 'out', qty: 2 }, undefined, 'a', NOW).reason === 'reason', 'raison « inventaire » refusée sur une entrée ou une sortie');
  ok(cleanStockMove({ ...adj, reason: 'vol' }, undefined, 'a', NOW).reason === 'reason', 'raison inconnue refusée');
  ok(cleanStockMove({ ...adj, counted_qty: undefined }, undefined, 'a', NOW).reason === 'count' && cleanStockMove({ ...adj, expected_qty: -1 }, undefined, 'a', NOW).reason === 'count' && cleanStockMove({ ...adj, counted_qty: 'abc' }, undefined, 'a', NOW).reason === 'count' && cleanStockMove({ ...adj, counted_qty: true }, undefined, 'a', NOW).reason === 'count' && cleanStockMove({ ...adj, expected_qty: 2e9 }, undefined, 'a', NOW).reason === 'count', 'inventaire : quantités comptée et attendue obligatoires, valides');
  const plain = cleanStockMove({ id: 'mv-3', product_id: 'p-1', type: 'adjust', qty: 1, date: '2026-10-21', note: 'x' }, undefined, 'a', NOW);
  ok(plain.ok && !('reason' in plain.save) && !('counted_qty' in plain.save), 'ajustement ordinaire : inchangé, sans champs d\'inventaire');
  ok(!('reason' in cleanStockMove({ ...adj, reason: '' }, undefined, 'a', NOW).save) || !cleanStockMove({ ...adj, reason: '' }, undefined, 'a', NOW).ok === false, 'raison vide = comme absente');
  const cash = { id: 'c-1', kind: 'out', category: 'Achats', amount_ar: 5000, date: '2026-10-21', note: 'BC-0001', supplier_id: 'su-1', po_id: 'po-1' };
  const c = cleanCash(cash, undefined, 'a', NOW);
  ok(c.ok && c.save.supplier_id === 'su-1' && c.save.po_id === 'po-1', 'dépense : fournisseur et bon de commande gardés');
  ok(!('supplier_id' in cleanCash({ ...cash, supplier_id: { a: 1 } }, undefined, 'a', NOW).save) && cleanCash({ ...cash, po_id: 'p'.repeat(150) }, undefined, 'a', NOW).save.po_id.length === 80, 'dépense : lien non texte ignoré, trop long coupé');
}

// ---------- lecture du code du serveur ----------
{
  const T = /const T = \{([\s\S]*?)\} as const;/.exec(src)![1];
  const order = [...T.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
  ok(order.indexOf('suppliers') >= 0 && order.indexOf('suppliers') < order.indexOf('cash') && order.indexOf('suppliers') < order.indexOf('stock') && order.indexOf('suppliers') < order.indexOf('purchases'), 'ordre de traitement : les fournisseurs avant les dépenses, le stock et les bons');
  ok(order.indexOf('products') >= 0 && order.indexOf('products') < order.indexOf('purchases') && order.indexOf('purchases') > order.indexOf('stock'), 'ordre de traitement : les produits avant les bons de commande');
  ok(/suppliers: "df_suppliers"/.test(T) && /purchases: "df_purchase_orders"/.test(T), 'tables df_suppliers et df_purchase_orders déclarées');
  const syncFn = src.slice(src.indexOf('async function sync('));
  const nonAdmin = syncFn.slice(syncFn.indexOf("if (!admin && ADMIN_ONLY_WRITE.includes(col) && !canWriteMoneyCol(me.role, col))"), syncFn.indexOf('for (const rec of upserts)'));
  ok(nonAdmin.includes("reason: 'forbidden'") && nonAdmin.includes('continue;'), 'sync : un employé ne peut rien écrire ni supprimer dans les collections réservées (dont fournisseurs et bons)');
  const stateFn = src.slice(src.indexOf('async function state('), src.indexOf('async function sync('));
  ok(stateFn.includes('!canReadCol(me.role, col)') && stateFn.includes('changed: []'), 'state : ces collections ne sont jamais envoyées à un employé');
  ok(syncFn.includes("if (col === 'suppliers') {\n        const v = cleanSupplier(rec, existing, me.id, now);"), 'sync : chaque fournisseur passe par cleanSupplier');
  ok(syncFn.includes('cleanPurchase(rec, existing, me.id, now)') && syncFn.includes("reason: 'supplier'") && syncFn.includes("reason: 'product'"), 'sync : chaque bon passe par cleanPurchase, avec contrôle du fournisseur et des produits');
  ok(/v\.save\.supplier_id\)[\s\S]{0,200}T\.suppliers[\s\S]{0,200}reason: 'supplier'/.test(syncFn) && /v\.save\.po_id\)[\s\S]{0,200}T\.purchases[\s\S]{0,200}reason: 'po'/.test(syncFn), 'sync : le fournisseur et le bon cités par une dépense ou un mouvement de stock doivent exister');
  ok(syncFn.includes("applyBudgets(toSave, rec, existing)"), 'sync : les budgets des réglages sont revérifiés');
  ok(/col === 'suppliers'[\s\S]{0,400}T\.purchases, T\.stock, T\.cash[\s\S]{0,300}in_use/.test(syncFn), 'suppression : un fournisseur qui a servi (bon, stock, dépense) est refusé (on l\'archive)');
  ok(/col === 'purchases'[\s\S]{0,300}status !== 'draft' && prow\.data\.status !== 'cancelled'[\s\S]{0,120}reason: 'status'/.test(syncFn), 'suppression : seuls un brouillon et un bon annulé se suppriment');
  ok(/col === 'products'[\s\S]{0,300}\['draft', 'ordered'\][\s\S]{0,300}in_use/.test(syncFn), 'suppression : un produit cité par un bon en cours est refusé');
}

// ---------- migration ----------
{
  const sql = read('supabase/migrations/20261021_create_df_suppliers_purchases.sql');
  for (const t of ['df_suppliers', 'df_purchase_orders']) {
    ok(sql.includes(`create table if not exists public.${t}`), `migration : table ${t} créée`);
    ok(sql.includes(`alter table public.${t} enable row level security`), `migration : ${t} protégée (RLS)`);
    ok(sql.includes(`revoke all on public.${t} from anon, authenticated`), `migration : ${t} sans accès public`);
  }
  ok(!/grant .* to (anon|authenticated)/i.test(sql) && /drop table public\.df_purchase_orders; drop table public\.df_suppliers/.test(sql), 'migration : aucun accès accordé au public, retour en arrière documenté');
}

console.log(`\n${n - fails}/${n} contrôles ${fails ? 'ECHEC(S) : ' + fails : 'réussis'}`);
process.exit(fails ? 1 : 0);
