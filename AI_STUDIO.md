> **Lis d'abord `LIRE_EN_PREMIER.md`** (règles de BTK, lien du token, ordre de lecture), puis ce fichier, puis `HANDOVER.md`.

> # ⛔ STOP — LIS CE FICHIER EN ENTIER AVANT TOUTE ACTION
> Si tu es une IA (AI Studio, Claude, ChatGPT, Gemini, Cursor, Copilot...) : ne modifie rien, ne propose rien, tant que tu n'as pas lu ce fichier jusqu'au bout.
> **Règle d'or :** avant d'écrire du code, fais un court résumé de ton plan et **attends que BTK écrive « GO »**.

# AI_STUDIO.md — Lis ce fichier AVANT toute modification

Ce document explique **Gestion Pro** (dépôt `BTKzeyrox/Nprojet`) pour qu'un assistant puisse travailler seul sans casser le site. État détaillé : `HANDOVER.md`, `PROJET.md`, `TODO.md`.

## 1. Le projet
**Gestion Pro** : gestion du travail à la tâche (projet de démonstration pour le CV de BTK). Ce n'est plus un site de jeu : plus de « Delta Force », « booster », « poste ».
- **Missions** : le responsable en crée (tableau À faire / En cours / À valider), 5 types de mission, guides « Comment faire ? ».
- Un opérateur prend une mission, envoie ses preuves (photos, fichiers) au début et à la fin ; l'admin valide ou refuse (motif obligatoire).
- **Actualités** (publications avec fichiers, validation par l'admin), **messagerie** (privé, groupes, fichiers, compression optionnelle), **calendrier** de présence, équipe, historique, journal des erreurs, réglages.
- **Inscription** depuis la page de connexion ; l'admin accepte ou refuse. « Mot de passe oublié » et modification de profil passent aussi par l'admin.
- Français et anglais, thème clair/sombre, taille de police réglable.

## 2. Les rôles
- **admin** : voit tout, valide/refuse, gère les comptes, règle l'appli.
- **employee** (affiché « opérateur ») : voit et prend des missions, envoie ses preuves, publie, écrit. Ne modifie que ses propres données.

Correspondance avec le code (noms internes gardés) : mission = `ClientContract` (`client_name` = titre, `post_type` = un des 5 types) ; session de mission = `PostSession` (`pending_start | active | pending_end | completed | rejected`) ; store = `DeltaForceStore` (`db`).

## 3. Où est quoi
| Élément | Où |
|---|---|
| Site (React 19 + Vite + Tailwind v4 + TS) | GitHub `BTKzeyrox/Nprojet`, branche `main` |
| Hébergement | Vercel (republié à chaque push sur `main`) |
| Serveur | Supabase Edge Function `df-api` — `supabase/functions/df-api/index.ts` |
| Base de données | Supabase, projet `nprojet` (id `fvkusbdhetxleimtdzqm`) |
| Fichiers | Cloudinary (secours : Supabase Storage), 10 Mo max par fichier |

Le site ne parle au serveur que par **`src/db/store.ts`** (une seule porte d'entrée).

## 4. Comment les données circulent
- Le store garde les données en mémoire et les envoie au serveur après chaque modification.
- Toutes les 5 secondes, il récupère les changements des autres utilisateurs.
- Connexion : pseudo + mot de passe vérifiés par le serveur. Le jeton de session est gardé dans le navigateur.
- Le serveur applique les droits : un employé ne peut pas modifier les données d'un autre.

## 5. Les tables Supabase
Chaque table `df_*` contient : `id` (texte), `data` (JSON), `updated_at`.
- `df_users` : comptes (admin et employés)
- `df_posts` : sessions de mission (début, fin, preuves, statut)
- `df_contracts` : les missions
- `df_security_logs` : alertes de sécurité
- `df_advances` : ancien module d'avances (plus dans le menu)
- `df_messages` : messagerie
- `df_credentials` : pseudo et mot de passe chiffré. **Jamais envoyé au site.**
- `df_settings` : Réglages généraux (une seule ligne `general`) ; contient aussi `company` (Conditions de l'entreprise, module 0) et `company_log` (historique, écrit par le serveur, admin seulement)
- `df_resets` : demandes de mot de passe oublié en attente (mot de passe déjà chiffré)
- `df_signups` : inscriptions en attente (mot de passe déjà chiffré)
- `df_profile_requests` : modifications de profil en attente
- `df_groups` : groupes de la messagerie · `df_news` : publications des Actualités
- `df_cash` : paiements reçus et dépenses (**admin seulement**, créée le 2026-10-19)
- `df_products` et `df_stock_moves` : produits et mouvements de stock (**admin seulement**, créées le 2026-10-20)
- `df_clients` : fiches clients (**admin seulement**, créée le 2026-10-20, module 1). Aucun statut stocké : il se calcule (`src/utils/clients.ts`). Les missions et sessions peuvent porter un `client_id` (jamais envoyé à un opérateur).
- `df_suppliers` et `df_purchase_orders` : fournisseurs et bons de commande (module 4, migration `20261021_create_df_suppliers_purchases.sql`, même modèle que `df_cash` : RLS, aucun droit pour `anon` ni `authenticated`). Admin seulement (`ADMIN_ONLY_READ` et `ADMIN_ONLY_WRITE`) ; un fournisseur utilisé ne se supprime pas côté serveur. Retour en arrière : tables vides au départ, `drop table` écrit dans la migration.
- `df_audit` : journal d'audit (M7.2, créée le 2026-10-23, migration `20261023_create_df_audit.sql`). Une ligne = une action de l'admin ; **jamais envoyée par `state` ni `sync`** (absente de `T`), lue seulement par la route `audit-list` (admin). Gardée 12 mois (purge dans `maybePurge`). Prise par la sauvegarde de nuit ; la remise à zéro n'y touche pas.
- `df_push_subs` / `df_push_log` : appareils abonnés aux notifications et rappels déjà envoyés (créées le 2026-10-22, M6.4). Clés VAPID et secret du rappel dans le coffre-fort (`push_vapid_public`, `push_vapid_private`, `push_cron_secret`, via `df_push_get_secret` / `df_push_set_secret`). Tâche pg_cron `df-push-due` (toutes les 15 min) → route `push-due` de df-api. Le sujet VAPID est l'adresse GitHub du projet (pas d'e-mail personnel).
- `df_backups` : sauvegardes (de nuit à 23 h UTC, 14 jours, et à la demande) ; `df_take_backup()` prend toutes les tables `df_*` sauf `df_backups`, `df_presence`, `df_restore`, `df_errors` (22 tables au 2026-10-22). La remise à zéro (`df-restore`) ne touche **pas** à `df_cash`, `df_products`, `df_stock_moves` ni `df_clients`.
- Fonction SQL `df_rename_employee` (met à jour le nom sur les sessions après une modification de profil validée)

## 6. Structure du code
- `src/App.tsx` : écran principal et navigation
- `src/db/store.ts` : données + synchronisation avec le serveur
- `src/db/initialData.ts` : données de départ
- `src/views/` : `LoginView` (connexion, inscription, mot de passe oublié), `admin/AdminDashboard` (Accueil à cartes), `admin/ClientsPage` (Clients), `admin/SettingsView` (Réglages), `admin/EmployeesManagement`, `employee/EmployeeDashboard`, `CalendarView`
- `src/components/` : `PostsGrid20` (tableau Kanban des missions), `MissionGuide` (guides), `ChatView` (messagerie), `ScoreInput` (champs de score `20.467M`), `Sidebar`, `Navbar`, fenêtres (photos, profil, détails du jour)
- `src/utils/i18n.ts`, `enTranslate.ts`, `enDict.json` : français et anglais (tout nouveau texte visible doit avoir sa version anglaise)

- **Police du texte : Poppins, décidée par `--font-sans` (bloc `@theme` de `index.css`).** Les conteneurs principaux portent `font-sans` ; changer `font-family` de `body` ne suffit PAS. Les fichiers sont dans `public/fonts` (hébergés, licence OFL) ; `font-tactical` et `font-mono` héritent. Ne pas rajouter de police chez Google Fonts sauf pour le chinois.
- **`truncate` et `line-clamp` ne font RIEN (ne pas compter dessus).** `index.css` (« Mots jamais coupés ») les neutralise avec `!important` dans toute l'application, voulu par BTK : un texte s'affiche en entier. Pour un aperçu qui ne doit jamais grandir (liste de conversations, par exemple), utiliser un style en ligne `{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }` SANS la classe `truncate` (voir `ONE_LINE` dans `ChatView.tsx`).
- **Défilement de la page (ne pas casser).** `useLockBodyScroll` fige la page derrière une fenêtre (position fixe sur téléphone seulement ; sur ordinateur et tablette il ne touche à rien). `scrollRescue.ts` (installé dans `main.tsx`) est un filet de sécurité : si un geste de l'utilisateur (molette, pavé tactile, clavier, doigt) ne fait pas bouger une page qui pouvait défiler, il la fait défiler lui-même ; il ne fait rien sous une fenêtre, sur un élément fixe, dans une liste qui défile seule, dans un champ de saisie. `html` garde `overflow-x: hidden` mais `body` doit rester en `overflow-x: clip` (jamais `hidden` sur les deux : `body` deviendrait un 2e conteneur de défilement, piège de Chrome Android). Le filet décide « le défilement normal marche » grâce aux événements `scroll` du navigateur, pas à la position de la page lue au moment du geste. Un blocage de défilement chez BTK n'a jamais été reproduit hors de chez lui : `?diag=1` dans l'adresse affiche un panneau de diagnostic (dont « secours du défilement : intervenu N fois »). Essais navigateur : `scripts/browser/*.py` (Playwright, à lancer à la main).

## 7. INTERDIT
- Ne remets **pas** Firebase, Express, `server.ts`, Drizzle, Cloud SQL ni un dossier `api/`.
- N'ajoute **aucune** variable d'environnement : Vercel n'en a pas besoin.
- Ne supprime pas la connexion par pseudo + mot de passe.
- Ne remets pas les boutons « ZIP », « SQL » ou « base de données » dans l'interface.
- N'écris **jamais** de mot de passe, clé ou token dans le code ou dans ce repo.
- Ne change pas les tables Supabase sans l'accord de BTK. Le code de `df-api` peut être modifié dans le repo, mais il doit ensuite être redéployé (voir section 9).

## 8. Comment travailler
1. Récupère d'abord la dernière version depuis GitHub (pull).
2. **BTK a choisi de pousser directement sur `main`** (plus de branche `studio` ni `design`). Chaque push republie le vrai site : fais un petit changement à la fois et vérifie le build avant de pousser.
3. Vérifie que `npm run build` passe sans erreur.
4. Ne travaille pas en même temps que quelqu'un d'autre sur les mêmes fichiers.
5. Ne pousse rien sans le « GO » de BTK. Dis honnêtement ce que tu n'as pas pu vérifier (tu ne vois pas son écran).

## 9. Le serveur `df-api` (Supabase)
Code : `supabase/functions/df-api/index.ts` (Deno, une seule fonction ; v7 au 2026-10-18 = commit 5466b76, retour en arrière v7 → v6 : commit a7df26d ; vérifie la version réelle avant de redéployer). **Au 2026-10-20 : v10 en ligne = commit `9a88594`** (sauvegarde n° 9 prise avant ; fichier GitHub comparé au dépôt : identique ; `verify_jwt` désactivé). Historique et retour en arrière, du plus récent : **v10 = 9a88594** → v9 = `6c1fe78` (stock) → v8 = `eb7129a` (finances `cash`) → v7 = `5466b76` (sauvegardes) → v6 = `a7df26d`. Déploiement : petit fichier `index.ts` d'une ligne qui importe `https://raw.githubusercontent.com/BTKzeyrox/Nprojet/<SHA complet>/supabase/functions/df-api/index.ts`, `verify_jwt: false`. **Finances, produits et stock** (`cash`, `products`, `stock`) : lecture et écriture réservées à l'admin, chaque ligne revérifiée par le serveur. **v10, bloc `BEGIN PRIVACY`** : un employé ne reçoit jamais les prix client (`client_price_default_ar`, `client_prices_by_type`, `client_price_ar` des missions et sessions), les objectifs (`goal_*`) ni les seuils d'alerte (`alert_*`), et ne peut pas écrire un prix client. Nouveaux réglages dans `df_settings` (ligne `general`) : `goal_missions`, `goal_profit_ar`, `goal_max_expenses_ar`, `alert_unpaid_days`, `alert_low_cash_ar`. Fichiers de la phase 4 : `src/utils/goals.ts`, `alerts.ts`, `alertsDb.ts` (avec cache), `report.ts`, `statsNav.ts`, `src/components/GoalsPanel.tsx`, `src/views/admin/ReportTab.tsx`. Moteur d'alertes du module 11 : `src/utils/health/` (types, registre ; contrôle `npm run check:health`). Contrôles : `npm run check:phase4`, `check:cash`, `check:stock`, `check:phase2` (voir `package.json` pour la liste). Routes publiques : `login`, `forgot`, `signup`. Routes avec session : `state`, `sync` (la suppression d'un employé y efface aussi toutes ses données : `purgeEmployee`), `create-user`, `set-password`, `logout`, `reset-decision`, `signup-decision`, `upload`, `profile-request`, `profile-decision`, `backups`, `backup-get`, `backup-now` (admin, sauvegardes de nuit).
- **Bloc `COMPANY` (module 0, déployé le 2026-10-20 : v11 = commit `cf098bd`, sauvegarde n° 10 prise avant ; retour en arrière = v10 = `9a88594`).** Les Conditions de l'entreprise vivent dans `df_settings` > `company` (pas de nouvelle table). À chaque écriture de l'admin, `cleanSettingsRecord` revérifie chaque champ (une valeur fausse garde l'ancienne), écrit `company_log` (100 lignes max, date et auteur posés par le serveur) et ignore tout journal envoyé par le navigateur. Un employé reçoit seulement `company.leave` et `company.texts.internal_rules` (`stripCompany`), jamais le journal. Le code de ce bloc vient de `src/utils/companyRules.ts` ; `npm run check:company` vérifie que site et serveur donnent les mêmes résultats. Écran : `src/components/CompanyConditions.tsx` (onglet Réglages > Conditions pour l'admin, bloc en lecture seule dans les Réglages de l'opérateur). **Règle : l'enregistrement général de `SettingsView` ne doit jamais renvoyer `company` ni `company_log` (une vieille copie écraserait les Conditions).** Contrôles : `check:company`, `check:company-page`.
- **Bloc `CLIENTS` (module 1, M1.3, déployé le 2026-10-20 : v12 = commit `32b386d`, sauvegarde n° 12 prise avant ; retour en arrière = v11 = `cf098bd`).** Collection `clients` (table `df_clients`) : lecture et écriture réservées à l'admin, chaque fiche revérifiée par `cleanClient`. Un opérateur ne reçoit jamais `client_id` (retiré avec le prix client par `withoutClientPrice`), ne peut pas l'écrire (une session garde le `client_id` d'origine). Un lien mission/session → client est refusé si la fiche n'existe pas ; un client qui a des missions ou des sessions ne se supprime pas (`in_use`). Contrôle : `npm run check:clients-server`. **Seuils des statuts (M1.3b, v13 = commit `5ba6037`, sauvegarde n° 13 ; retour en arrière = v12 = `32b386d`)** : section `clients` de `df_settings` > `company` (7 seuils réglables dans Réglages > Conditions, mêmes règles site et serveur, `check:company`) ; `clientThresholds()` dans `src/utils/clients.ts` les lit. **M1.4 (v14 = commit `d8c9438`, sauvegarde n° 14 ; retour en arrière = v13 = `5ba6037`)** : page `src/views/admin/ClientsPage.tsx` (menu admin « Clients »), règles dans `src/utils/clients.ts`, méthodes `addClient` / `updateClient` / `setClientActive` / `deleteClient` du store ; `cleanClient` refuse un tableau, un booléen ou un texte vide comme nombre. Contrôles : `check:clients`, `check:clients-server`, `check:clients-page`.
- **Bloc `AUDIT` (module 7, M7.2, déployé le 2026-10-23 : v22 = commit `7b100c5`, sauvegarde n° 25 ; retour en arrière = v21 = `dbdfb6a`).** Règles dans le bloc (copie de `src/utils/auditRules.ts`, comparée par `check:audit`) ; `auditLog(me, action, cible, détail)` n'échoue jamais (une erreur est seulement écrite dans la console, la route continue) ; route `audit-list` (GET, admin, 300 lignes par défaut, 1000 au plus). Points de journal : `invoice-issue`, `invoice-cancel`, `invoice-pay`, `create-user`, `set-password`, `profile-decision`, `reset-decision`, `signup-decision`, `payroll-close`, `payroll-reopen`, `payroll-pay`, `backup-now`, et dans `sync` : suppressions de l'admin, tarifs (réglages, missions, produits), réglages, Conditions (noms de champs seulement). **Avant de redéployer :** prendre une sauvegarde et repartir du fichier complet du dépôt (section 12).
- **Blocs `HR`, `LEAVES` et `REVIEWS` (module 5, déployés : `HR` et `LEAVES` en v26 = commit `2fd5db6` ; `REVIEWS` le 2026-10-24 en v29 = commit `fcdb007978934f72bc628f9683cbaa2e32536b37`, sauvegarde n° 35 prise avant ; retour en arrière = v28 = `de4739b29a07a6e60484429863f050b711308c9d`).** Dossier salarié : champ `hr` de la fiche du compte (`df_users`, aucune table), retiré par `stripUser` pour tout compte autre que l'admin et le salarié concerné, revérifié à chaque écriture de l'admin (`cleanHrFile`, refus `hr_…`). Congés : table `df_leaves` (migration `20261023_create_df_leaves.sql`) ; `cleanLeave` calcule les jours ouvrés, applique solde annuel, chevauchements et transitions ; un salarié ne reçoit que ses demandes. Évaluations : table `df_reviews` (migration `20261024_create_df_reviews.sql`, vide au départ, RLS, aucun accès public ; retour en arrière : `drop table public.df_reviews;`) ; `cleanReview` ; un salarié ne reçoit que SES fiches PARTAGÉES **sans le champ `improvements`** (retiré dans `state`), et ne peut qu'accuser lecture ; supprimer un compte efface ses congés et ses fiches. Règles du site : `src/utils/hrFile.ts`, `leaves.ts`, `reviews.ts` (copies exactes dans `df-api`, comparées par `check:hr`, `check:leaves`, `check:reviews`). **Non vérifié à ce jour : un vrai appel sur le serveur v29 (aucun appel dans les journaux juste après le déploiement).**
- **Bloc `QUOTES` (module 2, M2.9, déployé le 2026-10-23 : v24 = commit `7360fcc` de la branche `deploy-df-api-quotes`, sauvegarde n° 29 prise avant ; retour en arrière = v23 = `fa65647`).** Table `df_quotes` (migration `20261023_create_df_quotes.sql`, vide au départ, RLS, aucun accès public). `cleanQuote` réutilise `cleanInvoice` (client, lignes, totaux recalculés avec la TVA actuelle) ; Brouillon → Envoyé → Accepté ou Refusé, contenu figé dès l'envoi (lignes, client, dates, totaux d'origine gardés) ; seul un devis accepté peut citer une facture (`invoice_id`, qui doit exister) ; suppression seulement brouillon ou refusé non facturé ; un client qui a des devis ne se supprime pas ; `quotes` est une collection d'argent (admin et Comptable). Règles du site : `src/utils/quotes.ts` ; contrôle : `npm run check:quotes` (33) et `check:quotes-page` (40). **v24 n'est PAS le `index.ts` de `main`** : `main` contient en plus les blocs HR, LEAVES et PERFORMANCE non déployés.
- **Bloc `PUSH` (module 6, M6.4, déployé le 2026-10-22 : v18 = commit `28f47c7`, sauvegarde n° 20 ; retour en arrière = v17 = `2a3fa70`).** Règles (`src/utils/pushRules.ts`, copiées dans le bloc et comparées par `check:push`) + chiffrement Web Push RFC 8291 et signature VAPID en WebCrypto (testés contre l'exemple officiel). Routes : `push-key`, `push-subscribe`, `push-unsubscribe`, `push-test` (connecté) et `push-due` (avant connexion, protégée par le secret `x-cron-secret`). Notifications d'événements envoyées après un changement de statut de session par le responsable (dans `sync`). Abonnements morts (404/410) supprimés ; 5 appareils max par personne ; journal purgé après 30 jours. Non testé sur un vrai téléphone.
- **Bloc `MISSIONS` (module 6, M6.1, déployé le 2026-10-21 : v15 = commit `351e80f`, sauvegarde n° 16 prise avant ; retour en arrière = v14 = `d8c9438`).** `cleanMissionDeadline` revérifie chaque mission écrite par l'admin : `due_date` vraie date AAAA-MM-JJ (2000 à 2100), `due_time` HH:MM seulement avec une date, `priority` Normale / Haute / Urgente ; un champ vide est retiré ; refus `mission_date`, `mission_time`, `mission_priority`. Règles du site : `src/utils/deadlines.ts` ; contrôle : `npm run check:deadlines` (compare site et serveur) et `check:deadlines-store`. **Modèles de mission (M6.2, v16 = commit `78dfcff`, sauvegarde n° 17 ; retour en arrière = v15 = `351e80f`)** : `cleanMissionTemplates` revérifie `mission_templates` dans le record de réglages (30 au plus, nom unique, justificatif parmi type / none / photo / note / both, clés dangereuses refusées) ; la clé est dans `SETTINGS_ADMIN_KEYS` (jamais envoyée à un employé). Règles du site : `src/utils/missionTemplates.ts` ; contrôles : `check:templates`, `check:templates-store`. **Liste de tâches (M6.3, v17 = commit `2a3fa70`, sauvegarde n° 19 ; retour en arrière = v16 = `78dfcff`)** : `cleanMissionTasks` (mission : `tasks` 20 au plus, `tasks_required` booléen, exigence refusée sans tâche), `cleanTasksDone` (cases d'une session limitées aux tâches de la mission, lues dans `df_contracts` par `post_number`), `tasksBlockSubmit` (un opérateur qui envoie la fin d'une mission qui exige tout coché est refusé : raison `tasks`). Règles du site : `src/utils/taskList.ts` ; contrôles : `check:tasks`, `check:tasks-store`.
- Il n'a besoin d'aucun secret dans le code : Supabase lui fournit `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` automatiquement. La clé de session est calculée à partir de la clé de service.
- **Modifier le fichier dans GitHub ne change PAS le serveur en ligne.** Il faut le redéployer :
  - Soit dans le tableau de bord Supabase : projet `nprojet` → Edge Functions → `df-api` → coller le nouveau code → Deploy.
  - Soit en ligne de commande : `supabase functions deploy df-api --no-verify-jwt --project-ref fvkusbdhetxleimtdzqm`
- **Garde « Verify JWT » désactivé** : la fonction fait sa propre vérification (jeton de session maison).
- Si une route change, mets à jour `src/db/store.ts` dans le même travail.
- Le compte `admin` existe déjà (son mot de passe de départ doit être changé). Ne remets jamais de mot de passe dans le code.

## 10. Ce qu'il ne peut pas faire seul
- Créer ou changer les tables Supabase : demander à BTK, ou passer par une migration SQL validée par lui.
- Changer le mot de passe de l'admin : depuis la page Équipe.
- Si une modification demande un nouveau champ de données, la décrire à BTK avant de coder : le serveur doit être adapté et redéployé en même temps.

## 11. Style
- Textes de l'interface courts, en mots simples.
- Rien ne doit être coupé sur téléphone : les textes passent à la ligne.
- Pas de montants en Ar dans l'interface (l'ancien module de paie n'est plus affiché).

## 12. Avant de redéployer `df-api`
Repars toujours du fichier du repo (contenu complet) : un fichier incomplet supprimerait des routes en ligne.

## Module 3 — Performance (état au 2026-10-23)
- Règles pures : `src/utils/performanceScore.ts` (`npm run check:badges`). Branchement : `src/utils/usePerformance.ts` (calcul dans le navigateur, `badgeAccess()` = réglages Badges, accès **fermé par défaut** pour un salarié, `canSeeProfileBadges`).
- Écrans : `src/views/admin/PerformanceScores.tsx` (onglet « Scores et badges »), `src/components/MyPerformance.tsx` (menu `my-performance`, opérateur), `src/components/PerformanceBadges.tsx` (puces, anneau, fiche). Contrôle : `npm run check:performance-page`.
- Vie privée : l'opérateur ne voit que son score ; détail du score et points d'attention seulement si `employee_sees_attention`. `companyForEmployee` envoie 3 oui/non des badges (site **et** `df-api`) : à redéployer.
- Réglages : `src/components/PerformanceSettings.tsx` (Réglages > Performance), stockés dans `df_settings` > `performance` ; bloc `PERFORMANCE` de `df-api` (copie de `cleanPerformanceConfig`, comparée par `npm run check:performance-config`). **Déployé** (`df-api` v26 = `2fd5db6`, 2026-10-23).
- Module 3 terminé : clients `src/utils/clientBadges.ts` + `src/components/ClientBadges.tsx` ; reconnaissance `src/utils/recognition.ts` + `BadgeCongrats.tsx` ; export `src/utils/performanceExport.ts`. Contrôle global : `npm run check:module3`. Essai par BTK : `ESSAI_BTK.md`.
