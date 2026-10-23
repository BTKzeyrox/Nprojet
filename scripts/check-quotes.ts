// Contrôle des DEVIS (module 2, M2.9), sans réseau : le serveur (bloc QUOTES de df-api/index.ts) est extrait et comparé aux règles du site (src/utils/quotes.ts).
// Lancer : npm run check:quotes
// Si quelqu'un affaiblit une protection (devis envoyé modifiable, devis accepté supprimable, accès d'un opérateur…), ce contrôle échoue.
import fs from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { canDeleteQuote, canInvoiceQuote, canQuoteTransition, checkQuoteDraft, nextQuoteRef, quoteToInvoiceDraft } from '../src/utils/quotes';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => fs.readFileSync(join(process.cwd(), p), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
const blk = (name: string) => { const m = new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`).exec(src); if (!m) throw new Error(`bloc ${name} introuvable`); return transformSync(m[1], { loader: 'ts' }).code; };
const cashJs = blk('CASH');
const lists = new Function(`${cashJs.replace(/function cleanCash[\s\S]*$/, '')}\nreturn { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE };`)() as { ADMIN_ONLY_READ: string[]; ADMIN_ONLY_WRITE: string[] };
const roles = new Function(`${blk('ROLES')}\nreturn { MONEY_COLS, canReadCol, canWriteMoneyCol };`)() as any;
const srv = new Function(`${blk('INVOICES')}\n${blk('QUOTES')}\nreturn { cleanQuote };`)() as any;
const { cleanQuote } = srv;
const NOW = '2026-10-23T08:00:00.000Z', LATER = '2026-10-24T08:00:00.000Z';
const company = (vat = false, rate = 0) => ({ tax: { vat_enabled: vat, vat_rate: rate } });
const J = (x: unknown) => JSON.stringify(x);

// ---------- droits ----------
ok(lists.ADMIN_ONLY_READ.includes('quotes') && lists.ADMIN_ONLY_WRITE.includes('quotes'), 'devis : jamais envoyés ni écrits par un opérateur');
ok(roles.MONEY_COLS.includes('quotes'), 'devis : collection d\'argent (admin et Comptable)');
ok(!roles.canReadCol('employee', 'quotes') && !roles.canReadCol('team_lead', 'quotes') && roles.canReadCol('accountant', 'quotes') && roles.canReadCol('admin', 'quotes'), 'lecture : admin et Comptable seulement');
ok(!roles.canWriteMoneyCol('employee', 'quotes') && !roles.canWriteMoneyCol('team_lead', 'quotes') && roles.canWriteMoneyCol('accountant', 'quotes'), 'écriture : opérateur et Chef d\'équipe refusés');
ok(/quotes: "df_quotes"/.test(src), 'table df_quotes déclarée');
const idxClients = src.indexOf('  clients:'), idxInv = src.indexOf('  invoices: "df_invoices"'), idxQ = src.indexOf('  quotes: "df_quotes"');
ok(idxQ > idxInv && idxInv > 0 && idxClients > 0 && idxQ > idxClients, 'ordre de synchro : les devis passent après les clients et les factures');

// ---------- concordance avec le site : 300 devis au hasard ----------
let seed = 20261023; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
let same = true, mismatch = '';
for (let i = 0; i < 300; i++) {
  const vat = rnd() > 0.4, rate = Math.round(rnd() * 3000) / 100;
  const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, k) => ({ description: `Ligne ${k}`, qty: Math.round(rnd() * 5000) / 100 + 0.01, unit_price: Math.floor(rnd() * 90000) + 1 }));
  const until = rnd() > 0.5 ? '2026-12-31' : '';
  const site = checkQuoteDraft({ client_id: 'c1', date: '2026-10-20', valid_until: until, lines, note: 'n', vat_enabled: vat, vat_rate: rate });
  const rec = { id: 'q1', ref: 'DV-0001', status: 'draft', client_id: 'c1', date: '2026-10-20', valid_until: until, note: 'n', lines: lines.map(l => ({ description: l.description, qty: l.qty, unit_price_ar: l.unit_price })) };
  const server = cleanQuote(rec, null, 'me', NOW, company(vat, rate));
  if (!site.ok || !server.ok || J(site.clean.lines) !== J(server.save.lines) || site.clean.total_ar !== server.save.total_ar || site.clean.tax_ar !== server.save.tax_ar || (site.clean.valid_until || '') !== (server.save.valid_until || '')) { same = false; mismatch = `${i}`; break; }
}
ok(same, `300 devis au hasard : le serveur et le site donnent les mêmes lignes, totaux, TVA et fin de validité ${mismatch}`);

// ---------- validations ----------
const base = (over: any = {}) => ({ id: 'q1', ref: 'DV-0001', status: 'draft', client_id: 'c1', date: '2026-10-20', note: '', lines: [{ description: 'Saisie', qty: 10, unit_price_ar: 1000 }], ...over });
const bad = (rec: any, ex: any = null) => { const r = cleanQuote(rec, ex, 'me', NOW, company()); return r.ok ? 'ok' : r.reason; };
ok(bad(base()) === 'ok' && bad(base({ status: 'sent' })) === 'ok', 'nouveau devis : brouillon ou envoyé accepté');
ok(bad(base({ status: 'accepted' })) === 'status' && bad(base({ status: 'refused' })) === 'status' && bad(base({ status: 'nope' })) === 'status', 'nouveau devis : jamais accepté ni refusé d\'emblée');
ok(bad(base({ ref: 'XX-1' })) === 'ref' && bad(base({ ref: '' })) === 'ref' && bad(base({ id: '' })) === 'id' && bad(null) === 'id', 'référence ou identifiant faux : refusé');
ok(bad(base({ client_id: '' })) === 'client' && bad(base({ date: '2026-13-40' })) === 'date' && bad(base({ valid_until: 'abc' })) === 'valid_until' && bad(base({ valid_until: '2026-10-01' })) === 'valid_before', 'client, date, fin de validité fausse ou avant le devis : refusés');
ok(bad(base({ lines: [] })) === 'lines' && bad(base({ lines: [{ description: '', qty: 1, unit_price_ar: 5 }] })) === 'description' && bad(base({ lines: [{ description: 'a', qty: 0, unit_price_ar: 5 }] })) === 'qty' && bad(base({ lines: [{ description: 'a', qty: 1, unit_price_ar: -5 }] })) === 'price' && bad(base({ lines: [{ description: 'a', qty: 1, unit_price_ar: 0 }] })) === 'total', 'sans ligne, description vide, quantité 0, prix négatif, total 0 : refusés');
ok(bad(base({ invoice_id: 'inv1' })) === 'invoice', 'un nouveau devis n\'a pas encore de facture');
{
  const r = cleanQuote(base({ total_ar: 1, subtotal_ar: 1, tax_ar: 1000000, created_by: 'pirate', created_at: '2000-01-01' }), null, 'me', NOW, company());
  ok(r.ok && r.save.total_ar === 10000 && r.save.tax_ar === 0 && r.save.created_by === 'me' && r.save.created_at === NOW, 'totaux et créateur envoyés par le navigateur : ignorés (recalculés)');
}

// ---------- états ----------
const draft = cleanQuote(base(), null, 'me', NOW, company()).save;
const sent = { ...draft, status: 'sent' };
const acc = { ...draft, status: 'accepted' };
const ref = { ...draft, status: 'refused' };
const as = (ex: any, over: any) => bad({ ...ex, ...over }, ex);
ok(as(draft, { status: 'sent' }) === 'ok' && as(draft, { status: 'draft', note: 'x' }) === 'ok' && as(draft, { status: 'accepted' }) === 'status' && as(draft, { status: 'refused' }) === 'status', 'brouillon : devient envoyé seulement');
ok(as(draft, { lines: [{ description: 'Autre', qty: 1, unit_price_ar: 9 }] }) === 'ok', 'brouillon : les lignes se modifient');
ok(as(sent, { status: 'accepted' }) === 'ok' && as(sent, { status: 'refused' }) === 'ok' && as(sent, { status: 'draft' }) === 'status', 'envoyé : accepté ou refusé, jamais de retour au brouillon');
ok(as(sent, { lines: [{ description: 'Autre', qty: 1, unit_price_ar: 9 }] }) === 'frozen' && as(sent, { client_id: 'c2' }) === 'frozen' && as(sent, { date: '2026-10-21' }) === 'frozen' && as(sent, { valid_until: '2026-12-01' }) === 'frozen', 'envoyé : lignes, client, date et validité figés');
ok(as(sent, { note: 'relancé' }) === 'ok', 'envoyé : la note peut encore changer');
ok(as(acc, { status: 'refused' }) === 'final' && as(acc, { status: 'sent' }) === 'final' && as(ref, { status: 'accepted' }) === 'final', 'accepté et refusé : définitifs');
ok(as(acc, { invoice_id: 'inv1' }) === 'ok' && as({ ...acc, invoice_id: 'inv1' }, { invoice_id: '' }) === 'ok', 'accepté : lien vers la facture posé puis retirable (facture brouillon supprimée)');
ok(as(sent, { invoice_id: 'inv1' }) === 'invoice' && as(ref, { invoice_id: 'inv1' }) === 'invoice', 'seul un devis accepté peut citer une facture');
{
  const r = cleanQuote({ ...sent, lines: [{ description: 'Saisie', qty: 10, unit_price_ar: 1000 }] }, sent, 'me', LATER, company(true, 20));
  ok(r.ok && r.save.total_ar === sent.total_ar && r.save.tax_ar === sent.tax_ar, 'envoyé : si la TVA change ensuite, les totaux d\'origine restent');
}
ok(cleanQuote(base(), draft, 'me', LATER, company()).save.created_at === NOW && cleanQuote(base(), draft, 'attacker', LATER, company()).save.created_by === 'me', 'création gardée : créateur et date d\'origine');

// ---------- concordance des états avec le site ----------
const states = ['draft', 'sent', 'accepted', 'refused'] as const;
let tr = true;
for (const from of states) for (const to of states) {
  const siteOk = canQuoteTransition({ status: from }, to);
  const r = from === 'draft' ? bad({ ...draft, status: to }, draft) : bad({ ...{ ...draft, status: from }, status: to }, { ...draft, status: from });
  const srvOk = r === 'ok' && from !== to; // un changement d'état réel
  if (from !== to && siteOk !== srvOk) { tr = false; console.log(`   écart ${from} → ${to} : site=${siteOk} serveur=${r}`); }
}
ok(tr, 'les 12 changements d\'état : le site et le serveur sont d\'accord');
ok(canDeleteQuote({ status: 'draft' }) && canDeleteQuote({ status: 'refused' }) && !canDeleteQuote({ status: 'sent' }) && !canDeleteQuote({ status: 'accepted' }) && !canDeleteQuote({ status: 'refused', invoice_id: 'x' }), 'suppression : brouillon et refusé seulement, jamais facturé');
ok(canInvoiceQuote({ status: 'accepted' }) && !canInvoiceQuote({ status: 'accepted', invoice_id: 'x' }) && !canInvoiceQuote({ status: 'sent' }) && !canInvoiceQuote({ status: 'refused' }), 'facture : seulement un devis accepté pas encore facturé');
ok(nextQuoteRef([]) === 'DV-0001' && nextQuoteRef([{ ref: 'DV-0009' }, { ref: 'DV-0002' }, { ref: 'zz' }]) === 'DV-0010', 'numéros : DV-0001 puis le plus grand + 1');
{
  const d = quoteToInvoiceDraft({ client_id: 'c1', ref: 'DV-0003', note: 'ok', lines: [{ id: 'l1', description: 'A', qty: 2, unit_price_ar: 500, total_ar: 1000 }] }, '2026-10-23', 30);
  ok(d.issue_date === '2026-10-23' && d.due_date === '2026-11-22' && d.lines.length === 1 && d.lines[0].unit_price === 500 && d.note!.includes('DV-0003'), 'devis → facture : mêmes lignes, échéance à 30 jours, note avec le numéro du devis');
}

// ---------- lecture du code : sync et suppression ----------
ok(/if \(col === 'quotes'\) \{\s*const v = cleanQuote\(/.test(src) && /T\.clients\)\.select\('id'\)\.eq\('id', v\.save\.client_id\)/.test(src), 'sync : le client du devis doit exister');
ok(/qrow\.data\.invoice_id \|\| \(qrow\.data\.status !== 'draft' && qrow\.data\.status !== 'refused'\)/.test(src), 'suppression : seulement brouillon ou refusé, jamais facturé');
ok(/usedQ && usedQ\.length/.test(src), 'un client qui a des devis ne se supprime pas');
const mig = read('supabase/migrations/20261023_create_df_quotes.sql');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_quotes from anon, authenticated/.test(mig) && /drop table public\.df_quotes/.test(mig), 'migration : RLS, aucun accès public, retour en arrière écrit');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
