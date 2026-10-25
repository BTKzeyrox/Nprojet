-- Sécurité en deux étapes (module 16, étape M16.4). Même modèle que les autres tables df_*.
-- À appliquer APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « GO M16 » (2026-10-25).
-- Retour en arrière : drop table public.df_totp;  (sans cette table, plus personne n'a la double étape : la connexion redevient mot de passe seul)
-- df_totp : une ligne par compte qui a activé la double étape (id = identifiant du compte).
-- data = {secret, enabled, last_step, backup:[empreintes SHA-256 des codes de secours non utilisés], created_at}.
-- Le secret est lisible par le serveur seulement (même niveau de protection que les mots de passe de df_credentials) ; jamais envoyé au site après l'activation.
-- Lecture et écriture : serveur seulement (df-api). Aucun droit pour anon ni authenticated.
-- Sauvegarde de nuit : df_take_backup() copie toutes les tables df_* : cette table est donc copiée comme df_credentials.
-- Perdu téléphone ET codes de secours : le responsable remet à zéro le compte d'un Comptable depuis le site ; pour le responsable lui-même :
--   delete from public.df_totp where id = '<identifiant du compte responsable>';   (dans le tableau de bord Supabase)
create table if not exists public.df_totp (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_totp enable row level security;
revoke all on public.df_totp from anon, authenticated;
