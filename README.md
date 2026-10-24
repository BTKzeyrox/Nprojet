# Gestion Pro

Application web de **gestion du travail à la tâche** : le responsable (admin) crée des missions, les opérateurs les prennent, envoient leurs preuves (photos, fichiers), et le responsable valide ou refuse. Avec fil d'actualités, messagerie, calendrier de présence et équipe.

Projet de démonstration (portfolio / CV de BTK).

## Les deux rôles
- **Admin (responsable)** : crée les missions et les comptes, valide ou refuse les débuts/fins de mission, les inscriptions et les publications, règle l'appli.
- **Opérateur (`employee`)** : prend une mission, envoie ses preuves, publie, écrit des messages. Ne modifie que ses propres données.

## Pages principales
Actualités (publications avec photos et fichiers, validation) · Missions (tableau À faire / En cours / À valider, 5 types de mission, guides « Comment faire ? ») · Validations · Messagerie (privé, groupes, fichiers avec option « Compresser ») · Calendrier · Équipe · Historique · Journal des erreurs · Réglages · Profil.
Thème clair/sombre, taille de police réglable, français et anglais, tirer pour actualiser, installable sur téléphone.

## Technique
React 19 + Vite + Tailwind v4 + TypeScript (Vercel) · API = Supabase Edge Function `df-api` (`supabase/functions/df-api/`) · base Supabase, projet `nprojet` (tables `df_*`) · photos sur Cloudinary.

## Connexion
Pseudo + mot de passe (pas d'e-mail). L'admin crée les comptes, ou un opérateur s'inscrit et l'admin accepte.

## Développement local
```bash
npm install
npm run dev      # développement
npm run build    # doit passer avant tout envoi
```
Aucune variable d'environnement sur Vercel : le serveur et ses secrets sont dans Supabase.

## Pour les IA
Lire dans l'ordre : `LIRE_EN_PREMIER.md` → **`GUIDE_SITE.md`** (le site expliqué page par page, sans lire le code) → `AI_STUDIO.md` → `HANDOVER.md`. État et liste à faire : `PROJET.md`, `TODO.md`.
