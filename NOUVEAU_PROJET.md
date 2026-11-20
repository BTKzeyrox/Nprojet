# NOUVEAU_PROJET.md — Copier le site dans un autre dépôt avec un autre Supabase

> Lis d'abord `LIRE_EN_PREMIER.md` (règles de BTK : récap, puis attendre « GO » ; réponses courtes, mots simples).
> Ce guide sert à faire une **copie identique** de Gestion Pro : **même compte GitHub, même compte Vercel, autre projet Supabase** (autre base de données, autre serveur). La copie ne contient **aucune donnée** de Nprojet, seulement la structure.
> Les commandes ci-dessous ont été vérifiées en local (`npm run check:copy-project`, `check:setup-sql`, `check:deploy-server`, `check:no-old-account`). **La première vraie copie sur un nouveau Supabase n'a pas encore été faite** : c'est elle qui valide tout le chemin. Note ce qui coince et corrige ce guide.

## En une minute
1. **Un seul fichier décide des comptes : `site.config.json`** (ref Supabase, nom Cloudinary, dépôt GitHub). Le site et le serveur le lisent ; plus rien n'est écrit en dur. Sans réglage valide, `npm run build` s'arrête avec un message clair : une copie ne peut plus écrire par erreur dans la base de Nprojet.
2. `npm run copy:project` crée le **nouveau dépôt** en 2 commits : (1) copie pure, identique (même arbre git, vérifié) ; (2) seulement les comptes.
3. `npm run setup:sql` fabrique **tout le SQL** d'une base neuve (extensions, schéma, réglages, 26 migrations, tâches planifiées, sauvegardes).
4. `npm run admin:sql` fabrique le SQL du compte administrateur.
5. `npm run deploy:server` envoie les 3 fonctions du serveur sur le nouveau Supabase.
6. Vercel : importer le nouveau dépôt. Aucune variable obligatoire.

## ⛔ Règles de sécurité
- Le dépôt **d'origine** `BTKzeyrox/Nprojet` n'est **jamais** modifié par une copie : `copy:project` ne fait que le lire, et refuse de l'écraser (comme `DF-boosting` et `nova-language-coach`). Avant chaque envoi : `git remote -v`.
- Les tokens (GitHub `ghp_…`, Supabase `sbp_…`) se donnent dans le chat, se passent par variable d'environnement, ne s'écrivent **jamais** dans un fichier ni dans l'adresse du dépôt. À supprimer après le travail : https://github.com/settings/tokens et https://supabase.com/dashboard/account/tokens
- Une base Supabase = une copie. Ne branche jamais deux sites sur la même base.

## 0. Ce qu'il faut avoir avant (demander au propriétaire, une fois)
| Quoi | Détail |
|---|---|
| **Nouveau projet Supabase** | Créé dans le bon compte. Noter son **ref** (20 lettres, dans `https://<ref>.supabase.co`). Activer **pg_cron** et **pg_net** : Database → Extensions. |
| **Token GitHub classique** | Cases **`repo` ET `workflow`** (la copie contient `.github/workflows/ci.yml`, GitHub refuse sans `workflow`), 7 jours : https://github.com/settings/tokens/new?scopes=repo,workflow&description=copie-site |
| **Token Supabase** | Account → Access Tokens (commence par `sbp_`). Sert seulement à envoyer le serveur. |
| **Cloudinary** | Le **même** que Nprojet est permis (les photos restent au même endroit : c'est le défaut). Sinon un autre : *cloud name*, *API key*, *API secret*. |
| **Resend** (mails du code de restauration) | *API key*. Sans domaine vérifié, Resend écrit **seulement** à l'adresse du compte Resend. |
| **Compte admin** | Pseudo, nom affiché, mot de passe (6 caractères minimum). |
| **Nom du nouveau dépôt** | `compte/nom`, dans le même GitHub. |

## 1. Copier le dépôt (2 commits)
```bash
git clone https://github.com/BTKzeyrox/Nprojet.git source && cd source && npm ci
# Essai à blanc : rien n'est envoyé, la copie est écrite dans un dossier temporaire
npm run copy:project -- --repo BTKzeyrox/NOUVEAU --supabase-ref <REF_NEUF>
# Si c'est bon : envoi réel (--create crée le dépôt privé ; sans lui, crée d'abord un dépôt VIDE sur GitHub, sans README)
GH_TOKEN=ghp_... npm run copy:project -- --repo BTKzeyrox/NOUVEAU --supabase-ref <REF_NEUF> --push --create
```
Options : `--cloud NOM` (autre Cloudinary), `--out DOSSIER`, `--help`. Le script **refuse** : le dépôt d'origine, un dépôt protégé, le ref Supabase d'origine, un ref invalide, un dossier déjà utilisé. Il **s'arrête sans rien envoyer** si la copie cite encore un compte de Nprojet dans le code. Il liste les textes `.md` à réécrire (étape 6).
Vérifie ensuite : `git log --oneline` du nouveau dépôt = 2 commits (« Copie pure… », « Comptes de cette copie… »), et `git diff HEAD~1 --stat` = seulement `site.config.json` et `supabase/functions/df-api/site-config.ts`.

Si `git` ou `npm` ne marchent pas dans ton environnement : copie à la main (`git archive HEAD | tar -x -C nouveau`), puis change les 3 valeurs de `site.config.json` et lance `npm run config:sync`. Fais-le en **deux commits séparés**, comme ci-dessus.

## 2. La base de données (Supabase neuf)
```bash
git clone https://github.com/BTKzeyrox/NOUVEAU.git && cd NOUVEAU && npm ci
npm run setup:sql        # écrit supabase/setup-complete.sql (jamais gardé dans git)
```
Lance **tout** `supabase/setup-complete.sql` **une seule fois**, dans le SQL Editor du projet **neuf** (ou `execute_sql` du connecteur, en vérifiant le bon projet). Il contient, dans l'ordre : les extensions, l'adresse du projet rangée dans le coffre-fort (`df_project_url`, lue par les tâches planifiées), `schema.sql`, `seed.sql`, puis toutes les migrations.
**Vérifications** (dans le SQL Editor) :
```sql
-- 44 tables df_* avec la sécurité de ligne activée
select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'df\_%' and c.relkind='r' and c.relrowsecurity;
-- 5 tâches planifiées : df-nightly-backup, df-push-due, df-recurring-due, df-reminders-due, df-report-due
select jobname from cron.job order by 1;
-- l'adresse du projet NEUF (jamais celle de Nprojet)
select decrypted_secret from vault.decrypted_secrets where name = 'df_project_url';
```
Range ensuite les clés dans le coffre-fort, avec ces **noms exacts** (les valeurs viennent du propriétaire, jamais dans un fichier) :
```sql
select vault.create_secret('<API key Cloudinary>',    'cloudinary_api_key');
select vault.create_secret('<API secret Cloudinary>', 'cloudinary_api_secret');
select vault.create_secret('<API key Resend>',        'resend_api_key');
```
Les clés d'envoi de notifications (VAPID) et le secret des tâches planifiées sont créés automatiquement.

## 3. Le compte administrateur
```bash
ADMIN_USERNAME=admin ADMIN_NAME="Nom affiché" ADMIN_PASSWORD="mot-de-passe" npm run admin:sql
```
Lance le SQL affiché dans le Supabase **neuf**. L'identifiant `user-admin-1` est attendu par le site : ne pas le changer. Ne garde ni le mot de passe ni le SQL dans un fichier.

## 4. Le serveur (3 fonctions)
```bash
npm run deploy:server -- --dry-run --confirm-ref <REF_NEUF>      # voir sans rien envoyer
SUPABASE_ACCESS_TOKEN=sbp_... npm run deploy:server -- --confirm-ref <REF_NEUF>
```
Envoie `df-api` (**avec ses 4 fichiers** : `index.ts`, `totp.ts`, `accounting.ts`, `site-config.ts`), `df-restore` et `df-assistant` sur le projet de `site.config.json`, puis teste la route publique `signup-info`. Le `--confirm-ref` doit être égal au ref du fichier : impossible de viser un autre projet par erreur. `verify_jwt = false` vient de `supabase/config.toml`.
Si tu déploies autrement (connecteur, tableau de bord) : **envoie tous les fichiers du dossier de la fonction**, sinon `df-api` ne démarre pas (`totp.ts`, `accounting.ts` et `site-config.ts` sont importés par `index.ts`).
**Méthode B — sans terminal (par un connecteur Supabase ou le tableau de bord), la méthode utilisée pour Nprojet** : `df-api` pèse plus de 500 Ko, trop pour un envoi direct. On envoie à la place **un fichier `index.ts` d'une seule ligne**, qui va chercher le code sur GitHub à un commit précis (les autres fichiers `totp.ts`, `accounting.ts`, `site-config.ts` se chargent tout seuls depuis le même dossier) :
```ts
import "https://raw.githubusercontent.com/<OWNER>/<DEPOT>/<COMMIT_COMPLET_40_CARACTÈRES>/supabase/functions/df-api/index.ts";
```
- Nom de la fonction `df-api`, point d'entrée `index.ts`, **`verify_jwt` = false** (idem pour `df-restore` et `df-assistant`, qui sont petites : on envoie leur contenu tel quel).
- Le dépôt doit être **public** (ou le lien lisible sans compte), et le commit doit **déjà être poussé** sur GitHub.
- Utiliser le commit de la copie **qui contient les comptes du nouveau projet** (le 2e commit « comptes »), jamais celui de l'original.
- Avant de remplacer une fonction qui tourne : `select public.df_take_backup();`, et noter le commit précédent. **Retour arrière = redéployer l'ancien commit.**
- Essayée pour de vrai sur Nprojet le 2026-11-20 (version 89, 4 fichiers, `signup-info` répond 200).

**Réglages facultatifs** (secrets de fonctions, Supabase → Edge Functions → Secrets) : `GEMINI_API_KEY` (assistant IA), `RESEND_API_KEY`, `REMINDER_MAIL_TO`, `REMINDER_MAIL_FROM` (mail de rappels). La clé de service et l'adresse du projet sont fournies automatiquement ; les sessions sont signées avec la clé de **ce** projet.
**Test sans navigateur** :
- `POST https://<ref>.supabase.co/functions/v1/df-api/login` avec `{"username":"zz","password":"x"}` → **401** « Pseudo ou mot de passe incorrect. » (le serveur tourne et lit la base).
- Même appel avec l'admin de l'étape 3 → **200** avec un `token`.

## 5. Le site (Vercel, même compte)
1. Nouveau projet Vercel → importer le **nouveau** dépôt. Framework **Vite**, commande `npm run build`, dossier `dist`. Donne-lui un autre nom que celui de Nprojet.
2. **Aucune variable obligatoire** : l'adresse du serveur vient de `site.config.json`. (`VITE_SUPABASE_URL` reste possible pour forcer une autre adresse ; si tu la mets, mets celle du projet **neuf**.)
3. Ouvre le site, connecte-toi avec l'admin. **Attention** : à la première connexion, si la base n'a aucun poste, le site crée des **postes d'exemple** (`src/db/initialData.ts`). Garde-les pour une démo, ou vide-les avant d'inviter du monde.

## 6. Après la copie
- **Réécris les textes `.md`** que `copy:project` a listés (`LIRE_EN_PREMIER.md`, `HANDOVER.md`, `PROJET.md`, `AI_STUDIO.md`, `TODO*.md`) : adresses, état et liens sont ceux de Nprojet. Au minimum : liens du dépôt, de Supabase et de Vercel dans `LIRE_EN_PREMIER.md`, et un `HANDOVER.md` à toi (celui de Nprojet est un bon modèle).
- **Nom du site** : remplace « Gestion Pro » où tu veux (`index.html`, `public/manifest.webmanifest`, icônes). Seuls les **textes affichés** changent ; garde les identifiants internes (`df_`, `employee`, `admin`).
- **Fuseau horaire** : le serveur et le site comptent en **UTC+3 (Madagascar)**, écrit à plusieurs endroits. Pour le même pays, rien à faire ; pour un autre pays, c'est un vrai chantier (cherche `3 * 3600 * 1000` et `+ 180`), à faire à part.
- Lance `npm run check:no-old-account` (aucune trace du compte d'origine) puis `npm run check:all` (tout doit être vert) avant d'inviter du monde.
- La CI (`.github/workflows/ci.yml`) tourne seule à chaque envoi : regarde l'onglet **Actions**.

## 7. Contrôle final (à cocher avec le propriétaire)
- [ ] Connexion admin OK sur le **nouveau** site ; rien ne s'écrit dans la base de Nprojet (compare une table avant/après).
- [ ] Création d'un employé de test, connexion avec lui.
- [ ] Messagerie : message, réponse, groupe, suppression.
- [ ] Envoi d'une photo : l'image s'affiche.
- [ ] Une sauvegarde : `select public.df_take_backup();` renvoie un numéro, et `select count(*) from public.df_backups;` ≥ 1.
- [ ] Réglages → « Restauration du site » : enregistrer le Gmail de l'admin, recevoir le code (ne **pas** lancer la remise à zéro).
- [ ] `npm run check:all` vert ; CI verte dans GitHub Actions.

## 8. Erreurs fréquentes
| Symptôme | Cause et solution |
|---|---|
| `npm run build` s'arrête : « site.config.json : supabase.ref… » | Réglage faux ou absent. Corrige `site.config.json`, lance `npm run config:sync`. |
| `copy:project` : « le ref Supabase est celui d'ici » | Tu as donné le ref de Nprojet. Donne celui du projet **neuf**. |
| `push` refusé : « workflow scope » | Le token n'a pas la case `workflow`. Recrée-le avec le lien de l'étape 0. |
| `setup-complete.sql` : « extension pg_cron / pg_net not available » | Active-les dans Database → Extensions, relance sur une base **vide** (ou supprime les tables créées à moitié). |
| Le SQL complet relancé donne des erreurs | Il est fait pour **une seule** exécution sur une base neuve. |
| Les rappels, notifications ou rapports automatiques ne partent pas | `select * from cron.job_run_details order by start_time desc limit 5;` puis vérifie le secret `df_project_url` et que `df-api` est déployée. |
| Connexion : erreur 500 « Serveur mal configuré » ou « Function not found » | `df-api` pas déployée, ou déployée sans `totp.ts` / `accounting.ts` / `site-config.ts`. Relance `npm run deploy:server`. |
| Photos : l'envoi échoue | Secrets Cloudinary absents du coffre-fort, ou `cloudinary.cloudName` de `site.config.json` ≠ celui du compte (puis `config:sync` et redéployer). |
| Mails de restauration : rien reçu | Secret `resend_api_key` absent, ou Resend sans domaine : seule l'adresse du compte Resend reçoit. |

## 9. Retour en arrière
Une copie rate : **supprime** le nouveau dépôt et le nouveau projet Supabase, et recommence. Nprojet n'a jamais été touché. Un serveur mal déployé : relance `npm run deploy:server` depuis un commit connu bon.

## 10. Ce que ce guide ne couvre pas
- **Les données** : rien n'est copié (pas de missions, pas d'employés). Une copie de données est un autre sujet, à décider à part.
- **Changer de plateforme** (Netlify, Firebase…) : décidé hors sujet. Vercel → Netlify serait simple (site Vite statique) ; une autre base que Supabase demanderait de réécrire `df-api`.
- **Les migrations futures** : toute nouvelle migration doit être ajoutée dans `supabase/migrations/` ; `npm run check:setup-sql` vérifie qu'elle s'installe sur une base neuve.

## Pièges connus (hérités de Nprojet)
- Ne jamais changer l'id `user-admin-1`.
- Les tables sont fermées au public : toute lecture/écriture passe par `df-api`. Pour déboguer, utilise le SQL Editor ou le connecteur Supabase, pas le navigateur.
- Les mots de passe sont stockés avec `scrypt` (format `scrypt$sel$hash`) : jamais en clair.
- Photos : seules les images vont sur Cloudinary ; les PDF et textes vont dans le dossier `df-files` de Supabase.
- Après chaque mise en ligne, le site ouvert se recharge seul (`/version.json`, voir `HANDOVER.md`).
