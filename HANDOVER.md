# HANDOVER.md : Gestion Pro (nouveau projet)

À lire après `LIRE_EN_PREMIER.md` et `NOUVEAU_PROJET.md`.
Dernière mise à jour : 2026-10-24 (voir § 11 pour l'état des modules et du serveur). Propriétaire : BTK (français, mots simples, réponses COURTES).

> Ce dépôt est une COPIE de `BTKzeyrox/DF-boosting` (site de jeu Delta Force). L'ancien projet reste intact là-bas, en lecture seule : **ne jamais y écrire**. L'ancien HANDOVER (histoire de l'ancien site) a été retiré de ce dépôt. Il reste dans `DF-boosting` et dans l'historique git de ce dépôt.

## 0. Règles de travail avec BTK
1. Récap court d'abord, puis attendre « GO ». Un document de texte demandé clairement est permis sans GO.
2. Pousser seulement sur `BTKzeyrox/Nprojet`, branche `main`. Avant chaque envoi : `git remote -v` (jamais `DF-boosting`).
3. Un commit clair par sujet. `npm run build` doit passer avant chaque envoi.
4. Réponses courtes, en français, mots simples.
5. Aucun mot de passe, clé ou token dans le dépôt. BTK les donne dans le chat.
6. Avant d'effacer des données : demander une confirmation précise.
7. Dire honnêtement ce qui est fait, testé, ou non testé. Ne jamais écrire « c'est fait » sans vérifier.

## 1. Le but du projet
BTK cherche un premier poste informatique ou administratif, sans expérience (CV : Bac 2023, 2 ans de développement web non terminés, bureautique, saisie, maintenance de base). Ce site sert de **vitrine pour son CV** : il montre qu'il sait utiliser un outil de gestion de saisie et de tâches, avec contrôle qualité.

**Honnêteté (décision de BTK et de Claude)** : le site a été conçu avec l'aide d'une IA. Pour le CV et les entretiens, la phrase vraie est : « J'ai conçu et testé ce site avec un assistant IA ; j'ai choisi les fonctions et je sais l'utiliser. » Ne jamais écrire « codé seul ». BTK doit pouvoir expliquer le but de chaque page et faire une démo.

## 2. Nouveau nom et nouveau produit
- **Nom : Gestion Pro.** Un outil de gestion du travail à la tâche, valable pour plusieurs métiers. Plus de jeu, plus de « Delta Force ».
- **Un seul site, le responsable gère tout.**

### 2.1 Les 5 types de mission (choix de BTK : « les 5 »)
| Type | Pour quel poste d'entrée | Ce qui change |
|---|---|---|
| Saisie de fiches | opérateur de saisie, agent de traitement de données, back-office | formulaire de saisie, détection d'erreurs (champ vide, doublon, mauvais format) |
| Contrôle qualité | agent de contrôle | relit les fiches saisies, valide ou refuse avec un motif |
| Tâche administrative | assistant administratif | classer des fichiers, remplir un tableau, rédiger un courrier ; justificatif joint |
| Demande d'aide (support) | technicien support niveau 1, maintenance | demande reçue, prise en charge, note de ce qui a été fait, clôture |
| Tâche web | assistant web junior | livre un lien ou un fichier, le responsable valide |

### 2.2 Comment ça marche
- Le **responsable** crée une mission, choisit son **type**, puis l'assigne à un opérateur ou la laisse libre.
- **Parcours commun** : à faire, en cours, à valider, validée ou refusée (motif obligatoire au refus).
- Chaque opérateur a un **profil** (par exemple Saisie ou Support) et ne voit que les types qui le concernent. Le responsable voit et gère tout.
- **Missions libres** (titre, description, échéance) à la place de la grille fixe de 20 « postes ».
- **Communs à tous** : tableau de performance (missions faites, taux d'acceptation, délais), export Excel/CSV, calendrier (échéances), messagerie.
- **Vacations Jour/Nuit** : gardées en option.
- **Paie à 1M score = 1 000 Ar : retirée** (elle vient du jeu). Elle devient un **suivi de rendement**, sans paie en ariary.

### 2.3 Accueil : fil d'actualité
- La page d'accueil des postes est remplacée par un **fil d'actualité** (publications).
- Sur chaque publication : **une seule réaction « J'adore »**, des **commentaires**, un **partage** (copier le lien ou partage du téléphone).
- **Seul le responsable publie.** Les opérateurs réagissent et commentent.
- **10 publications de départ**, écrites par le responsable (Claude les écrit, BTK les relit avant mise en ligne).
- Options proposées, à confirmer par BTK : publication épinglée, notification simple, suppression d'un commentaire par le responsable.
- Ne pas ajouter : plusieurs types de réactions, photos dans les commentaires.

## 3. Vocabulaire (textes affichés seulement)
| Ancien | Nouveau |
|---|---|
| Delta Force, DELTA FORCE // BOOSTING OPS | Gestion Pro |
| Booster, employé | Opérateur (ou Collaborateur) |
| Poste | Mission |
| Shift Jour/Nuit | Vacation Jour / Nuit |
| Preuve, capture | Justificatif |
| Admin (texte affiché) | Responsable |
| Score, million de points | Production, rendement |

Garder les noms internes du code (`df_`, `employee`, `admin`, `user-admin-1`) : seuls les **textes affichés** changent. Rechercher : `grep -rn "Delta Force\|DELTA FORCE\|Booster\|booster\|Poste" src index.html public/manifest.webmanifest`.

À vérifier aussi : `index.html` (titre et écran de démarrage « BTK »), `public/manifest.webmanifest`, les icônes, `public/bg-*.svg`, `src/utils/imageUtils.ts` (`generateDeltaForceScreenshot`), les textes chinois (`src/utils/zhDict.json`, à adapter ou garder).

## 4. Design
Sobre et professionnel : fond clair, bleu marine (comme l'en-tête du CV de BTK), une seule police, grands boutons, tableaux lisibles, bon sur téléphone. Plus de fonds ni d'images de jeu.

## 5. Pour le CV de BTK (livrables prévus)
- Une **fiche d'explication** dans le dépôt : à quoi sert chaque page, le déroulé d'une démo (connexion, saisie d'une fiche, erreur détectée, validation, export Excel), et 10 questions de recruteur avec réponses.
- Un **compte de démonstration**.
- Une phrase honnête pour le CV, à la place de « petits tests et maquettes ».
- Séances d'entraînement : Claude pose les questions de recruteur une par une.
- Postes visés d'abord : saisie, assistant administratif, support informatique niveau 1 (éviter les postes très oraux : le CV dit que BTK s'exprime mieux par l'action). BTK doit regarder les offres de Toliara et donner les titres qui reviennent.

## 6. État de la mise en place (étapes de `NOUVEAU_PROJET.md`)
**Fait (étapes 0 à 4)**
- Copie poussée sur `Nprojet`. Source : `DF-boosting` au commit `e4496e86`. Commit de départ : `c75f4c2`.
- Supabase `nprojet` : ref `fvkusbdhetxleimtdzqm`, région `ap-south-1`. 18 tables `df_*`, seed, dossier `df-files`.
- Compte `admin` créé.
- `df-api` et `df-restore` déployées avec `verify_jwt = false`, chargées depuis le commit `c75f4c21a4091532a99c282764866ec2b17ccca0`.
- 3 clés dans le coffre-fort Supabase (Cloudinary clé, Cloudinary secret, Resend). Cloud name Cloudinary : `dirnrsy5v`.
- Site sur Vercel : https://nprojet-beta.vercel.app avec `VITE_SUPABASE_URL = https://fvkusbdhetxleimtdzqm.supabase.co`.

**Pas encore fait (mis à jour le 2026-10-11, voir aussi `TODO.md`)**
1. **Test de connexion `admin`** : jamais confirmé (le réseau de Claude n'atteint pas `supabase.co`). À tester par BTK.
2. **Fait depuis** : mots, nom, design, missions libres, 5 types, fil d'actualité, Kanban, nettoyage du menu et des Réglages (voir `git log`). Tout est non testé à l'écran.
3. **Postes d'exemple** : la base `nprojet` ne contient que 10 missions Gestion Pro, aucun poste Delta. Rien à supprimer sauf si BTK veut vider ces 10 (confirmation précise avant).
4. **Étape 6** : contrôle final avec BTK.
5. Réécrire `LIRE_EN_PREMIER.md` et `README.md` (ils citent encore l'ancien projet). `AI_STUDIO.md` et `PROJET.md` décrivent l'ancien site : à retirer ou réécrire après accord de BTK.
6. Plan §7, points 5 et 6 (tableau de performance et export, fiche CV) : non trouvés dans le code.
7. Pages Avances et Paie : retirées du menu mais encore dans le code ; décision de BTK attendue.

**Effort du code** : le passage aux missions libres avec types et au Kanban est fait.

## 7. Plan d'envoi (commits séparés, chacun après « GO »)
1. Nom et mots.
2. Design.
3. Missions libres et les 5 types.
4. Fil d'actualité (nouvelles tables, routes dans `df-api`, page d'accueil) et 10 publications.
5. Tableau de performance et export Excel/CSV.
6. Fiche d'explication pour le CV.
7. `npm run build` et contrôle final (liste de `NOUVEAU_PROJET.md`, Étape 6).

Pour la mise en ligne du serveur : pousser sur `main`, relever le commit, redéployer `df-api` (et `df-restore` si modifiée) avec un petit fichier `index.ts` qui importe le code depuis ce dépôt à ce commit (voir `NOUVEAU_PROJET.md`, Étape 3). Vérifier que l'adresse est celle de `Nprojet`, pas de `DF-boosting`.

## 8. Pièges techniques utiles (hérités du code, encore vrais)
- Ne jamais changer l'id `user-admin-1`.
- Les tables `df_*` sont fermées au public : tout passe par `df-api`. Pour déboguer, utiliser le connecteur Supabase (`execute_sql`).
- Modifier le code de `df-api` dans GitHub ne change pas le serveur en ligne : il faut le redéployer.
- Mots de passe stockés avec `scrypt` (`scrypt$sel$hash`) : jamais en clair.
- Photos : seules les images vont sur Cloudinary ; PDF et textes vont dans `df-files`.
- À la première connexion de l'admin, si la base n'a aucun poste, le site crée 50 postes d'exemple (`src/db/initialData.ts`) : à vider ou supprimer.
- Tout nouveau texte visible doit être ajouté au dictionnaire chinois (`zhDict.json`) si on garde le chinois.
- Toute fenêtre plein écran dans une page `fixed` doit passer par `createPortal(..., document.body)`.
- Ne jamais écrire `document.body.style.overflow` à la main : utiliser `useLockBodyScroll`.
- Le plan Supabase gratuit limite les appels (≈ 500 000 par mois) : la synchro du site se fait toutes les 20 s par personne connectée.
- Écrire dans le dépôt : le connecteur GitHub peut être en lecture seule. Sinon, `git` avec un token classique (`repo`, 7 jours) donné par BTK dans le chat, jamais dans un fichier.
- Après chaque mise en ligne, le site ouvert se recharge seul (`/version.json`).

## 9. Avant de partir (BTK)
- Changer le mot de passe `admin123` après la première connexion.
- Régénérer les clés Cloudinary et Resend.
- Supprimer le token GitHub : https://github.com/settings/tokens

## 10. Statistiques, finances et stock (état au 2026-10-20)
Détail et décisions : `TODO_STATISTIQUES.md` (phases 1 à 5, graphiques C1 à C4). État réel : `AI_STUDIO.md` §§ 5 et 9.
- **Fait et en ligne** : statistiques, finances (`df_cash`), stock (`df_products`, `df_stock_moves`), objectifs, alertes, prévision, rapport (Excel + impression), graphiques interactifs. `df-api` **v10 = 9a88594** (retour en arrière : 6c1fe78 = v9).
- **Règle d'argent** : tout ce qui touche à l'argent de l'entreprise est calculé dans le navigateur de l'admin et n'est jamais envoyé à un opérateur (filtre côté serveur, bloc `PRIVACY`).
- **Contrôles** : `npm run check:<nom>` (liste dans `package.json` ; tous doivent réussir avant un push). `check:demo-stats` peut échouer entre 00 h et 03 h à Madagascar si la machine est en UTC (problème de fuseau déjà présent).
- **Vérifié le 2026-10-20 (lecture seule sur `nprojet`)** : aucune ligne de démo dans la vraie base ; aucun prix client ni objectif réglé ; `df_posts` vide ; `df_cash` contient **4 lignes d'essai de BTK** (créées le 2026-10-20 à 00 h 23 heure de Madagascar : 150 000 Ar de « Iol », 20 000 Ar, deux « Achats » de 2 822 828 et 20 000 Ar) ; `df_contracts` contient 10 missions d'exemple (`contract-1` à `contract-10`, clients fictifs « Société Aina »…, sans prix). **Rien n'a été supprimé** : à supprimer seulement sur demande précise de BTK (règle n° 6, § 0).
- **Reste** : essai à l'écran par BTK (S5.1 et C4), décision sur les 4 lignes d'essai et les 10 missions d'exemple, révoquer le token GitHub (https://github.com/settings/tokens), changer `admin123`.


## 11. Modules 0 à 11 : état au 2026-10-24
Plan détaillé et décisions : `TODO_MODULES.md` ; journal : `TODO.md` ; vue d'ensemble : `PROJET.md` § 4 bis.
- **Terminés côté code et en ligne** : M0 Conditions, M1 Clients, M2 Factures et devis, M3 Performance, M4 Achats, M5 RH (dossier, congés, bulletin, évaluations), M6 Missions avancées, M7 Rôles / audit / restauration, M8.1 Direction, M8.3 Vitesse et quota (`check:speed`), M11 Admin IA Pro (M11.1 à M11.14).
- **Reste, à faire par BTK** : M8.2 essai complet sur téléphone (guide `ESSAI_BTK.md`) ; essais du module 5 ; essai de l'assistant, de la cloche et des seuils partagés ; jamais essayé avec un vrai compte Comptable ni Chef d'équipe.
- **Serveur (Supabase `nprojet`, `fvkusbdhetxleimtdzqm`)** : `df-api` **v29** = commit `fcdb007` (retour v28 = `de4739b`, v27 = `bafb412`, v26 = `2fd5db6`) ; `df-restore` v4 = `6348488` ; `df-assistant` v5 (code collé dans la fonction : `supabase/functions/df-assistant/`). une trentaine de tables `df_*` (dont `df_audit`, `df_quotes`, `df_leaves`, `df_reviews`, `df_invoices`, `df_counters`, `df_suppliers`, `df_purchase_orders`, `df_push_*`). Dernière sauvegarde de sécurité prise avant un changement : n° 35.
- **Comment on déploie `df-api`** : le fichier en ligne est un petit `index.ts` qui importe le dépôt à un commit précis (`import "https://raw.githubusercontent.com/BTKzeyrox/Nprojet/<commit>/supabase/functions/df-api/index.ts";`). Marche à suivre : 1) accord écrit de BTK ; 2) `select public.df_take_backup();` ; 3) pousser le commit ; 4) `git diff <commit en ligne> <nouveau> -- supabase/functions/df-api/index.ts` ne doit montrer QUE le changement voulu ; 5) redéployer avec le nouveau commit ; 6) écrire dans `TODO.md` le retour arrière (= redéployer l'ancien commit). Une table nouvelle = migration relue par BTK dans `supabase/migrations/`.
- **Secrets** : `GEMINI_API_KEY` (IA externe) est un secret de la fonction `df-assistant`, ajouté par BTK dans le tableau de bord Supabase. Aucune clé, aucun mot de passe ni token dans le dépôt.
- **Vraie base, vérifié le 2026-10-24 (lecture seule)** : aucune ligne de démo (aucun identifiant `demo_…`, aucun texte « Données de démonstration »). Il reste seulement les lignes d'essai de BTK (2 comptes, 10 missions, 2 clients, 4 lignes d'argent, 10 messages, 2 actualités) : à garder ou supprimer sur **confirmation précise de BTK**. Le mode démo (`?demo=admin`, `?demo=employee`) travaille en mémoire dans le navigateur et n'écrit jamais dans la base.
- **Contrôles** : `npm run check:<nom>` (liste dans `package.json`) doivent tous réussir avant un push ; seul `check:invoices-sql` échoue encore (cause : une autre session, à regarder).
- **Pour l'assistant et la Santé du site** (module 11) : règles pures dans `src/utils/health/` (une règle par fichier de `rules/`, chacune avec sa solution dans `src/utils/advice.ts`) ; assistant `src/utils/assistant.ts` + `src/components/AssistantChat.tsx` ; cloche `src/utils/healthNotif.ts` ; IA externe `src/utils/aiAssist.ts` + `supabase/functions/df-assistant/`. Pour un nouveau module : ajouter ses règles Santé (M11.12), sa fiche dans `src/utils/siteKnowledge.ts` et ses solutions dans `advice.ts`.
