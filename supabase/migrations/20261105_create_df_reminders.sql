-- Rappels et tâches (module 25). Table df_reminders : id = identifiant du rappel, ou « cfg:<compte> » pour les modèles et réglages d'une personne ; data = fiche.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go finir tous sans moi » (2026-11-05).
-- Retour en arrière : select cron.unschedule('df-reminders-due'); drop table public.df_reminders;  (aucune autre table touchée ; le site cache simplement la liste « À faire »)
-- Incluse dans la sauvegarde de nuit comme les autres df_*. Personne n'y accède directement : seulement le serveur (df-api, service_role).
create table if not exists public.df_reminders (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_reminders enable row level security;
revoke all on public.df_reminders from anon, authenticated;
create index if not exists df_reminders_user_idx on public.df_reminders ((data->>'user_id'));
create index if not exists df_reminders_kind_status_idx on public.df_reminders ((data->>'kind'), (data->>'status'));
