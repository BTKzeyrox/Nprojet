-- Stock (Statistiques, phase 3, étape S3.1) : produits et mouvements de stock. Même modèle que df_cash.
-- Appliquée sur la base `nprojet` le 2026-10-20 après la sauvegarde n° 6 (accord de BTK : « Phase 3 (stock), puis 4 et 5 »).
-- Retour en arrière (tables vides au départ) : drop table public.df_stock_moves; drop table public.df_products;
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : rien à changer.
create table if not exists public.df_products (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.df_stock_moves (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_products enable row level security;
alter table public.df_stock_moves enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit ces tables, et seulement pour l'administrateur.
revoke all on public.df_products from anon, authenticated;
revoke all on public.df_stock_moves from anon, authenticated;
create index if not exists df_products_updated_at_idx on public.df_products (updated_at);
create index if not exists df_stock_moves_updated_at_idx on public.df_stock_moves (updated_at);
create index if not exists df_stock_moves_product_idx on public.df_stock_moves ((data->>'product_id'));
