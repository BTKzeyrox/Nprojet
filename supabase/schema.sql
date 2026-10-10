-- =====================================================================
-- DF-boosting : structure de la base Supabase (SANS AUCUNE DONNÉE)
-- À lancer UNE fois dans un projet Supabase neuf (SQL Editor, ou connecteur Supabase).
-- Peut être relancé sans danger : « if not exists » partout.
-- Toutes les tables sont fermées au public (RLS activé, aucun droit pour anon/authenticated) :
-- seules les fonctions du serveur (df-api, df-restore, clé « service_role ») y accèdent.
-- =====================================================================

-- Données principales : un document JSON par ligne (id = identifiant, data = le document)
create table if not exists public.df_users            (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_posts            (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_contracts        (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_advances         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_messages         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_groups           (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.df_security_logs    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_settings         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_payroll          (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_signups          (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_resets           (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_profile_requests (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.df_restore          (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());

-- Identifiants de connexion (mots de passe hachés, jamais en clair)
create table if not exists public.df_credentials (
  user_id text primary key,
  username text not null unique,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- Présence en ligne et historique d'arrivée
create table if not exists public.df_presence (
  user_id text primary key,
  last_seen timestamptz not null default now(),
  day text not null default '',
  online_sec integer not null default 0,
  waiting_since timestamptz
);
create table if not exists public.df_attendance (
  user_id text not null,
  day date not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  online_sec integer not null default 0,
  primary key (user_id, day)
);

-- Messagerie : jusqu'où chaque personne a lu chaque conversation (coches « lu »)
create table if not exists public.df_chat_reads (
  user_id text not null,
  thread text not null,
  ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, thread)
);

-- Journal des erreurs et signalements
create table if not exists public.df_errors (
  id text primary key,
  kind text not null,
  fingerprint text,
  message text not null default '',
  stack text not null default '',
  page text,
  role text,
  device text,
  version text,
  detail text,
  screenshot_url text,
  users jsonb not null default '[]'::jsonb,
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'open'
);

-- Index
create index if not exists df_attendance_day_idx on public.df_attendance using btree (day);
create index if not exists df_payroll_kind_pid_idx on public.df_payroll using btree ((data ->> 'kind'), (data ->> 'pid'));
create index if not exists df_payroll_user_idx on public.df_payroll using btree ((data ->> 'user_id'));
create index if not exists df_errors_status_last_idx on public.df_errors using btree (status, last_seen desc);
create unique index if not exists df_errors_fingerprint_uidx on public.df_errors using btree (fingerprint) where fingerprint is not null and kind <> 'report';
create index if not exists df_posts_date_idx on public.df_posts using btree ((data ->> 'date'));

-- Sécurité : tout est fermé au public (RLS activé, sans règle) et aucun droit pour anon / authenticated
do $$
declare t text;
begin
  for t in select unnest(array[
    'df_users','df_posts','df_contracts','df_advances','df_messages','df_groups','df_security_logs','df_settings',
    'df_payroll','df_signups','df_resets','df_profile_requests','df_restore','df_credentials','df_presence',
    'df_attendance','df_chat_reads','df_errors'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Lecture des clés rangées dans le coffre-fort (Vault) : seulement celles de Cloudinary et la clé d'envoi de mails
create or replace function public.df_get_secret(secret_name text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v text;
begin
  if secret_name not like 'cloudinary\_%' escape '\' and secret_name <> 'resend_api_key' then
    raise exception 'secret non autorisé';
  end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = secret_name;
  return v;
end;
$function$;
revoke all on function public.df_get_secret(text) from public, anon, authenticated;
grant execute on function public.df_get_secret(text) to service_role;

-- Renommer un employé dans ses sessions
create or replace function public.df_rename_employee(uid text, new_name text)
 returns void
 language sql
 set search_path to 'public'
as $function$
  update public.df_posts
     set data = jsonb_set(data, '{employee_name}', to_jsonb(new_name)),
         updated_at = now()
   where data->>'employee_id' = uid;
$function$;
revoke all on function public.df_rename_employee(text, text) from public, anon, authenticated;
grant execute on function public.df_rename_employee(text, text) to service_role;

-- Dossier de photos et fichiers (public en lecture, 10 Mo max ; l'envoi passe par le serveur)
insert into storage.buckets (id, name, public, file_size_limit)
values ('df-files', 'df-files', true, 10485760)
on conflict (id) do nothing;
