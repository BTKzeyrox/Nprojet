-- « Mes tableaux » (module 12, étape M12.4) : tableaux de saisie des opérateurs. Même modèle que df_leaves et df_reviews.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Accord tableau » (2026-10-24).
-- Retour en arrière (table vide au départ) : drop table public.df_sheets;
-- Le serveur df-api (bloc SHEETS) revérifie chaque tableau (taille, colonnes, lignes, propriétaire). L'opérateur écrit et lit les SIENS ; l'admin lit tous, sans pouvoir les modifier.
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* : rien à changer.
create table if not exists public.df_sheets (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_sheets enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_sheets from anon, authenticated;
create index if not exists df_sheets_updated_at_idx on public.df_sheets (updated_at);
create index if not exists df_sheets_owner_idx on public.df_sheets ((data->>'owner_id'));
