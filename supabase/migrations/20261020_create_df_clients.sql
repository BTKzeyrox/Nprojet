-- Clients (module 1, étape M1.3) : fiches clients. Même modèle que df_cash et df_products.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO M1 » (2026-10-20).
-- Retour en arrière (table vide au départ) : drop table public.df_clients;
-- Aucun statut n'est stocké : il se calcule (src/utils/clients.ts). Le serveur df-api revérifie chaque fiche (bloc CLIENTS).
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : rien à changer.
-- La remise à zéro (df-restore) ne touche pas à cette table.
create table if not exists public.df_clients (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_clients enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table, et seulement pour l'administrateur.
revoke all on public.df_clients from anon, authenticated;
create index if not exists df_clients_updated_at_idx on public.df_clients (updated_at);
create index if not exists df_clients_name_idx on public.df_clients ((lower(data->>'name')));
-- Pour retrouver vite les missions et sessions d'un client (refus de supprimer un client qui a des missions).
create index if not exists df_contracts_client_idx on public.df_contracts ((data->>'client_id'));
create index if not exists df_posts_client_idx on public.df_posts ((data->>'client_id'));
