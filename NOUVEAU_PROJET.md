# NOUVEAU_PROJET.md — Copier ce site pour un autre projet (guide pour l'IA du nouveau compte)

> Ce guide commence par **l'Étape 0 : copier le dépôt** (avec la règle de sécurité). Suis les étapes dans l'ordre : 0, 1, 2, 3, 4, 5, 6.

> Lis d'abord `LIRE_EN_PREMIER.md` (règles de BTK : récap, puis attendre « GO » ; réponses courtes, mots simples).
> Ce dépôt est la **copie** d'un site existant (DF-boosting : accueil, messagerie comme WhatsApp, gestion des employés, paie).
> Tout ce qu'il faut pour monter le même site avec **ses propres** Supabase, Vercel, GitHub est ici. **Aucune donnée** de l'ancien projet n'est dans la copie : seulement la structure.

## ⛔ Règle de sécurité (avant tout)
Le dépôt **original** `https://github.com/BTKzeyrox/DF-boosting` est en **LECTURE SEULE** pour toi. **Tu ne dois JAMAIS y pousser, ni le modifier**, même si le token le permet.
Tu pousses **seulement** sur le **nouveau dépôt** que le propriétaire t'a donné. **Avant chaque envoi**, lance `git remote -v` et vérifie que l'adresse est celle du nouveau dépôt. En cas de doute : arrête-toi et demande.

## Étape 0 — Copier le dépôt, sans faute (à faire en premier)
Le propriétaire te donne : (1) le lien du dépôt original (lecture, sans token : il est public), (2) l'adresse du **nouveau dépôt vide** `https://github.com/<PROPRIÉTAIRE>/<NOUVEAU_NOM>`, (3) un token limité à ce nouveau dépôt. Pas de ZIP.

```bash
# 1. Lire l'original (lecture seule) et noter sa version
git clone --depth 1 https://github.com/BTKzeyrox/DF-boosting.git source-original
SRC_SHA=$(git -C source-original rev-parse HEAD); echo "version copiée : $SRC_SHA"

# 2. Copier les fichiers suivis par git, SANS l'historique ni le dossier .git
mkdir nouveau-projet
git -C source-original archive HEAD | tar -x -C nouveau-projet

# 3. Vérifier que la copie est identique (la commande ne doit rien afficher)
diff -r --exclude=.git source-original nouveau-projet

# 4. Nouveau dépôt git, SANS lien avec l'original
cd nouveau-projet
git init -b main
git config user.name "Claude"; git config user.email "noreply@anthropic.com"
git add -A && git commit -m "Copie de DF-boosting @$SRC_SHA (aucune modification)"

# 5. Pousser SEULEMENT sur le nouveau dépôt (le token reste dans la commande, jamais dans la config git)
git remote add origin https://github.com/<PROPRIÉTAIRE>/<NOUVEAU_NOM>.git
git remote -v        # ⛔ vérifier : jamais DF-boosting
git push "https://x-access-token:$GH_TOKEN@github.com/<PROPRIÉTAIRE>/<NOUVEAU_NOM>.git" main
```
Si `git clone` est impossible dans ton environnement : liste les fichiers avec `https://api.github.com/repos/BTKzeyrox/DF-boosting/git/trees/main?recursive=1`, puis télécharge chaque fichier depuis `https://raw.githubusercontent.com/BTKzeyrox/DF-boosting/main/<chemin>` (octet pour octet, ne retape jamais un fichier à la main).

**Contrôle « sans faute »** (dans `nouveau-projet`, avant toute modification) :
```bash
# Les fichiers indispensables sont là (rien ne doit être affiché ; sinon un fichier manque)
for f in LIRE_EN_PREMIER.md NOUVEAU_PROJET.md AI_STUDIO.md HANDOVER.md PROJET.md package.json package-lock.json vite.config.ts index.html .gitignore .env.example \
  supabase/schema.sql supabase/seed.sql supabase/create_admin.mjs supabase/functions/df-api/index.ts supabase/functions/df-restore/index.ts \
  src/main.tsx src/db/store.ts; do [ -f "$f" ] || echo "MANQUE : $f"; done
npm ci && npm run build        # doit finir par « built », sans erreur
git remote -v                  # uniquement le NOUVEAU dépôt
grep -rIl "ghp_[A-Za-z0-9]\{20,\}\|github_pat_[A-Za-z0-9_]\{20,\}" . --exclude-dir=node_modules --exclude-dir=.git   # aucun token (rien affiché)
```
Ce premier envoi est la **copie pure** : aucune adaptation dedans. Toutes les modifications du nouveau projet (noms, mots, réglages) viennent ensuite, **dans des commits séparés**, pour qu'on puisse toujours comparer avec l'original.

## Danger n°1 : ne jamais mélanger avec l'ancien projet
Le code est configuré par défaut pour l'**ancien** Supabase (`ljorjzrxkxqacmmkmqdx`). Si tu déploies sans régler `VITE_SUPABASE_URL` (étape 4), le nouveau site écrirait dans la base de l'ancien projet. **Ne saute pas l'étape 4.**
Valeurs de l'ancien projet à **ne pas réutiliser** : Supabase `ljorjzrxkxqacmmkmqdx`, Cloudinary `dirnrsy5v`, site `df-boosting-5u7c.vercel.app`, dépôt `BTKzeyrox/DF-boosting`, tous ses tokens et clés.

## 1. Ce que contient la copie
| Fichier / dossier | Rôle |
|---|---|
| `src/` | Le site (React + Vite + Tailwind v4 + TypeScript) |
| `supabase/schema.sql` | **Toute la structure de la base** (18 tables `df_*`, index, sécurité, 2 fonctions, dossier de photos). Sans données. Relançable sans danger. |
| `supabase/seed.sql` | Réglages par défaut |
| `supabase/create_admin.mjs` | Fabrique le SQL du compte administrateur (mot de passe haché, jamais écrit dans un fichier) |
| `supabase/functions/df-api/index.ts` | Le serveur (connexion, synchro, messagerie, paie, photos) |
| `supabase/functions/df-restore/index.ts` | La « Restauration du site » (remise à zéro avec code par mail) |
| `.env.example` | La variable `VITE_SUPABASE_URL` à régler dans Vercel |
| `AI_STUDIO.md`, `HANDOVER.md`, `PROJET.md` | Documentation de l'**ancien** projet (architecture, règles, pièges). À lire pour comprendre le code ; les adresses et l'état qu'ils citent sont ceux de l'ancien projet. |

Architecture : le navigateur parle **seulement** aux fonctions `df-api` / `df-restore` (Supabase Edge Functions). Elles utilisent la clé `service_role` (fournie automatiquement aux fonctions) pour lire et écrire les tables. Les tables sont fermées au public : pas de règles RLS à écrire, aucun accès direct depuis le navigateur.

## 2. Ce qu'il faut demander au propriétaire (une fois)
- **Supabase** : un **nouveau projet** (ne pas réutiliser un projet qui contient d'autres applications). Plan gratuit possible ; dis-lui si une option coûte de l'argent avant de la créer. Le connecteur Supabase doit être activé dans ton chat.
- **GitHub** : un dépôt (public recommandé, voir étape 3) et un token classique (`repo`, 7 jours) : https://github.com/settings/tokens/new?scopes=repo&description=nouveau-projet
- **Vercel** : importer le dépôt (le Vercel de ton chat peut être un autre compte : si tu ne vois pas le projet, le propriétaire l'importe lui-même, 1 minute).
- **Cloudinary** (photos, plan gratuit) : *cloud name*, *API key*, *API secret*.
- **Resend** (mails du code de restauration, gratuit) : une *API key*. Sans domaine vérifié, Resend envoie **seulement vers l'adresse du compte Resend** : le compte Resend doit donc être créé avec le Gmail de l'administrateur.
- Le **nom du site**, les **mots** à utiliser (voir étape 5), le pseudo, le nom affiché et le mot de passe de l'admin.
- Les clés (Cloudinary, Resend) sont des secrets : le propriétaire les colle dans le chat uniquement si tu n'as pas d'autre moyen, tu ne les écris **jamais** dans un fichier ni dans le dépôt, et tu lui conseilles de les régénérer après.

## 3. Étapes (dans cet ordre, une par une, avec « GO » du propriétaire)

### Étape 1 — La base (Supabase)
1. Crée le projet Supabase (région proche des utilisateurs). Note son `ref` (ex. `abcdwxyz`) et l'adresse `https://<ref>.supabase.co`.
2. Lance **`supabase/schema.sql`** en entier (connecteur : `apply_migration`, ou `execute_sql`). Vérifie : 18 tables `df_*` avec RLS activé :
   `select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'df\_%' and c.relkind='r' and c.relrowsecurity;` → **18**.
3. Lance **`supabase/seed.sql`**.
4. Range les clés dans le coffre-fort (Vault), avec ces **noms exacts** :
   ```sql
   select vault.create_secret('<API key Cloudinary>',    'cloudinary_api_key');
   select vault.create_secret('<API secret Cloudinary>', 'cloudinary_api_secret');
   select vault.create_secret('<API key Resend>',        'resend_api_key');
   ```
   Seuls ces noms sont lisibles par la fonction `df_get_secret` (voir `schema.sql`).

### Étape 2 — Le compte administrateur
```bash
ADMIN_USERNAME=admin ADMIN_NAME="Nom affiché" ADMIN_PASSWORD="mot-de-passe-6-caractères-minimum" node supabase/create_admin.mjs
```
Lance le SQL affiché dans Supabase. **L'identifiant `user-admin-1` est attendu par le site : ne pas le changer.** Ne garde ni le mot de passe ni le SQL dans un fichier.

### Étape 3 — Les fonctions du serveur
1. **Cloudinary** : dans `supabase/functions/df-api/index.ts`, change la ligne `const CLD_CLOUD = "dirnrsy5v";` par le *cloud name* du propriétaire (ligne ~32). Elle sert à vérifier que les photos viennent bien de son Cloudinary. Pousse sur GitHub.
2. **Fuseau horaire** : le serveur compte en **UTC+3** (Madagascar : fonctions `dayOf`, `inShiftWindow`, `attendanceDay` dans `df-api/index.ts`). Si le pays est différent, change `3 * 3600 * 1000` et `+ 180` en conséquence.
3. Déploie **`df-api`** et **`df-restore`** avec **`verify_jwt = false`** (le serveur gère lui-même les sessions). Deux méthodes :
   - **Dépôt public (simple)** : déploie un petit fichier `index.ts` par fonction qui charge le code depuis ton dépôt, à un commit précis :
     ```ts
     import "https://raw.githubusercontent.com/<PROPRIÉTAIRE>/<DÉPÔT>/<COMMIT_SHA_COMPLET>/supabase/functions/df-api/index.ts";
     ```
     (idem avec `df-restore`). Pour mettre à jour : pousser, puis redéployer le petit fichier avec le nouveau commit. Retour en arrière : redéployer avec l'ancien commit. Vérifie avant que `curl https://raw.githubusercontent.com/.../index.ts | sha256sum` est identique au fichier local.
   - **Dépôt privé** : déploie le contenu complet des deux fichiers.
4. **Test sans navigateur** :
   - `POST https://<ref>.supabase.co/functions/v1/df-api/login` avec `{"username":"zz","password":"x"}` → **401** `{"error":"Pseudo ou mot de passe incorrect."}` (le serveur tourne et lit la base).
   - Même appel avec l'admin créé à l'étape 2 → **200** avec un `token`.

### Étape 4 — Le site (Vercel)
1. Nouveau projet Vercel → importer le dépôt. Framework **Vite**, commande `npm run build`, dossier de sortie `dist`.
2. Variable d'environnement **obligatoire** : `VITE_SUPABASE_URL = https://<ref>.supabase.co` (voir `.env.example`). Puis redéployer.
3. Ouvre le site, connecte-toi avec l'admin.
4. **Avertissement** : à la première connexion de l'admin, si la base n'a aucun poste, le site crée **50 postes d'exemple** (clients inventés, dans `src/db/initialData.ts`). Soit tu remplaces ce fichier par la vraie liste (ou une liste vide : voir `store.ts`, recherche `AVAILABLE_CLIENT_CONTRACTS`), soit l'admin les supprime avant le lancement.

### Étape 5 — Adapter le site au nouveau projet
Le code actuel parle de « Delta Force », de « Booster » et de « Poste ». Recherche ces mots (`grep -rn "Delta Force\|DELTA FORCE\|Booster\|booster\|Poste" src index.html public/manifest.webmanifest`, environ 37 fichiers) et remplace-les par les mots du nouveau projet. Vérifie aussi :
- `index.html` (titre), `public/manifest.webmanifest` (nom de l'app), les icônes dans `public/`, les fonds `public/bg-*.svg` ;
- `src/utils/imageUtils.ts` (`generateDeltaForceScreenshot`, image générée avec le nom du jeu) ;
- devise « Ar », moyens de paiement (MVola, Orange Money…) : réglables dans **Réglages** du site, sans code ;
- le calcul de paie par « million de points » (`price_per_million`) est propre au projet d'origine : à adapter ou à garder selon le métier.
Garde la structure et les identifiants internes (`df_`, `employee`, `admin`) : seuls les **textes affichés** changent.

### Étape 6 — Contrôle final (à cocher avec le propriétaire)
- [ ] Connexion admin OK ; l'ancien projet n'est pas touché (rien ne s'écrit dans l'ancienne base).
- [ ] Création d'un employé de test, connexion avec lui.
- [ ] Messagerie : message, réponse, groupe, suppression.
- [ ] Envoi d'une photo (Cloudinary) : l'image s'affiche.
- [ ] Réglages → « Restauration du site » : enregistrer le Gmail de l'admin, recevoir le code par mail (ne **pas** lancer la remise à zéro).
- [ ] `npm run build` sans erreur ; HANDOVER de la copie réécrit pour le **nouveau** projet.

## 4. Après la mise en place
- Remplace dans `LIRE_EN_PREMIER.md` les liens de l'ancien projet (dépôt, site, Supabase, Vercel) par ceux du nouveau.
- Écris un `HANDOVER.md` pour le nouveau projet (l'ancien est un bon modèle : état, travail restant, pièges). Garde l'ancien sous le nom `HANDOVER_ANCIEN_PROJET.md` si utile.
- Rappelle au propriétaire de **supprimer les tokens** après le travail : https://github.com/settings/tokens

## 5. Pièges connus (hérités de l'ancien projet)
- Ne jamais changer l'id `user-admin-1`.
- Les tables sont fermées au public : toute lecture/écriture passe par `df-api`. Pour déboguer, utilise le connecteur Supabase (`execute_sql`), pas le navigateur.
- Les mots de passe sont stockés avec `scrypt` (format `scrypt$sel$hash`) : ne les écris jamais en clair dans la base.
- Resend sans domaine : mails seulement vers l'adresse du compte Resend.
- Photos : seules les images vont sur Cloudinary ; les PDF et textes vont dans le dossier `df-files` de Supabase.
- Après chaque mise en ligne, le site ouvert se recharge seul (`/version.json`, voir `HANDOVER.md`).
