-- Blocage après trop d'essais de connexion (module 16, étape M16.3). Même modèle que les autres tables df_*.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO M16 » (2026-10-25).
-- Retour en arrière : drop table public.df_login_attempts;  (sans cette table, le serveur laisse simplement passer les connexions : le blocage s'éteint, rien n'est cassé)
-- df_login_attempts : une ligne par compte tapé (clé « a:pseudo ») et par adresse (clé « i:adresse »).
-- data = {fails, locks, last_at, locked_until} (nombres, en millisecondes pour les dates). AUCUN mot de passe, aucun texte libre.
-- Lecture et écriture : serveur seulement (df-api, route login). Aucun droit pour anon ni authenticated. Jamais envoyée au site.
-- Conservation : le serveur supprime les lignes de plus de 2 jours (de temps en temps, à la connexion).
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* sauf df_backups, df_presence, df_restore, df_errors : cette table est donc copiée (quelques lignes, sans importance).
create table if not exists public.df_login_attempts (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_login_attempts enable row level security;
revoke all on public.df_login_attempts from anon, authenticated;
create index if not exists df_login_attempts_updated_idx on public.df_login_attempts (updated_at);
