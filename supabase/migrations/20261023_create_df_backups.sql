-- Sauvegardes du site (2026-11-19) : la table df_backups, la fonction df_take_backup() et la tâche de nuit « df-nightly-backup » (23 h UTC).
-- Ces trois éléments existaient déjà dans la base de Nprojet mais dans AUCUN fichier du dépôt : une copie du site n'aurait eu ni sauvegarde ni restauration.
-- Définitions relevées dans la base de Nprojet (lecture seule). Sans danger si relancé. Fonction utilisée par df_restore_backup (migration 20261023_df_restore_backup.sql).
-- Retour en arrière : select cron.unschedule('df-nightly-backup'); drop function public.df_take_backup(); drop table public.df_backups;
create table if not exists public.df_backups (
  id bigserial primary key,
  taken_at timestamptz not null default now(),
  tables integer not null default 0,
  bytes integer not null default 0,
  data jsonb not null
);
alter table public.df_backups enable row level security;
revoke all on public.df_backups from anon, authenticated;

-- Copie toutes les tables df_* (sauf les sauvegardes, la présence, la restauration et le journal d'erreurs) dans une seule ligne, et garde 14 jours.
create or replace function public.df_take_backup()
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  t record;
  j jsonb := '{}'::jsonb;
  part jsonb;
  n int := 0;
  new_id bigint;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'df\_%' escape '\'
      and table_name not in ('df_backups', 'df_presence', 'df_restore', 'df_errors')
    order by table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t.table_name) into part;
    j := j || jsonb_build_object(t.table_name, part);
    n := n + 1;
  end loop;
  insert into public.df_backups (tables, bytes, data) values (n, length(j::text), j) returning id into new_id;
  delete from public.df_backups where taken_at < now() - interval '14 days';
  return new_id;
end $function$;
revoke all on function public.df_take_backup() from public, anon, authenticated;
grant execute on function public.df_take_backup() to service_role;

select cron.schedule('df-nightly-backup', '0 23 * * *', 'select public.df_take_backup()');
