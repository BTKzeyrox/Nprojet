-- Demandes de connexion hors horaires (accès par vacation, étape 2/3) : une fiche par personne (id = « acc-<personne> »).
-- `data` : nom, pseudo, rôle, vacation, raison, état (en attente / autorisée / refusée), motif du refus, fin de l'autorisation, qui a décidé et quand.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go 123 » (2026-10-30).
-- Retour en arrière (table sans effet sur le reste, vide au départ) : drop table public.df_access_requests; puis redéployer la version précédente de df-api.
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* : cette table y est aussi.
create table if not exists public.df_access_requests (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_access_requests enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_access_requests from anon, authenticated;
