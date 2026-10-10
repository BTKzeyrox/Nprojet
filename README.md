# Delta Force Operations — Gestion de Boosting

Application de gestion d'équipe de boosting Delta Force : 20 postes (grille 2x10), shifts Jour/Nuit, preuves photo, validation admin, paie (1M score = 1 000 Ar), avances, calendrier, messagerie.

**Stack :** React + Vite + Tailwind (hébergé sur Vercel) · API = Supabase Edge Function `df-api` (code dans `supabase/functions/df-api/`) · base Supabase (tables `df_*`).

> **Assistant IA (AI Studio, etc.) : lis d'abord [AI_STUDIO.md](AI_STUDIO.md) en entier avant toute action.**

> **Reprise du projet : lis aussi [HANDOVER.md](HANDOVER.md).**

## Connexion
Pseudo + mot de passe (pas d'email). L'admin crée les employés (pseudo + mot de passe) depuis la page Employés.

## Déploiement
Aucune variable d'environnement nécessaire sur Vercel : importer le repo (preset Vite) et déployer.
Le serveur (`df-api`) et ses secrets vivent dans Supabase.

## Développement local
```bash
npm install
npm run dev
```
