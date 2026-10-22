-- Notifications push (module 6, étape M6.4). Même modèle que les autres tables df_*.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO M6 » (2026-10-21).
-- Retour en arrière : select cron.unschedule('df-push-due'); drop table public.df_push_subs, public.df_push_log;
--   drop function public.df_push_get_secret(text), public.df_push_set_secret(text, text);  (les 3 secrets restent dans le coffre-fort, sans danger)
-- df_push_subs : un appareil abonné (id = empreinte de l'adresse du service push ; data = {user_id, endpoint, p256dh, auth, created}).
-- df_push_log  : rappels d'échéance déjà envoyés (id = clé du rappel) pour ne jamais prévenir deux fois.
-- Les tables sont incluses dans la sauvegarde de nuit comme les autres df_* ; la remise à zéro (df-restore) n'y touche pas.
create table if not exists public.df_push_subs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.df_push_log (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_push_subs enable row level security;
alter table public.df_push_log enable row level security;
revoke all on public.df_push_subs, public.df_push_log from anon, authenticated;
create index if not exists df_push_subs_user_idx on public.df_push_subs ((data->>'user_id'));

-- Clés de notification rangées dans le coffre-fort (Vault) : seulement ces 3 noms. Lecture et écriture réservées au serveur (service_role).
create or replace function public.df_push_get_secret(secret_name text)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v text;
begin
  if secret_name not in ('push_vapid_public', 'push_vapid_private', 'push_cron_secret') then raise exception 'secret non autorisé'; end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = secret_name;
  return v;
end;
$function$;
-- Écrit un secret seulement s'il n'existe pas encore (jamais d'écrasement : deux appels en même temps ne cassent rien). Rend la valeur retenue.
create or replace function public.df_push_set_secret(secret_name text, secret_value text)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v text;
begin
  if secret_name not in ('push_vapid_public', 'push_vapid_private', 'push_cron_secret') then raise exception 'secret non autorisé'; end if;
  perform pg_advisory_xact_lock(hashtext('df_push_secret'));
  select decrypted_secret into v from vault.decrypted_secrets where name = secret_name;
  if v is null then
    perform vault.create_secret(secret_value, secret_name);
    v := secret_value;
  end if;
  return v;
end;
$function$;
revoke all on function public.df_push_get_secret(text) from public, anon, authenticated;
revoke all on function public.df_push_set_secret(text, text) from public, anon, authenticated;
grant execute on function public.df_push_get_secret(text) to service_role;
grant execute on function public.df_push_set_secret(text, text) to service_role;

-- Rappel automatique toutes les 15 minutes : appelle df-api (route push-due) avec un secret tiré du coffre-fort (jamais écrit dans GitHub).
create extension if not exists pg_net;
select public.df_push_set_secret('push_cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
select cron.schedule(
  'df-push-due',
  '*/15 * * * *',
  $job$select net.http_post(
    url := 'https://fvkusbdhetxleimtdzqm.supabase.co/functions/v1/df-api/push-due',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  )$job$
);
