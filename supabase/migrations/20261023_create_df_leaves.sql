-- Congés et absences (module 5, étape M5.2) : demandes de congé. Même modèle que df_clients et df_cash.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go finir M5 » (2026-10-23).
-- Retour en arrière (table vide au départ) : drop table public.df_leaves;
-- Le serveur df-api (bloc LEAVES) revérifie chaque demande : jours ouvrés calculés par lui, solde, chevauchements, qui peut changer l'état.
-- Un salarié ne reçoit que SES demandes (state filtre par employee_id) ; l'admin reçoit tout.
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : rien à changer.
create table if not exists public.df_leaves (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_leaves enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_leaves from anon, authenticated;
create index if not exists df_leaves_updated_at_idx on public.df_leaves (updated_at);
create index if not exists df_leaves_employee_idx on public.df_leaves ((data->>'employee_id'));
