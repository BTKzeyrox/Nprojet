-- Planning des équipes (module 15, étape M15.2) : une entrée par salarié et par jour (Jour, Nuit ou Repos). Même modèle que df_leaves.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Go m15 » (2026-10-25, tables du module comprises).
-- Retour en arrière (table vide au départ) : drop table public.df_shifts;
-- Le serveur df-api (bloc SHIFTS) revérifie chaque entrée : identifiant calculé (salarié + date), vacation connue, date à 400 jours au plus, salarié existant. Seul le responsable écrit.
-- Un salarié ne reçoit que SON planning (state filtre par employee_id) ; le responsable reçoit tout.
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : rien à changer.
create table if not exists public.df_shifts (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_shifts enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_shifts from anon, authenticated;
create index if not exists df_shifts_updated_at_idx on public.df_shifts (updated_at);
create index if not exists df_shifts_employee_idx on public.df_shifts ((data->>'employee_id'));
