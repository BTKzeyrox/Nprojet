-- Rapport automatique (module 15, étape M15.5) : une fiche par période finie (semaine ou mois), avec la copie figée du rapport. Même modèle que df_shifts.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « copie figée avec table » (2026-10-27).
-- APPLIQUÉE le 2026-10-27 (sauvegarde n° 53 prise avant ; serveur v45).
-- Retour en arrière (table vide au départ) : drop table public.df_reports;
-- Le serveur df-api (bloc AUTOREPORT) crée la fiche « en attente » (identifiant = période : jamais de doublon) ; le responsable fige la copie à la première ouverture ; une copie figée ne change plus.
-- Responsable seulement (lecture et écriture) ; jamais envoyée à un salarié. On garde les 24 plus récentes.
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : rien à changer.
create table if not exists public.df_reports (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_reports enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_reports from anon, authenticated;
create index if not exists df_reports_updated_at_idx on public.df_reports (updated_at);
