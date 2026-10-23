// Contrôle du serveur de facturation (M2.4), sans réseau : les vraies fonctions sont extraites de df-api/index.ts et comparées aux règles du site.
// Lancer : npm run check:invoices-server
import fs from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { checkInvoiceDraft, formatNumber, parseNumber } from '../src/utils/invoices';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => fs.readFileSync(join(process.cwd(), p), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
const blk = (name: string) => { const m = new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`).exec(src); if (!m) throw new Error(`bloc ${name} introuvable`); return transformSync(m[1], { loader: 'ts' }).code; };
const cashJs = blk('CASH');
const lists = new Function(`${cashJs.replace(/function cleanCash[\s\S]*$/, '')}\nreturn { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE };`)() as { ADMIN_ONLY_READ: string[]; ADMIN_ONLY_WRITE: string[] };
const srv = new Function(`${blk('INVOICES')}\nreturn { cleanInvoice, invoiceIssuePatch, invoiceErrorOf, invTotals, invAddDays, INVOICE_ERRORS };`)() as any;
const NOW = '2026-10-21T08:00:00.000Z';
const company = (vat = false, rate = 0) => ({ tax: { vat_enabled: vat, vat_rate: rate } });

// ---------- 1) Concordance avec les règles du site : 300 factures au hasard ----------
let seed = 424242; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
let same = true, sameTotals = true, mismatch = '';
for (let i = 0; i < 300; i++) {
  const vat = rnd() > 0.4, rate = Math.round(rnd() * 3000) / 100;
  const lines = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, k) => ({ description: `Ligne ${k}`, qty: Math.round(rnd() * 5000) / 100 + 0.01, unit_price: Math.floor(rnd() * 90000) + 1, refs: rnd() > 0.5 ? [`s${i}-${k}`, `s${i}-${k}`] : undefined }));
  const draft = { client_id: 'c1', issue_date: '2026-10-20', due_date: '2026-11-19', lines, vat_enabled: vat, vat_rate: rate, note: 'n' };
  const a = checkInvoiceDraft(draft as any);
  const b = srv.cleanInvoice({ id: 'i', client_id: 'c1', issue_date: draft.issue_date, due_date: draft.due_date, note: 'n', lines: lines.map(l => ({ description: l.description, qty: l.qty, unit_price_ar: l.unit_price, refs: l.refs })) }, undefined, 'a', NOW, company(vat, rate));
  if (a.ok !== b.ok) { same = false; mismatch = `ok ${a.ok}/${b.ok}`; continue; }
  if (a.ok && b.ok) {
    const s2 = b.save;
    if (JSON.stringify(a.clean.lines) !== JSON.stringify(s2.lines)) { same = false; mismatch = 'lignes'; }
    if (a.clean.subtotal_ar !== s2.subtotal_ar || a.clean.tax_ar !== s2.tax_ar || a.clean.total_ar !== s2.total_ar || a.clean.tax_rate !== s2.tax_rate) { sameTotals = false; mismatch = `totaux ${a.clean.total_ar}/${s2.total_ar}`; }
  }
}
ok(same, `300 factures : lignes identiques (id, quantité, prix, total, références) entre le site et le serveur ${mismatch}`);
ok(sameTotals, `300 factures : sous-total, TVA et total identiques entre le site et le serveur ${mismatch}`);

// Mêmes refus, mêmes raisons
const base = { id: 'i', client_id: 'c1', issue_date: '2026-10-20', due_date: '2026-11-19' };
const L = (o: any = {}) => ({ description: 'x', qty: 1, unit_price_ar: 100, ...o });
const bad = (patch: any) => { const r = srv.cleanInvoice({ ...base, lines: [L()], ...patch }, undefined, 'a', NOW, company()); return r.ok ? 'ok' : r.reason; };
ok(bad({ client_id: ' ' }) === 'client' && bad({ client_id: undefined }) === 'client', 'client absent : refusé');
ok(bad({ issue_date: '2026-02-31' }) === 'issue_date' && bad({ due_date: '20/11/2026' }) === 'due_date' && bad({ due_date: '2026-10-19' }) === 'due_before', 'dates fausses ou échéance avant l\'émission : refusées');
ok(bad({ lines: [] }) === 'lines' && bad({ lines: undefined }) === 'lines' && bad({ lines: 'x' }) === 'lines', '0 ligne ou lignes absentes : refusé');
ok(bad({ lines: Array.from({ length: 201 }, () => L()) }) === 'too_many_lines' && bad({ lines: Array.from({ length: 200 }, () => L()) }) === 'ok', 'plus de 200 lignes refusé, 200 accepté');
ok(bad({ lines: [L({ description: ' ' })] }) === 'description' && bad({ lines: [L({ qty: 0 })] }) === 'qty' && bad({ lines: [L({ qty: -1 })] }) === 'qty' && bad({ lines: [L({ qty: 'abc' })] }) === 'qty' && bad({ lines: [L({ qty: 1e7 })] }) === 'qty', 'description vide, quantité 0, négative, texte ou démesurée : refusées');
ok(bad({ lines: [L({ unit_price_ar: -1 })] }) === 'price' && bad({ lines: [L({ unit_price_ar: 'x' })] }) === 'price' && bad({ lines: [L({ unit_price_ar: 2e11 })] }) === 'price' && bad({ lines: [L({ unit_price_ar: 0 })] }) === 'total', 'prix négatif, texte, démesuré refusés ; total à 0 Ar refusé');
ok(bad({ lines: [L({ qty: 1_000_000, unit_price_ar: 1_000_000 })] }) === 'total', 'ligne au-dessus du plafond : refusée');
ok(!srv.cleanInvoice(null, undefined, 'a', NOW, company()).ok && !srv.cleanInvoice('x', undefined, 'a', NOW, company()).ok && srv.cleanInvoice(undefined, undefined, 'a', NOW, company()).reason === 'invoice', 'données absentes ou pas un objet : refusées sans erreur');
ok(srv.cleanInvoice({ ...base, lines: [L({ unit_price_ar: '12 000,4', qty: '1,5' })] }, undefined, 'a', NOW, company()).save.lines[0].total_ar === 18000, 'prix et quantité écrits « 12 000,4 » et « 1,5 » compris (18 000)');

// ---------- 2) Ce que le navigateur ne peut pas imposer ----------
const forged = srv.cleanInvoice({ ...base, status: 'issued', type: 'credit_note', number: 'FA-2026-0001', total_ar: 1, subtotal_ar: 1, tax_ar: 999999, tax_rate: 55, client: { name: 'Faux' }, issuer: { name: 'Faux' }, credit_of: 'x', cancelled_by: 'y', issued_at: '2026-01-01', password_hash: 'z', lines: [{ ...L({ qty: 2, unit_price_ar: 500 }), total_ar: 1 }] }, undefined, 'admin-1', NOW, company(false, 0));
const fs2 = forged.save;
ok(forged.ok && fs2.status === 'draft' && fs2.type === 'invoice' && !('number' in fs2) && !('issued_at' in fs2) && !('client' in fs2) && !('issuer' in fs2) && !('credit_of' in fs2) && !('cancelled_by' in fs2) && !('password_hash' in fs2), 'brouillon : statut « draft » et type « invoice » forcés ; numéro, date d\'émission, copies, avoir et champs inconnus jamais copiés');
ok(fs2.total_ar === 1000 && fs2.subtotal_ar === 1000 && fs2.tax_ar === 0 && fs2.tax_rate === 0 && fs2.lines[0].total_ar === 1000, 'totaux recalculés par le serveur : le « total 1 » et la « TVA 999 999 » envoyés sont ignorés');
const vatOn = srv.cleanInvoice({ ...base, tax_rate: 0, lines: [L({ qty: 10, unit_price_ar: 10000 })] }, undefined, 'a', NOW, company(true, 20)).save;
ok(vatOn.tax_rate === 20 && vatOn.tax_ar === 20000 && vatOn.total_ar === 120000, 'la TVA vient des Conditions (20 %), pas du navigateur');
ok(srv.cleanInvoice({ ...base, lines: [L({ qty: 10, unit_price_ar: 10000 })] }, undefined, 'a', NOW, undefined).save.tax_ar === 0, 'réglages d\'entreprise absents : pas de TVA, sans erreur');
const kept = srv.cleanInvoice({ ...base, lines: [L()] }, { created_by: 'admin-0', created_at: '2026-01-01T00:00:00.000Z' }, 'admin-1', NOW, company()).save;
ok(kept.created_by === 'admin-0' && kept.created_at === '2026-01-01T00:00:00.000Z' && kept.updated_at === NOW, 'modification d\'un brouillon : créateur et date de création conservés');
ok(srv.cleanInvoice({ ...base, lines: [{ ...L(), refs: ['a', 'a', 'b', '', 7] }] }, undefined, 'a', NOW, company()).save.lines[0].refs.join() === 'a,b,7', 'références de missions : sans doublon ni valeur vide');
ok(srv.cleanInvoice({ ...base, note: 'n'.repeat(900), lines: [L({ description: 'd'.repeat(500) })] }, undefined, 'a', NOW, company()).save.note.length === 500 && srv.cleanInvoice({ ...base, lines: [L({ description: 'd'.repeat(500) })] }, undefined, 'a', NOW, company()).save.lines[0].description.length === 200, 'textes trop longs coupés (note 500, description 200)');

// ---------- 3) Émission : ce que le serveur écrit ----------
const draftRec = srv.cleanInvoice({ ...base, issue_date: '2026-10-01', due_date: '2026-10-16', lines: [L({ qty: 10, unit_price_ar: 10000, refs: ['s1'] })] }, undefined, 'a', NOW, company()).save;
const co = { identity: { name: 'Ma Société', address: 'Antananarivo', phone: '034', email: 'a@b.mg', logo_url: '', currency: 'Ar' }, legal: { tax_id: 'NIF 1', register_id: 'STAT 2', notes: ['Note 1'] }, tax: { vat_enabled: true, vat_rate: 20, vat_exempt_text: '' }, billing: { invoice_prefix: 'FA-', receipt_prefix: 'RC-', payment_days: 30, late_penalty_text: 'Pénalité 1 %', payment_methods_text: 'Virement', invoice_footer: 'Merci' }, texts: { customer_terms: 'CGV' } };
const patch = srv.invoiceIssuePatch(draftRec, { name: 'Atelier', address: 'Tana', contact: 'Rado', email: 'r@a.mg', phone: '032', password_hash: 'zzz', payment_terms_days: 15 }, co, '2026-10-21');
ok(patch.issue_date === '2026-10-21' && patch.due_date === '2026-11-05', 'émission : date du jour, échéance de même durée que le brouillon (15 jours → 05/11)');
ok(patch.subtotal_ar === 100000 && patch.tax_rate === 20 && patch.tax_ar === 20000 && patch.total_ar === 120000, 'émission : totaux recalculés avec la TVA ACTUELLE des Conditions');
ok(patch.client.name === 'Atelier' && patch.client.contact_name === 'Rado' && patch.client.address === 'Tana' && !('password_hash' in patch.client) && Object.keys(patch.client).sort().join() === 'address,contact_name,email,name,phone', 'copie du client : seulement les champs utiles, rien d\'autre');
ok(patch.issuer.name === 'Ma Société' && patch.issuer.tax_id === 'NIF 1' && patch.issuer.register_id === 'STAT 2' && patch.issuer.late_penalty_text === 'Pénalité 1 %' && patch.issuer.footer === 'Merci' && patch.issuer.terms === 'CGV' && patch.issuer.notes[0] === 'Note 1', 'copie de l\'entreprise : identité, identifiants, pénalités, pied de facture, conditions');
ok(srv.invoiceIssuePatch({ ...draftRec, issue_date: '2026-10-21', due_date: '2026-10-20' }, {}, co, '2026-10-21').due_date === '2026-10-21', 'échéance avant l\'émission dans le brouillon : l\'échéance ne passe jamais avant l\'émission');
ok(srv.invoiceIssuePatch(draftRec, null, undefined, '2026-12-31').due_date === '2027-01-15' && srv.invoiceIssuePatch(draftRec, null, undefined, '2026-12-31').tax_ar === 0, 'fin d\'année : l\'échéance passe sur l\'année suivante ; sans réglages, pas de TVA');

// ---------- 4) Messages d'erreur des fonctions SQL ----------
const e = (m: string) => srv.invoiceErrorOf(m);
ok(e('too_much:60000').status === 409 && e('too_much:60000').max === 60000 && e('too_much:0').max === 0, 'paiement trop grand : 409 avec le maximum permis');
ok(e('changed').status === 409 && e('refs_taken').status === 409 && e('has_payments').status === 409 && e('not_issued').status === 409 && e('not_draft').status === 409, 'conflits : 409');
ok(e('invoice_missing').status === 404 && e('no_lines').status === 422 && e('no_total').status === 422 && e('bad_amount').status === 400, '404, 422 et 400 aux bons endroits');
ok(e('erreur inconnue de la base').status === 500 && !/erreur inconnue/.test(e('erreur inconnue de la base').error) && e('').status === 500 && e(undefined as any).status === 500, 'erreur inconnue : 500 et message neutre (rien de la base n\'est montré)');
ok(Object.values(srv.INVOICE_ERRORS).every((v: any) => /[a-zé]/.test(v[1]) && v[1].length > 15), 'tous les messages sont des phrases françaises complètes');

// ---------- 5) Branchement (lecture du code) ----------
ok(['invoices', 'cash', 'products', 'stock', 'clients'].every(c => lists.ADMIN_ONLY_READ.includes(c) && lists.ADMIN_ONLY_WRITE.includes(c)), 'lecture ET écriture de invoices réservées à l\'admin (avec cash, stock, clients)');
ok(/invoices: "df_invoices"/.test(src) && (src.match(/df_invoices/g) || []).length === 1, 'collection invoices déclarée ; aucune autre route ne lit df_invoices');
ok((src.match(/df_counters/g) || []).length === 0, 'la table des compteurs n\'est jamais lue ni écrite par le code du serveur : seulement par les fonctions SQL');
const syncFn = /async function sync\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(syncFn.includes("col === 'invoices'") && syncFn.includes('cleanInvoice(') && /existing\.status !== 'draft'/.test(syncFn) && /reason: 'locked'/.test(syncFn), 'sync : un brouillon passe par cleanInvoice ; une facture émise ou annulée est refusée (« locked »)');
ok(/df_invoice_ref_check/.test(syncFn) && /reason: 'refs_taken'/.test(syncFn) && /reason: 'refs_missing'/.test(syncFn) && /from\(T\.clients\)\.select\('id'\)\.eq\('id', v\.save\.client_id\)/.test(syncFn), 'sync : le client doit exister ; une mission déjà facturée ou non validée est refusée');
ok(/existing && \(existing\.invoice_id \|\| existing\.receipt_no\)\) \{ rejected\.push\(\{ col, id: rec\.id, reason: 'invoice_locked'/.test(syncFn) && /xd\.invoice_id \|\| xd\.receipt_no/.test(syncFn), 'sync : un paiement lié à une facture ne se modifie ni ne se supprime par la synchro (« invoice_locked »)');
ok(/\(col === 'invoices' && xd\.status !== 'draft'\)/.test(syncFn), 'sync : seul un brouillon se supprime ; une facture émise ne se supprime jamais');
ok(/usedI/.test(syncFn) && /T\.invoices\)\.select\('id'\)\.eq\('data->>client_id', id\)/.test(syncFn), 'sync : un client qui a des factures ne se supprime pas');
const gate = syncFn.indexOf('!admin && ADMIN_ONLY_WRITE.includes(col)');
ok(gate > 0 && gate < syncFn.indexOf('for (const rec of upserts)'), 'sync : refus d\'un employé AVANT toute règle de facturation');
for (const [action, fn] of [['invoice-issue', 'invoiceIssue'], ['invoice-cancel', 'invoiceCancel'], ['invoice-pay', 'invoicePay']]) {
  const route = new RegExp(`action === "${action}" && req\\.method === "POST"\\) return await ${fn}\\(req, res, me\\)`).test(src);
  const body = new RegExp(`async function ${fn}\\(req: any, res: any, me: any\\) \\{\\n  const no = moneyOnly\\(res, me\\); if \\(no\\) return no;`).test(src);
  ok(route && body, `route ${action} : enregistrée en POST, et le contrôle « admin ou Comptable » (moneyOnly) est la PREMIÈRE ligne`);
}
const issueFn = /async function invoiceIssue[\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(/company\.identity\.name/.test(issueFn) && /company_incomplete/.test(issueFn) && /p_expected: row\.updated_at/.test(issueFn) && /company\.billing\.invoice_prefix/.test(issueFn) && /cleanInvoice\(draft, draft/.test(issueFn) && /invoiceIssuePatch/.test(issueFn), 'émission : refusée sans nom d\'entreprise ; revérifie le brouillon ; protège contre une modification en parallèle ; préfixe lu dans les Conditions (jamais envoyé par le navigateur)');
const payFn = /async function invoicePay[\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(/company\.billing\.receipt_prefix/.test(payFn) && /amount !== Math\.trunc\(amount\)/.test(payFn) && /df_pay_invoice/.test(payFn) && !/p_prefix: String\(req/.test(payFn), 'paiement : montant entier contrôlé, préfixe du reçu lu dans les Conditions');
const cancelFn = /async function invoiceCancel[\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(/p_prefix: 'AV-'/.test(cancelFn) && /df_cancel_invoice/.test(cancelFn), 'avoir : préfixe AV-, fonction SQL atomique');
// Les noms des paramètres envoyés à la base = ceux déclarés dans la migration
const mig = read('supabase/migrations/20261021_create_df_invoices.sql');
const sqlParams = (fnName: string) => { const m = new RegExp(`function public\\.${fnName}\\(([^)]*)\\)`).exec(mig); return (m?.[1] || '').split(',').map(x => x.trim().split(/\s+/)[0]).filter(Boolean); };
const rpcKeys = (fnName: string) => {
  const start = src.indexOf(`rpc('${fnName}', {`);
  if (start < 0) return [];
  let depth = 0, i = src.indexOf('{', start), end = i;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } } }
  return [...src.slice(start, end).matchAll(/\b(p_[a-z_]+)\s*:/g)].map(m => m[1]); // les noms de paramètres, même si une valeur contient des virgules
};
for (const f of ['df_issue_invoice', 'df_cancel_invoice', 'df_pay_invoice', 'df_invoice_ref_check']) ok(sqlParams(f).length > 0 && sqlParams(f).join() === rpcKeys(f).join(), `${f} : les paramètres envoyés (${rpcKeys(f).join(', ')}) sont exactement ceux de la migration`);
ok(!/df_invoices|df_counters|df_invoice_|df_issue_invoice|df_pay_invoice|df_cancel_invoice/.test(read('supabase/functions/df-restore/index.ts')), 'df-restore : ne touche ni aux factures ni aux compteurs (la remise à zéro les garde)');
ok(parseNumber(formatNumber('FA-', 2026, 7))!.counter === 7, 'lecture d\'un numéro (site) : cohérente avec son écriture');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
