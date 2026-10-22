// Contrôle des fonctions SQL de facturation (M2.4) sur un VRAI Postgres local (PGlite), sans toucher à la vraie base.
// Lancer : npm run check:invoices-sql
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;
const fn = async (sql, params) => { try { return { ok: true, rows: await q(sql, params) }; } catch (e) { return { ok: false, msg: String(e.message || e) }; } };

// Décor : les rôles et les tables qui existent déjà sur la vraie base (mêmes colonnes)
await db.exec(`create role anon; create role authenticated;
  create table public.df_cash (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
  create table public.df_posts (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());`);
const migration = fs.readFileSync(new URL('../supabase/migrations/20261021_create_df_invoices.sql', import.meta.url), 'utf8');
await db.exec(migration);
ok(true, 'la migration s\'applique sans erreur sur un Postgres vierge');
await db.exec(migration);
ok(true, 'la migration peut être rejouée sans erreur (create if not exists)');

const post = (id, status = 'completed') => db.query('insert into public.df_posts (id, data) values ($1, $2)', [id, JSON.stringify({ id, status })]);
for (const id of ['s1', 's2', 's3', 's4', 's5']) await post(id);
await post('s_pending', 'pending');
const draft = (id, refs = [], total = 100000, extra = {}) => db.query('insert into public.df_invoices (id, data) values ($1, $2)', [id, JSON.stringify({ id, type: 'invoice', status: 'draft', client_id: 'c1', issue_date: '2026-10-20', due_date: '2026-11-19', lines: [{ id: 'l1', description: 'Saisie', qty: refs.length || 1, unit_price_ar: total, total_ar: total, refs }], subtotal_ar: total, tax_rate: 0, tax_ar: 0, total_ar: total, ...extra })]);
const version = async id => (await q('select updated_at from public.df_invoices where id = $1', [id]))[0].updated_at.toISOString();
const issue = async (id, year = 2026, prefix = 'FA-', patch = { issuer: { name: 'Ma société' }, client: { name: 'Atelier' } }) => fn('select public.df_issue_invoice($1, $2::timestamptz, $3, $4, $5::jsonb) as r', [id, await version(id), prefix, year, JSON.stringify(patch)]);
const row = async id => (await q('select data from public.df_invoices where id = $1', [id]))[0]?.data;
const counter = async key => (await q('select value from public.df_counters where id = $1', [key]))[0]?.value;
const pay = (id, cash, amount, date = '2026-10-21', method = 'Espèces', year = 2026) => fn('select public.df_pay_invoice($1, $2, $3::numeric, $4, $5, $6, $7, $8, $9) as r', [id, cash, amount, date, method, 'note', 'RC-', year, 'admin-1']);
const cancel = (id, credit, year = 2026) => fn('select public.df_cancel_invoice($1, $2, $3, $4, $5, $6) as r', [id, credit, 'AV-', year, '2026-10-21', 'admin-1']);

// ---------- Numéros ----------
ok((await q(`select public.df_format_number('FA-', 2026, 1) a, public.df_format_number('FA-', 2026, 42) b, public.df_format_number('FA-', 2026, 9999) c, public.df_format_number('FA-', 2026, 10000) d, public.df_format_number('RC-', 2026, 123456) e`))[0].a === 'FA-2026-0001', 'format du numéro : FA-2026-0001');
const f = (await q(`select public.df_format_number('FA-', 2026, 42) b, public.df_format_number('FA-', 2026, 9999) c, public.df_format_number('FA-', 2026, 10000) d, public.df_format_number('RC-', 2026, 123456) e`))[0];
ok(f.b === 'FA-2026-0042' && f.c === 'FA-2026-9999' && f.d === 'FA-2026-10000' && f.e === 'RC-2026-123456', 'numéro : 4 chiffres au moins, et le 10 000e n\'est PAS coupé (lpad aurait donné 1000)');

// ---------- Émission ----------
await draft('d1', ['s1', 's2']); await draft('d2', ['s3']); await draft('d3', []);
let r = await issue('d1');
ok(r.ok && r.rows[0].r.number === 'FA-2026-0001' && r.rows[0].r.status === 'issued' && !!r.rows[0].r.issued_at, 'première émission : FA-2026-0001, statut « issued », date d\'émission posée');
ok((await row('d1')).number === 'FA-2026-0001' && (await row('d1')).issuer.name === 'Ma société' && (await row('d1')).client.name === 'Atelier', 'la facture émise garde la copie du client et de l\'entreprise');
r = await issue('d2');
ok(r.ok && r.rows[0].r.number === 'FA-2026-0002', 'émission suivante : FA-2026-0002 (les numéros se suivent)');
r = await issue('d1');
ok(!r.ok && /not_draft/.test(r.msg) && (await counter('invoice:2026')) === 2n || (!r.ok && /not_draft|changed/.test(r.msg)), 'émettre deux fois la même facture : refusé, le compteur ne bouge pas');
ok(String(await counter('invoice:2026')) === '2', 'compteur après un refus : toujours 2 (aucun numéro perdu)');
r = await fn('select public.df_issue_invoice($1, $2::timestamptz, $3, $4, $5::jsonb)', ['d3', '2000-01-01T00:00:00Z', 'FA-', 2026, '{}']);
ok(!r.ok && /changed/.test(r.msg) && String(await counter('invoice:2026')) === '2', 'brouillon modifié depuis la lecture : refusé (« changed »), pas de numéro perdu');
await draft('dx', ['s1']); // cite une session déjà prise par d1
r = await issue('dx');
ok(!r.ok && /refs_taken/.test(r.msg) && String(await counter('invoice:2026')) === '2' && (await row('dx')).status === 'draft' && !(await row('dx')).number, 'session déjà facturée : refusé (« refs_taken »), PAS DE TROU dans les numéros, la facture reste un brouillon');
await draft('dm', ['s_pending']); await draft('dn', ['s_nope']);
r = await issue('dm'); const r2 = await issue('dn');
ok(!r.ok && /refs_missing/.test(r.msg) && !r2.ok && /refs_missing/.test(r2.msg) && String(await counter('invoice:2026')) === '2', 'session non validée ou inconnue : refusé (« refs_missing »), compteur intact');
await draft('dz', [], 0);
r = await issue('dz');
ok(!r.ok && /no_total/.test(r.msg) && String(await counter('invoice:2026')) === '2', 'facture à 0 Ar : refusée, compteur intact');
await db.exec(`insert into public.df_invoices (id, data) values ('dl', '{"id":"dl","type":"invoice","status":"draft","lines":[],"total_ar":5}')`);
r = await issue('dl');
ok(!r.ok && /no_lines/.test(r.msg), 'facture sans ligne : refusée (« no_lines »)');
r = await fn('select public.df_issue_invoice($1, now(), $2, $3, $4::jsonb)', ['inconnue', 'FA-', 2026, '{}']);
ok(!r.ok && /invoice_missing/.test(r.msg), 'facture inconnue : refusée');
await draft('d4', ['s4']);
r = await issue('d4');
ok(r.ok && r.rows[0].r.number === 'FA-2026-0003', 'après tous ces échecs, la facture suivante reçoit FA-2026-0003 : la suite est continue');

// Retour en arrière : une transaction annulée ne consomme PAS de numéro
await db.exec('begin'); await draft('d5', ['s5']);
const vv = await version('d5');
const rr = await q('select public.df_issue_invoice($1, $2::timestamptz, $3, $4, $5::jsonb) as r', ['d5', vv, 'FA-', 2026, '{}']);
await db.exec('rollback');
ok(rr[0].r.number === 'FA-2026-0004' && String(await counter('invoice:2026')) === '3', 'transaction annulée (rollback) : le numéro 0004 n\'est PAS consommé, le compteur reste à 3');
await draft('d5', ['s5']);
r = await issue('d5');
ok(r.ok && r.rows[0].r.number === 'FA-2026-0004', 'la facture suivante prend bien 0004 (jamais de trou)');

// Années séparées, grand compteur
await draft('y1', []); r = await issue('y1', 2027);
ok(r.ok && r.rows[0].r.number === 'FA-2027-0001', 'nouvelle année : le compteur repart à 0001');
await db.exec(`insert into public.df_counters (id, value) values ('invoice:2030', 9999)`);
await draft('big', []); r = await issue('big', 2030);
ok(r.ok && r.rows[0].r.number === 'FA-2030-10000', 'le 10 000e numéro est écrit en entier (FA-2030-10000)');
await draft('p2', []); r = await issue('p2', 2026, 'FACT/');
ok(r.ok && r.rows[0].r.number === 'FACT/2026-0005', 'le préfixe est celui des Conditions (« FACT/ »)');

// Index unique : impossible d'avoir deux fois le même numéro
const dup = await fn(`insert into public.df_invoices (id, data) values ('dup', '{"number":"FA-2026-0001","status":"issued"}')`);
ok(!dup.ok && /unique|duplicate/i.test(dup.msg), 'deux factures avec le même numéro : refusé par la base elle-même (index unique)');
const dup2 = await fn(`insert into public.df_invoices (id, data) values ('nn1', '{"status":"draft"}'), ('nn2', '{"status":"draft"}')`);
ok(dup2.ok, 'plusieurs brouillons sans numéro : permis (l\'index ne s\'applique qu\'aux numéros)');

// ---------- Paiements et reçus ----------
// d1 = FA-2026-0001, total 100 000
r = await pay('d1', 'cash1', 40000);
ok(r.ok && r.rows[0].r.receipt_no === 'RC-2026-0001' && String(r.rows[0].r.balance) === '60000' && String(r.rows[0].r.paid) === '40000', 'premier paiement de 40 000 : reçu RC-2026-0001, reste 60 000');
const cashRow = (await q(`select data from public.df_cash where id = 'cash1'`))[0].data;
ok(cashRow.kind === 'in' && cashRow.invoice_id === 'd1' && cashRow.receipt_no === 'RC-2026-0001' && cashRow.client_name === 'Atelier' && cashRow.payment_method === 'Espèces' && cashRow.category === 'Paiement client', 'la ligne d\'argent créée porte la facture, le reçu, le client et le mode de paiement');
r = await pay('d1', 'cash2', 60001);
ok(!r.ok && /too_much:60000/.test(r.msg) && String(await counter('receipt:2026')) === '1', 'paiement au-dessus du reste : refusé avec le maximum (60 000), aucun reçu consommé');
r = await pay('d1', 'cash3', 60000, '2026-10-22');
ok(r.ok && r.rows[0].r.receipt_no === 'RC-2026-0002' && String(r.rows[0].r.balance) === '0', 'paiement du reste : reçu RC-2026-0002, reste 0');
r = await pay('d1', 'cash4', 1);
ok(!r.ok && /too_much:0/.test(r.msg), 'facture entièrement payée : tout autre paiement est refusé');
ok(!(await pay('d3', 'cashx', 100)).ok && /not_issued/.test((await pay('d3', 'cashx', 100)).msg), 'paiement sur un brouillon : refusé');
for (const bad of [0, -5, 1.5]) { const x = await pay('d2', 'cashb', bad); if (x.ok || !/bad_amount/.test(x.msg)) ok(false, `montant ${bad} devrait être refusé`); }
ok(!(await pay('d2', 'cashb', 0)).ok && !(await pay('d2', 'cashb', 1.5)).ok, 'montant 0, négatif ou à virgule : refusé');
r = await fn('select public.df_pay_invoice($1, $2, NULL, $3, $4, $5, $6, $7, $8)', ['d2', 'cashn', '2026-10-21', 'x', 'x', 'RC-', 2026, 'a']);
ok(!r.ok && /bad_amount/.test(r.msg), 'montant absent (NULL) : refusé');
ok(!(await pay('inconnue', 'cashu', 5)).ok && /invoice_missing/.test((await pay('inconnue', 'cashu', 5)).msg), 'paiement sur une facture inconnue : refusé');
const dupCash = await fn(`insert into public.df_cash (id, data) values ('dupc', '{"receipt_no":"RC-2026-0001"}')`);
ok(!dupCash.ok && /unique|duplicate/i.test(dupCash.msg), 'deux reçus avec le même numéro : refusé par la base (index unique)');
ok(String(await counter('receipt:2026')) === '2', 'compteur de reçus : 2 (aucun trou malgré les refus)');

// ---------- Annulation par avoir ----------
r = await cancel('d1', 'cn1');
ok(!r.ok && /has_payments/.test(r.msg) && (await row('d1')).status === 'issued' && !(await q(`select 1 from public.df_invoices where id = 'cn1'`)).length && (await counter('credit:2026')) === undefined, 'facture déjà payée : annulation refusée (« has_payments »), aucun avoir créé, aucun numéro consommé');
r = await cancel('d2', 'cn2');
ok(r.ok && r.rows[0].r.credit_note.number === 'AV-2026-0001' && r.rows[0].r.credit_note.credit_of === 'd2' && r.rows[0].r.credit_note.type === 'credit_note', 'facture non payée : avoir AV-2026-0001 créé');
const inv2 = await row('d2');
ok(inv2.status === 'cancelled' && inv2.cancelled_by === 'cn2' && inv2.number === 'FA-2026-0002', 'la facture annulée garde son numéro et pointe vers l\'avoir (elle n\'est jamais supprimée)');
const cn = await row('cn2');
ok(cn.total_ar === inv2.total_ar && cn.lines.length === 1 && !('refs' in cn.lines[0]) && cn.client.name === 'Atelier' && /FA-2026-0002/.test(cn.note), 'l\'avoir reprend les montants et le client, sans citer les missions, avec la mention de la facture annulée');
const chk = (await q(`select public.df_invoice_ref_check('autre', ARRAY['s3','s1']) as c`))[0].c;
ok(chk.taken.length === 1 && chk.taken[0] === 's1', 'après l\'annulation, la session s3 est libre de nouveau ; s1 (facture d1 encore valable) reste prise');
r = await cancel('d2', 'cn3');
ok(!r.ok && /not_issued/.test(r.msg), 'annuler deux fois : refusé');
r = await cancel('cn2', 'cn4');
ok(!r.ok && /not_issued/.test(r.msg), 'on n\'annule pas un avoir');
r = await cancel('d3', 'cn5');
ok(!r.ok && /not_issued/.test(r.msg), 'on n\'annule pas un brouillon (on le supprime)');
r = await pay('d2', 'cashc', 100);
ok(!r.ok && /not_issued/.test(r.msg), 'paiement sur une facture annulée : refusé');
await draft('again', ['s3']); r = await issue('again');
ok(r.ok && r.rows[0].r.number === 'FA-2026-0006', 'une session libérée par un avoir peut être refacturée (numéro 0006 : la suite continue)');
r = await cancel('again', 'cn6');
ok(r.ok && r.rows[0].r.credit_note.number === 'AV-2026-0002', 'deuxième avoir : AV-2026-0002');

// ---------- Sécurité ----------
const sec = await q(`select c.relname, c.relrowsecurity as rls, (select count(*) from information_schema.role_table_grants g where g.table_name = c.relname and g.grantee in ('anon','authenticated')) as droits
  from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relname in ('df_invoices', 'df_counters') order by 1`);
ok(sec.length === 2 && sec.every(x => x.rls === true && Number(x.droits) === 0), 'df_invoices et df_counters : RLS activée, aucun droit pour anon ni authenticated');
const fnPriv = await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') as a, has_function_privilege('authenticated', p.oid, 'execute') as b
  from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('df_issue_invoice','df_cancel_invoice','df_pay_invoice','df_next_counter','df_invoice_ref_check','df_format_number')`);
ok(fnPriv.length === 6 && fnPriv.every(x => x.a === false && x.b === false), 'les 6 fonctions ne sont appelables ni par anon ni par authenticated (seulement le serveur)');
ok(/for update/i.test(migration) && (migration.match(/for update/gi) || []).length >= 3, 'les 3 opérations qui changent une facture verrouillent sa ligne (for update)');

await db.close();
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
