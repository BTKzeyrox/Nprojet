-- Évaluation périodique (module 5, étape M5.4) : fiches d'entretien. Même modèle que df_leaves et df_clients.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go finir M5 » (2026-10-23).
-- Retour en arrière (table vide au départ) : drop table public.df_reviews;
-- Le serveur df-api (bloc REVIEWS) revérifie chaque fiche. Le responsable écrit ; le salarié reçoit SES fiches PARTAGÉES, sans le champ `improvements`.
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* : rien à changer.
create table if not exists public.df_reviews (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_reviews enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_reviews from anon, authenticated;
create index if not exists df_reviews_updated_at_idx on public.df_reviews (updated_at);
create index if not exists df_reviews_employee_idx on public.df_reviews ((data->>'employee_id'));
