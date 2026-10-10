> **Lis d'abord `LIRE_EN_PREMIER.md`** (règles de BTK, lien du token, ordre de lecture), puis ce fichier, puis `HANDOVER.md`.

> # ⛔ STOP — LIS CE FICHIER EN ENTIER AVANT TOUTE ACTION
> Si tu es une IA (AI Studio, Claude, ChatGPT, Gemini, Cursor, Copilot...) : ne modifie rien, ne propose rien, tant que tu n'as pas lu ce fichier jusqu'au bout.
> **Règle d'or :** avant d'écrire du code, fais un court résumé de ton plan et **attends que BTK écrive « GO »**.

# AI_STUDIO.md — Lis ce fichier AVANT toute modification

**État au 2026-10-06 : les livraisons A, B et C sont TERMINÉES, plus l'inscription des boosters.** Il n'y a plus de « livraison » en attente. Lis ensuite `HANDOVER.md` (section 3 = ce qui est fait, section 3 bis = ce qui reste à tester ou à améliorer) et attends le « GO » de BTK avant toute modification.

Ce document explique le projet **DF-boosting** pour qu'un assistant (Google AI Studio ou autre) puisse travailler dessus seul, sans casser le site en ligne.

## 1. Le projet
**Delta Force Operations** : application de gestion d'une équipe de boosting du jeu Delta Force.
- **20 postes** (comptes clients) affichés en cartes sur 2 colonnes.
- **Shifts** : Jour, Nuit, Urgent.
- Un employé prend un poste, envoie 1 à 4 photos de preuve au début et à la fin ; l'admin valide.
- **Paie** : le prix du 1M de score est réglable par l'admin (menu **Réglages**, 1 000 Ar par défaut). Les avances sur salaire sont gérées dans l'appli.
- Calendrier (À l'heure / En retard / Absent), messagerie (groupe général + privé admin ↔ booster, photos et fichiers), alertes de sécurité, galerie photo, profil.
- **Inscription** : un futur booster crée sa demande depuis la page de connexion ; l'admin accepte ou refuse. « Mot de passe oublié » et « modifier mon profil » passent aussi par une validation de l'admin.
- Langues : français et chinois. Thème clair / sombre.

## 2. Les rôles
- **admin** : voit tout, valide ou refuse les débuts/fins de poste, les inscriptions, les mots de passe oubliés et les modifications de profil, gère les employés (création, mot de passe, blocage, suppression), traite les avances, lit les alertes de sécurité, règle les **Réglages** (prix du 1M, shifts, tolérance de retard, types de poste, règles, conservation des photos). Il peut passer en « mode booster » et revenir.
- **employee** : voit les postes, prend un poste libre, envoie ses preuves, demande des avances, écrit des messages. Il ne peut modifier que ses propres données.

## 3. Où est quoi
| Élément | Où |
|---|---|
| Site (React + Vite + Tailwind) | Repo GitHub `BTKzeyrox/DF-boosting`, branche `main` |
| Hébergement | **Vercel** : le site se republie tout seul à chaque push sur `main` |
| Serveur | **Supabase Edge Function `df-api`** — code dans `supabase/functions/df-api/index.ts` |
| Adresse du serveur | `https://ljorjzrxkxqacmmkmqdx.supabase.co/functions/v1/df-api` |
| Base de données | **Supabase** (projet « Replay ») |
| Fichiers (photos, pièces jointes) | Supabase Storage, bucket public `df-files` (10 Mo max par fichier) |

Le site ne parle au serveur que par **`src/db/store.ts`** (une seule porte d'entrée).

## 4. Comment les données circulent
- Le store garde les données en mémoire et les envoie au serveur après chaque modification.
- Toutes les 5 secondes, il récupère les changements des autres utilisateurs.
- Connexion : pseudo + mot de passe vérifiés par le serveur. Le jeton de session est gardé dans le navigateur.
- Le serveur applique les droits : un employé ne peut pas modifier les données d'un autre.

## 5. Les tables Supabase
Chaque table `df_*` contient : `id` (texte), `data` (JSON), `updated_at`.
- `df_users` : comptes (admin et employés)
- `df_posts` : sessions de boosting (début, fin, preuves, statut, paie)
- `df_contracts` : les 20 postes clients
- `df_security_logs` : alertes de sécurité
- `df_advances` : demandes d'avance sur salaire
- `df_messages` : messagerie
- `df_credentials` : pseudo et mot de passe chiffré. **Jamais envoyé au site.**
- `df_settings` : Réglages généraux (une seule ligne `general`)
- `df_resets` : demandes de mot de passe oublié en attente (mot de passe déjà chiffré)
- `df_signups` : inscriptions en attente (mot de passe déjà chiffré)
- `df_profile_requests` : modifications de profil en attente
- Fonction SQL `df_rename_employee` (met à jour le nom sur les sessions après une modification de profil validée)

## 6. Structure du code
- `src/App.tsx` : écran principal et navigation
- `src/db/store.ts` : données + synchronisation avec le serveur
- `src/db/initialData.ts` : les 20 postes de départ (plus aucune donnée de simulation)
- `src/views/` : `LoginView` (connexion, inscription, mot de passe oublié), `admin/AdminDashboard` (Accueil à cartes), `admin/SettingsView` (Réglages), `admin/EmployeesManagement`, `employee/EmployeeDashboard`, `CalendarView`
- `src/components/` : `PostsGrid20` (cartes des postes, tri, type de poste), `ChatView` (messagerie), `ScoreInput` (champs de score `20.467M`), `Sidebar`, `Navbar`, fenêtres (photos, profil, détails du jour)
- `src/utils/i18n.ts` et `src/utils/zhDict.json` : textes français et chinois (tout nouveau texte visible doit être ajouté au dictionnaire chinois)

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
Code : `supabase/functions/df-api/index.ts` (Deno, une seule fonction, version 5 au 2026-10-06 ; vérifie la version réelle avant de redéployer). Routes publiques : `login`, `forgot`, `signup`. Routes avec session : `state`, `sync`, `create-user`, `set-password`, `logout`, `reset-decision`, `signup-decision`, `upload`, `profile-request`, `profile-decision`.
- Il n'a besoin d'aucun secret dans le code : Supabase lui fournit `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` automatiquement. La clé de session est calculée à partir de la clé de service.
- **Modifier le fichier dans GitHub ne change PAS le serveur en ligne.** Il faut le redéployer :
  - Soit dans le tableau de bord Supabase : projet « Replay » → Edge Functions → `df-api` → coller le nouveau code → Deploy.
  - Soit en ligne de commande : `supabase functions deploy df-api --no-verify-jwt --project-ref ljorjzrxkxqacmmkmqdx`
- **Garde « Verify JWT » désactivé** : la fonction fait sa propre vérification (jeton de session maison).
- Si une route change, mets à jour `src/db/store.ts` dans le même travail.
- Le compte `admin` existe déjà. Ne remets jamais de mot de passe dans le code.

## 10. Ce qu'il ne peut pas faire seul
- Créer ou changer les tables Supabase : demander à BTK, ou passer par une migration SQL validée par lui.
- Changer le mot de passe de l'admin : fait depuis la page Employés ou par Claude.
- Si une modification demande un nouveau champ de données, la décrire à BTK avant de coder : le serveur doit être adapté et redéployé en même temps.

## 11. Style
- Textes de l'interface courts, en mots simples.
- Rien ne doit être coupé sur téléphone : les textes passent à la ligne.
- Prix et montants : format `XXXX.XX`.

## 12. Avant de redéployer `df-api`
Repars toujours du fichier du repo (contenu complet) : un fichier incomplet supprimerait des routes en ligne.

