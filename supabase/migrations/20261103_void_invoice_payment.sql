-- Module 23, M23.3b : annuler un paiement de facture saisi par erreur, sans jamais supprimer de ligne.
-- On ajoute une ligne de correction (sortie de même montant, même facture, qui cite le paiement par `void_of`).
-- Le « payé » d'une facture devient : entrées − corrections. Une facture dont tous les paiements sont annulés peut de nouveau être annulée par un avoir.
-- Retour en arrière : voir le bas du fichier (anciennes versions de df_pay_invoice et df_cancel_invoice).

create or replace function public.df_invoice_paid(p_id text) returns numeric
language sql stable as $$
  select coalesce(sum(case
    when c.data->>'kind' = 'in' then (c.data->>'amount_ar')::numeric
    when c.data->>'kind' = 'out' and coalesce(c.data->>'void_of', '') <> '' then -(c.data->>'amount_ar')::numeric
    else 0 end), 0)
  from public.df_cash c where c.data->>'invoice_id' = p_id
$$;

create or replace function public.df_pay_invoice(p_id text, p_cash_id text, p_amount numeric, p_date text, p_method text, p_note text, p_prefix text, p_year int, p_by text)
returns jsonb
language plpgsql as $$
declare inv public.df_invoices%rowtype; d jsonb; paid numeric; bal numeric; n bigint; rc text; row jsonb; now_txt text;
begin
  select * into inv from public.df_invoices where id = p_id for update;
  if not found then raise exception 'invoice_missing'; end if;
  d := inv.data;
  if coalesce(d->>'type', 'invoice') <> 'invoice' or coalesce(d->>'status', '') <> 'issued' then raise exception 'not_issued'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then raise exception 'bad_amount'; end if;
  paid := public.df_invoice_paid(p_id);
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

create or replace function public.df_cancel_invoice(p_id text, p_credit_id text, p_prefix text, p_year int, p_today text, p_by text)
returns jsonb
language plpgsql as $$
declare inv public.df_invoices%rowtype; d jsonb; n bigint; num text; cn jsonb; now_txt text;
begin
  select * into inv from public.df_invoices where id = p_id for update;
  if not found then raise exception 'invoice_missing'; end if;
  d := inv.data;
  if coalesce(d->>'type', 'invoice') <> 'invoice' or coalesce(d->>'status', '') <> 'issued' then raise exception 'not_issued'; end if;
  if public.df_invoice_paid(p_id) > 0 then raise exception 'has_payments'; end if;
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

-- Annulation d'un paiement : une ligne de correction liée, jamais de suppression. Le motif (10 caractères au moins) est gardé dans la note.
create or replace function public.df_void_invoice_payment(p_id text, p_cash_id text, p_void_id text, p_date text, p_reason text, p_by text)
returns jsonb
language plpgsql as $$
declare inv public.df_invoices%rowtype; d jsonb; pay jsonb; row jsonb; now_txt text; reason text; paid numeric;
begin
  select * into inv from public.df_invoices where id = p_id for update;
  if not found then raise exception 'invoice_missing'; end if;
  d := inv.data;
  if coalesce(d->>'type', 'invoice') <> 'invoice' or coalesce(d->>'status', '') <> 'issued' then raise exception 'not_issued'; end if;
  reason := btrim(coalesce(p_reason, ''));
  if char_length(reason) < 10 then raise exception 'bad_reason'; end if;
  select c.data into pay from public.df_cash c where c.id = p_cash_id for update;
  if pay is null or pay->>'invoice_id' is distinct from p_id or pay->>'kind' is distinct from 'in' then raise exception 'payment_missing'; end if;
  if exists (select 1 from public.df_cash c where c.data->>'void_of' = p_cash_id) then raise exception 'already_voided'; end if;
  now_txt := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  row := jsonb_build_object(
    'id', p_void_id, 'kind', 'out', 'category', 'Correction de paiement', 'amount_ar', pay->'amount_ar', 'date', p_date,
    'note', left('Annulation du paiement ' || coalesce(pay->>'receipt_no', '') || ' : ' || left(reason, 200), 300),
    'client_name', coalesce(pay->>'client_name', ''), 'invoice_id', p_id, 'void_of', p_cash_id,
    'payment_method', left(coalesce(pay->>'payment_method', ''), 40),
    'created_by', p_by, 'created_at', now_txt, 'updated_at', now_txt);
  insert into public.df_cash (id, data, updated_at) values (p_void_id, row, now());
  paid := public.df_invoice_paid(p_id);
  return jsonb_build_object('cash', row, 'void_of', p_cash_id, 'paid', paid, 'balance', (d->>'total_ar')::numeric - paid);
end $$;

-- Ces fonctions ne sont appelables que par le serveur (clé de service), jamais par le navigateur.
revoke all on function public.df_invoice_paid(text) from public, anon, authenticated;
revoke all on function public.df_void_invoice_payment(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.df_cancel_invoice(text, text, text, int, text, text) from public, anon, authenticated;
revoke all on function public.df_pay_invoice(text, text, numeric, text, text, text, text, int, text) from public, anon, authenticated;

-- RETOUR EN ARRIÈRE (à lancer seulement si besoin) : remettre les versions d'avant dans `20261021_create_df_invoices.sql`
-- (df_pay_invoice : « select coalesce(sum(...)) ... kind = 'in' » ; df_cancel_invoice : « if exists (... kind = 'in') then raise exception 'has_payments' »),
-- puis : drop function public.df_void_invoice_payment(text, text, text, text, text, text); drop function public.df_invoice_paid(text);
