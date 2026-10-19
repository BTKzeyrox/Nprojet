-- Finances (Statistiques, phase 2, étape S2.2) : une ligne = une entrée ou une sortie d'argent.
-- Appliquée sur la base `nprojet` le 2026-10-19 après la sauvegarde n° 4.
-- Retour en arrière (la table est vide au départ) : drop table public.df_cash;
create table if not exists public.df_cash (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_cash enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_cash from anon, authenticated;
create index if not exists df_cash_updated_at_idx on public.df_cash (updated_at);
