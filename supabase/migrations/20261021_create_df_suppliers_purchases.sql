-- Fournisseurs et bons de commande (module 4, étapes M4.1 et M4.2). Même modèle que df_clients, df_cash et df_products.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO M4 » (2026-10-21).
-- Retour en arrière (tables vides au départ) : drop table public.df_purchase_orders; drop table public.df_suppliers;
-- Aucun total n'est stocké : il se calcule (src/utils/purchasing.ts). Le serveur df-api revérifie chaque fiche (blocs SUPPLIERS et PURCHASES).
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* : rien à changer. La remise à zéro (df-restore) ne touche pas à ces tables.
create table if not exists public.df_suppliers (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.df_purchase_orders (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_suppliers enable row level security;
alter table public.df_purchase_orders enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit ces tables, et seulement pour l'administrateur.
revoke all on public.df_suppliers from anon, authenticated;
revoke all on public.df_purchase_orders from anon, authenticated;
create index if not exists df_suppliers_updated_at_idx on public.df_suppliers (updated_at);
create index if not exists df_suppliers_name_idx on public.df_suppliers ((lower(data->>'name')));
create index if not exists df_purchase_orders_updated_at_idx on public.df_purchase_orders (updated_at);
-- Pour retrouver vite les bons d'un fournisseur et les achats liés (refus de supprimer un fournisseur qui a servi).
create index if not exists df_purchase_orders_supplier_idx on public.df_purchase_orders ((data->>'supplier_id'));
create index if not exists df_stock_moves_supplier_idx on public.df_stock_moves ((data->>'supplier_id'));
create index if not exists df_cash_supplier_idx on public.df_cash ((data->>'supplier_id'));
