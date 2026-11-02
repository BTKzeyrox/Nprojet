-- Réglages par compte (thème, langue, taille du texte, son, menu, Santé…), partagés entre tous les appareils et navigateurs du même compte.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go accord » (2026-11-02).
-- Retour en arrière : drop table public.df_prefs;  (le site garde alors ses réglages locaux comme avant)
-- df_prefs : id = identifiant du compte ; data = { nom_du_réglage: valeur texte }. Incluse dans la sauvegarde de nuit comme les autres df_*.
create table if not exists public.df_prefs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_prefs enable row level security;
revoke all on public.df_prefs from anon, authenticated;
