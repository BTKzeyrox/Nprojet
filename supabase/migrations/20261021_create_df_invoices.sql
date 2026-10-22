-- Facturation (module 2, étape M2.4) : factures, compteurs de numéros et fonctions atomiques.
-- À appliquer APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO M2 ».
-- Retour en arrière (tables vides au départ) :
--   drop function if exists public.df_pay_invoice, public.df_cancel_invoice, public.df_issue_invoice, public.df_invoice_ref_check, public.df_next_counter;
--   drop index if exists public.df_cash_receipt_uq, public.df_cash_invoice_idx;
--   drop table public.df_invoices; drop table public.df_counters;
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : le nombre de tables augmente de 2.
--
-- Règles : un numéro est attribué DANS la même transaction que le changement de la facture (jamais en dehors) :
--  • deux émissions en même temps se mettent en file sur la ligne du compteur : deux numéros différents qui se suivent ;
--  • si la transaction échoue, le compteur revient en arrière : PAS DE TROU ;
--  • un index unique interdit physiquement deux factures (ou deux reçus) avec le même numéro.

create table if not exists public.df_invoices (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.df_counters (
  id text primary key,                       -- 'invoice:2026', 'receipt:2026', 'credit:2026'
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.df_invoices enable row level security;
alter table public.df_counters enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit ces tables, et seulement pour l'administrateur.
revoke all on public.df_invoices from anon, authenticated;
revoke all on public.df_counters from anon, authenticated;
create index if not exists df_invoices_updated_at_idx on public.df_invoices (updated_at);
create index if not exists df_invoices_client_idx on public.df_invoices ((data->>'client_id'));
create unique index if not exists df_invoices_number_uq on public.df_invoices ((data->>'number')) where data->>'number' is not null;
create index if not exists df_cash_invoice_idx on public.df_cash ((data->>'invoice_id')) where data->>'invoice_id' is not null;
create unique index if not exists df_cash_receipt_uq on public.df_cash ((data->>'receipt_no')) where data->>'receipt_no' is not null;

-- Numéro suivant d'un compteur. Atomique : la ligne du compteur est verrouillée jusqu'à la fin de la transaction qui l'appelle.
create or replace function public.df_next_counter(p_key text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  insert into public.df_counters as c (id, value) values (p_key, 1)
  on conflict (id) do update set value = c.value + 1, updated_at = now()
  returning c.value into v;
  return v;
end $$;

-- Texte du numéro : préfixe + année + « - » + compteur sur 4 chiffres AU MOINS (lpad COUPE au-delà de 4 : on ne l'utilise donc que pour compléter).
create or replace function public.df_format_number(p_prefix text, p_year int, p_n bigint) returns text
language sql immutable as $$
  select p_prefix || p_year::text || '-' || case when p_n < 10000 then lpad(p_n::text, 4, '0') else p_n::text end;
$$;

-- Sessions de mission citées : déjà prises par une autre facture NON annulée (brouillon compris) ? absentes ou non validées ?
create or replace function public.df_invoice_ref_check(p_id text, p_refs text[]) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'taken', coalesce((select jsonb_agg(distinct r) from unnest(p_refs) r where exists (
        select 1 from public.df_invoices o,
          jsonb_array_elements(coalesce(o.data->'lines', '[]'::jsonb)) l,
          jsonb_array_elements_text(coalesce(l->'refs', '[]'::jsonb)) x
        where o.id <> p_id and coalesce(o.data->>'status', '') <> 'cancelled' and coalesce(o.data->>'type', 'invoice') <> 'credit_note' and x = r)), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(distinct r) from unnest(p_refs) r where not exists (
        select 1 from public.df_posts p where p.id = r and p.data->>'status' = 'completed')), '[]'::jsonb)
  );
$$;

-- Émission : brouillon → émise, avec son numéro définitif. `p_patch` = ce que le serveur a recalculé (dates, lignes, totaux, copies du client et de l'entreprise).
-- `p_expected` = la version du brouillon que le serveur a lue : si quelqu'un l'a modifié entre-temps, on refuse (« changed »).
create or replace function public.df_issue_invoice(p_id text, p_expected timestamptz, p_prefix text, p_year int, p_patch jsonb) returns jsonb
language plpgsql as $$
declare inv public.df_invoices%rowtype; d jsonb; n bigint; num text; refs text[]; chk jsonb;
begin
  select * into inv from public.df_invoices where id = p_id for update;
  if not found then raise exception 'invoice_missing'; end if;
  if inv.updated_at is distinct from p_expected then raise exception 'changed'; end if;
  d := inv.data;
  if coalesce(d->>'type', 'invoice') <> 'invoice' or coalesce(d->>'status', '') <> 'draft' then raise exception 'not_draft'; end if;
  d := d || coalesce(p_patch, '{}'::jsonb);
  if jsonb_typeof(d->'lines') is distinct from 'array' or jsonb_array_length(d->'lines') = 0 then raise exception 'no_lines'; end if;
  if coalesce((d->>'total_ar')::numeric, 0) <= 0 then raise exception 'no_total'; end if;
  select coalesce(array_agg(distinct x), '{}') into refs
    from jsonb_array_elements(d->'lines') l, jsonb_array_elements_text(coalesce(l->'refs', '[]'::jsonb)) x;
  chk := public.df_invoice_ref_check(p_id, refs);
  if jsonb_array_length(chk->'taken') > 0 then raise exception 'refs_taken'; end if;
  if jsonb_array_length(chk->'missing') > 0 then raise exception 'refs_missing'; end if;
  n := public.df_next_counter('invoice:' || p_year::text);
  num := public.df_format_number(p_prefix, p_year, n);
  d := d || jsonb_build_object('number', num, 'status', 'issued', 'type', 'invoice', 'issued_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  update public.df_invoices set data = d, updated_at = now() where id = p_id;
  return d;
end $$;

-- Annulation par avoir : seulement une facture émise SANS aucun paiement. L'avoir a son propre numéro ; ses lignes ne citent plus les sessions (elles redeviennent à facturer).
create or replace function public.df_cancel_invoice(p_id text, p_credit_id text, p_prefix text, p_year int, p_today text, p_by text) returns jsonb
language plpgsql as $$
declare inv public.df_invoices%rowtype; d jsonb; n bigint; num text; cn jsonb; now_txt text;
begin
  select * into inv from public.df_invoices where id = p_id for update;
  if not found then raise exception 'invoice_missing'; end if;
  d := inv.data;
  if coalesce(d->>'type', 'invoice') <> 'invoice' or coalesce(d->>'status', '') <> 'issued' then raise exception 'not_issued'; end if;
  if exists (select 1 from public.df_cash c where c.data->>'invoice_id' = p_id and c.data->>'kind' = 'in') then raise exception 'has_payments'; end if;
  n := public.df_next_counter('credit:' || p_year::text);
  num := public.df_format_number(p_prefix, p_year, n);
  now_txt := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  cn := jsonb_build_object(
    'id', p_credit_id, 'type', 'credit_note', 'number', num, 'status', 'issued', 'client_id', d->>'client_id', 'client', d->'client', 'issuer', d->'issuer',
    'issue_date', p_today, 'due_date', p_today,
    'lines', coalesce((select jsonb_agg(l - 'refs') from jsonb_array_elements(d->'lines') l), '[]'::jsonb),
    'subtotal_ar', d->'subtotal_ar', 'tax_rate', d->'tax_rate', 'tax_ar', d->'tax_ar', 'total_ar', d->'total_ar',
    'note', 'Avoir annulant la facture ' || coalesce(d->>'number', ''), 'credit_of', p_id, 'issued_at', now_txt, 'created_by', p_by, 'created_at', now_txt, 'updated_at', now_txt);
  insert into public.df_invoices (id, data, updated_at) values (p_credit_id, cn, now());
  update public.df_invoices set data = d || jsonb_build_object('status', 'cancelled', 'cancelled_by', p_credit_id), updated_at = now() where id = p_id;
  return jsonb_build_object('credit_note', cn, 'invoice_id', p_id);
end $$;

-- Paiement d'une facture : crée la ligne d'argent (avec son reçu) dans la même transaction. La facture est verrouillée : deux paiements en même temps ne peuvent pas dépasser le total.
create or replace function public.df_pay_invoice(p_id text, p_cash_id text, p_amount numeric, p_date text, p_method text, p_note text, p_prefix text, p_year int, p_by text) returns jsonb
language plpgsql as $$
declare inv public.df_invoices%rowtype; d jsonb; paid numeric; bal numeric; n bigint; rc text; row jsonb; now_txt text;
begin
  select * into inv from public.df_invoices where id = p_id for update;
  if not found then raise exception 'invoice_missing'; end if;
  d := inv.data;
  if coalesce(d->>'type', 'invoice') <> 'invoice' or coalesce(d->>'status', '') <> 'issued' then raise exception 'not_issued'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then raise exception 'bad_amount'; end if;
  select coalesce(sum((c.data->>'amount_ar')::numeric), 0) into paid from public.df_cash c where c.data->>'invoice_id' = p_id and c.data->>'kind' = 'in';
  bal := (d->>'total_ar')::numeric - paid;
  if p_amount > bal then raise exception 'too_much:%', greatest(bal, 0); end if;
  n := public.df_next_counter('receipt:' || p_year::text);
  rc := public.df_format_number(p_prefix, p_year, n);
  now_txt := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  row := jsonb_build_object(
    'id', p_cash_id, 'kind', 'in', 'category', 'Paiement client', 'amount_ar', p_amount, 'date', p_date,
    'note', left(coalesce(p_note, ''), 300), 'client_name', coalesce(d->'client'->>'name', ''),
    'invoice_id', p_id, 'receipt_no', rc, 'payment_method', left(coalesce(p_method, ''), 40),
    'created_by', p_by, 'created_at', now_txt, 'updated_at', now_txt);
  insert into public.df_cash (id, data, updated_at) values (p_cash_id, row, now());
  return jsonb_build_object('cash', row, 'receipt_no', rc, 'paid', paid + p_amount, 'balance', bal - p_amount);
end $$;

-- Ces fonctions ne sont appelables que par le serveur (clé de service), jamais par le navigateur.
revoke all on function public.df_next_counter(text) from public, anon, authenticated;
revoke all on function public.df_format_number(text, int, bigint) from public, anon, authenticated;
revoke all on function public.df_invoice_ref_check(text, text[]) from public, anon, authenticated;
revoke all on function public.df_issue_invoice(text, timestamptz, text, int, jsonb) from public, anon, authenticated;
revoke all on function public.df_cancel_invoice(text, text, text, int, text, text) from public, anon, authenticated;
revoke all on function public.df_pay_invoice(text, text, numeric, text, text, text, text, int, text) from public, anon, authenticated;
