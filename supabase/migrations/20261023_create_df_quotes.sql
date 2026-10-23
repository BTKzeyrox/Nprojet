-- Devis (module 2, M2.9, facultatif). Table vide au départ, même modèle que df_invoices (RLS, aucun accès public).
-- À appliquer APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go M2.9 » (2026-10-23).
-- Retour en arrière : drop table public.df_quotes;   (la table est vide au départ ; sinon exporter d'abord)
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* : le nombre de tables augmente de 1.
create table if not exists public.df_quotes (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_quotes enable row level security;
revoke all on public.df_quotes from anon, authenticated;
create index if not exists df_quotes_updated_at_idx on public.df_quotes (updated_at);
create index if not exists df_quotes_client_idx on public.df_quotes ((data->>'client_id'));
