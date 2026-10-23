-- Journal d'audit (module 7, étape M7.2). Même modèle que les autres tables df_*.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO module 7 » (2026-10-23).
-- Retour en arrière : drop table public.df_audit;
-- df_audit : une ligne = une action de l'admin (id triable = date + hasard ; data = {id, at, by, by_name, action, target_type, target_id, target_label, detail}).
-- Lecture et écriture : serveur seulement (df-api, route audit-list réservée à l'admin). Aucun droit pour anon ni authenticated.
-- Conservation : 12 mois (le serveur supprime le reste, dans maybePurge).
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* sauf df_backups, df_presence, df_restore, df_errors : df_audit est donc sauvegardée.
-- La remise à zéro (df-restore) n'efface pas df_audit.
create table if not exists public.df_audit (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_audit enable row level security;
revoke all on public.df_audit from anon, authenticated;
create index if not exists df_audit_updated_idx on public.df_audit (updated_at desc);
