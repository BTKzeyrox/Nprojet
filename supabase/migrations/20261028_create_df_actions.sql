-- Actions numérotées (module 13, étape M13.7) : une fiche par action envoyée par le téléphone après une coupure, pour qu'une même action ne soit JAMAIS faite deux fois
-- (la réponse se perd, le téléphone renvoie : le serveur rend la réponse gardée au lieu de recommencer). Garde aussi l'heure de réception et l'heure du téléphone.
-- À appliquer sur la base `nprojet` APRÈS une sauvegarde (select public.df_take_backup();). Accord de BTK : « Accord hors ligne » (2026-10-28).
-- Retour en arrière (table sans effet sur le reste, vide au départ) : drop table public.df_actions;
-- Identifiant = « <personne>:<numéro d'action> » (une autre personne ne peut ni rejouer ni deviner la réponse). `data` : route, état (en cours / fait), code et réponse gardés (16 000 caractères au plus),
-- heure de réception, heure du téléphone, écart en secondes. Fiches effacées après 30 jours (par le serveur, de temps en temps).
-- Sauvegarde de nuit : df_take_backup() prend toutes les tables df_* (sauf df_backups, df_presence, df_restore, df_errors) : cette table y est aussi (petite, sans importance).
create table if not exists public.df_actions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.df_actions enable row level security;
-- Aucun accès public : seule la fonction df-api (clé serveur) lit et écrit cette table.
revoke all on public.df_actions from anon, authenticated;
create index if not exists df_actions_updated_at_idx on public.df_actions (updated_at);
