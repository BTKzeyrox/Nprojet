-- Stories (24 h) des Actualités. Table df_stories : id = identifiant de la story ; data = fiche (auteur, type photo/texte, fond, public, vues, dates).
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go » (2026-11-27).
-- Retour en arrière : drop table public.df_stories;  (aucune autre table touchée ; le site cache simplement la rangée de stories)
-- Personne n'y accède directement : seulement le serveur (df-api, service_role). Les stories de plus de 24 h sont supprimées par le serveur à chaque lecture.
create table if not exists public.df_stories (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_stories enable row level security;
revoke all on public.df_stories from anon, authenticated;
create index if not exists df_stories_author_idx on public.df_stories ((data->>'author_id'));
create index if not exists df_stories_expires_idx on public.df_stories ((data->>'expires_at'));
