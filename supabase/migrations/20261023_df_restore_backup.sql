-- M7.3 — Restaurer depuis une sauvegarde. Accord de BTK : « Oui » (2026-10-23), après la sauvegarde n° 26.
-- Aucune nouvelle table : une seule fonction, appelée seulement par df-restore (admin + Gmail vérifié + code par mail + mot RESTAURER).
-- 1) prend d'abord une sauvegarde automatique (df_take_backup) ; 2) remplace le contenu des tables de la sauvegarde choisie, en une seule transaction (tout ou rien) ; 3) note l'action dans df_audit.
-- Jamais restaurés : le journal d'audit (c'est l'historique), les abonnements et l'historique des notifications. Les tables absentes de la sauvegarde (créées après) ne sont pas touchées.
create or replace function public.df_restore_backup(p_id bigint, p_by text default '', p_name text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b jsonb;
  t text;
  rows_in jsonb;
  safety bigint;
  n_tables int := 0;
  n_rows int := 0;
  at_ts timestamptz := now();
  skip text[] := array['df_audit', 'df_push_subs', 'df_push_log', 'df_backups', 'df_presence', 'df_restore', 'df_errors'];
begin
  select data into b from public.df_backups where id = p_id;
  if b is null then raise exception 'backup_missing'; end if;
  safety := public.df_take_backup();
  for t in select k from jsonb_object_keys(b) k loop
    if t = any(skip) then continue; end if;
    if t !~ '^df_[a-z_]+$' then continue; end if;
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then continue; end if;
    rows_in := b -> t;
    if jsonb_typeof(rows_in) <> 'array' then raise exception 'backup_invalid'; end if;
    execute format('delete from public.%I', t);
    execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', t, t) using rows_in;
    n_tables := n_tables + 1;
    n_rows := n_rows + jsonb_array_length(rows_in);
  end loop;
  insert into public.df_audit (id, data, updated_at) values (
    to_char(at_ts at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || '-rst' || p_id::text,
    jsonb_build_object('id', to_char(at_ts at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || '-rst' || p_id::text, 'at', to_char(at_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'by', left(p_by, 80), 'by_name', left(p_name, 80), 'action', 'backup_restore', 'target_type', 'backups', 'target_id', p_id::text,
      'target_label', 'Sauvegarde n° ' || p_id::text, 'detail', 'Sauvegarde de sécurité n° ' || safety::text || ' prise juste avant ; ' || n_tables::text || ' tables, ' || n_rows::text || ' lignes'),
    at_ts);
  return jsonb_build_object('safety_backup', safety, 'tables', n_tables, 'rows', n_rows);
end $function$;
revoke all on function public.df_restore_backup(bigint, text, text) from public, anon, authenticated;
