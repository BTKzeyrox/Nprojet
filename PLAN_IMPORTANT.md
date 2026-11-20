# PLAN_IMPORTANT.md — Le plan de BTK pour copier le projet (à lire si une IA plante ou change)

> Ce fichier est la **mémoire du plan dans le dépôt** : il ne dépend d'aucune IA ni d'aucune conversation. Une IA qui reprend le travail lit d'abord `LIRE_EN_PREMIER.md` (règles de BTK : récap, puis attendre « GO »), puis ce fichier, puis `NOUVEAU_PROJET.md`.
> Dernière mise à jour : 2026-11-19. Propriétaire : BTK (français, mots simples, réponses courtes).

## 1. Ce que BTK veut (décisions, dans ses mots)
- **Copier le projet** dans un **nouveau dépôt, dans le même compte GitHub**.
- **Même Vercel** (le compte n'est pas un problème).
- **Autre Supabase** : son compte Supabase actuel est limité et il va encore en changer. **C'est le vrai problème : la base de données et le serveur.**
- On **reste sur Supabase** : seulement un autre *compte*. Changer de plateforme (Netlify, Firebase…) est **hors sujet pour l'instant**.
- La copie doit être **identique** à l'original ; seuls les **comptes** changent, et le dépôt doit **savoir** quels comptes changer.
- Il faut un **guide complet** pour la copie et la passation.
- Aussi : améliorer la copie du site (rendre la copie fiable et vérifiable).

## 2. Ce qui est fait (poussé sur `main`, 2026-11-19)
| # | Sujet | Où |
|---|---|---|
| 1 | CI GitHub : lint, build et tous les `check:*` à chaque envoi | `.github/workflows/ci.yml`, `npm run check:all` |
| 2 | Copie du menu du chat sécurisée | `src/utils/longPress.ts` |
| 3 | Un seul fichier pour les comptes (Supabase, Cloudinary, GitHub) ; la construction s'arrête si c'est faux | `site.config.json`, `src/utils/siteConfig.ts`, `npm run config:sync` |
| 4 | SQL complet d'une base neuve + sauvegardes qui manquaient au dépôt + tâches planifiées sans adresse de Nprojet | `npm run setup:sql`, `supabase/migrations/20261023_create_df_backups.sql` |
| 5 | Script « copier dans mon compte » : 2 commits (copie pure identique, puis comptes) | `npm run copy:project` |
| 6 | Script de déploiement du serveur (3 fonctions) avec confirmation du projet | `npm run deploy:server` |
| 7 | Contrôle « zéro trace de l'ancien compte » | `npm run check:no-old-account` |
| 8 | Guide complet de copie et de passation | `NOUVEAU_PROJET.md`, `HANDOVER.md` § 0 bis |
| 9 | `df-api` : découpage en cours. Tranche 1 : bloc TOTP dans `totp.ts`. Tranche 2 (2026-11-20) : règles pures de la comptabilité dans `accounting.ts` | `supabase/functions/df-api/totp.ts`, `accounting.ts` |

## 2 bis. Copie n° 1 : `BTKzeyrox/gestion` (2026-11-19)
- **Fait** : dépôt `https://github.com/BTKzeyrox/gestion` créé par `npm run copy:project` (2 commits : copie pure de Nprojet @`d10ce73`, puis comptes). Nouveau Supabase : ref `blvuwirzmtmlehafnvew` (compte non visible du connecteur Supabase de l'IA : la base se fait dans son SQL Editor). Cloudinary : le même que Nprojet.
- **Reste pour cette copie** : (a) activer pg_cron et pg_net dans le nouveau Supabase, lancer `supabase/setup-complete.sql` (se refait avec `npm run setup:sql` dans la copie) ; (b) vérifier 44 tables, 5 tâches planifiées, secret `df_project_url` (requêtes dans `NOUVEAU_PROJET.md` § 2) ; (c) secrets Cloudinary / Resend dans le coffre-fort ; (d) compte admin (`npm run admin:sql`) ; (e) `npm run deploy:server -- --confirm-ref blvuwirzmtmlehafnvew` avec un token `sbp_…` ; (f) projet Vercel relié à `BTKzeyrox/gestion` ; (g) réécrire les `.md` qui citent encore Nprojet ; (h) contrôle final (`NOUVEAU_PROJET.md` § 7). Cocher ici ce qui est fait.

## 3. Ce qui reste à faire (dans l'ordre)
1. **Première vraie copie** (jamais faite : tout a été testé en local seulement). Il faut de BTK : le nom du nouveau dépôt (`BTKzeyrox/<nom>`), le **ref du nouveau projet Supabase** (pg_cron et pg_net activés), un token GitHub avec `repo` + `workflow`, un token Supabase `sbp_…`, le choix Cloudinary (même ou autre), et le pseudo / nom / mot de passe de l'admin. Puis suivre `NOUVEAU_PROJET.md` étape par étape, **avec un essai à blanc d'abord** (`copy:project` sans `--push`, `deploy:server --dry-run`).
2. **Corriger `NOUVEAU_PROJET.md`** avec tout ce qui coince à la première copie (et le dire à BTK).
3. **Réécrire dans la copie** les textes `.md` qui citent encore Nprojet (liste donnée par `copy:project`).
4. Poursuivre le **découpage de `df-api`** (7 000 lignes), une tranche à la fois : sortir un bloc, adapter son `check:*`, `npm run check:all`, redéployer **tous les fichiers**.
5. À décider avec BTK (pas fait, pas demandé) : copier aussi des **données**, ou changer de plateforme un jour.

## 4. Comment reprendre sans l'IA précédente (5 minutes)
```bash
git clone https://github.com/BTKzeyrox/Nprojet.git && cd Nprojet && npm ci
git log --oneline -15        # ce qui a été fait, du plus récent au plus ancien
npm run check:all            # tout doit être vert (≈ 3 minutes)
npm run copy:project -- --help
```
Puis lire dans l'ordre : `LIRE_EN_PREMIER.md` → `GUIDE_SITE.md` → ce fichier → `NOUVEAU_PROJET.md` → `HANDOVER.md`.

## 5. Règles à ne pas casser
- **Pas de code sans le mot « GO »** de BTK (un document de texte demandé clairement est permis). Récap court d'abord. Voir `LIRE_EN_PREMIER.md`.
- **Ne jamais toucher** à `DF-boosting` ni à `nova-language-coach`. Le dépôt d'origine `Nprojet` n'est jamais écrasé par une copie.
- **Aucun secret dans le dépôt** (tokens, clés, mots de passe). Les tokens se donnent dans le chat, se passent par variable d'environnement, et se **suppriment après le travail** : https://github.com/settings/tokens
- Écrire sur GitHub avec le token de BTK et `git` dans le terminal, jamais avec le connecteur. Un commit clair par sujet, `npm run build` et `npm run check:all` verts avant chaque envoi, `GUIDE_SITE.md` mis à jour dans le même commit (`npm run guide`).
- Dire honnêtement ce qui est fait, testé ou non testé.

## 6. Limites connues (honnêteté)
- La copie réelle sur un nouveau Supabase n'a **pas** été essayée : seuls les contrôles locaux existent (`check:copy-project`, `check:setup-sql`, `check:deploy-server`, `check:no-old-account`, `check:site-config`).
- Le **fuseau horaire** (UTC+3, Madagascar) est écrit à plusieurs endroits du code : un autre pays serait un vrai chantier.
- Les **données** ne sont pas copiées : la copie est vide (structure seulement).
- Le **déploiement du serveur** passe par la CLI Supabase (`supabase@3.2.0`, mode API) : non essayée sur un vrai projet.
