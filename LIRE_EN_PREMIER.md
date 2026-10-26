# ⛔ LIS CE FICHIER EN PREMIER (avant AI_STUDIO.md et HANDOVER.md)

Ordre de lecture : **1. `LIRE_EN_PREMIER.md`** (ce fichier) → **2. `GUIDE_SITE.md`** (le site expliqué page par page, les rôles, les modules, les recettes et les pièges : **tu n'as pas besoin de lire le code pour comprendre le site**) → **3. `AI_STUDIO.md`** → **4. `HANDOVER.md`** (en partie périmé : voir le guide §8).
Ne modifie rien et ne propose rien avant d'avoir lu ces quatre fichiers.

> **Tu installes une nouvelle copie de ce site pour un autre projet (nouveau dépôt, nouveaux comptes) ?** Lis **`NOUVEAU_PROJET.md`** juste après ce fichier. Sinon, tu n'en as pas besoin. Les liens de ce dépôt (`Nprojet`, appli « Gestion Pro ») sont ci-dessous.

> **À quoi sert le site ? Pour qui ? D'autres usages ?** Réponses prêtes dans **`A_PROPOS.md`**.

## Les règles de BTK (à respecter tout le temps)
1. **Pas de code, pas de modification sans le mot « GO ».** Même un petit changement. Un fichier de texte (doc) demandé clairement est permis ; tout le reste attend le GO.
2. **Toujours un récap court avant de commencer** : ce que tu as compris, le plan en quelques lignes, ce qui n'est pas clair. Puis tu **attends « GO »**.
3. **« GO 123 »** (ou « GO 1 2 3 ») = tous les points cités, pas seulement le dernier. « GO » seul = tout le plan, dans l'ordre.
4. **Si BTK dit « récap », « pas GO »** : tu ne fais que le récap, rien d'autre.
5. **Réponses courtes, en français, avec des mots simples.** Pas de jargon, pas de blabla.
6. **Un seul récap par sujet.** Si BTK répond avec des choix, redis ce que tu as compris puis attends GO.
7. **Sois honnête** : dis clairement ce qui est fait, ce qui n'est pas testé, ce qui ne marche pas. Ne dis jamais « c'est fait » sans l'avoir vérifié.
8. **Pousse directement sur `main`** (après GO), un commit clair par sujet, le projet doit compiler (`npm run build`).
9. **Des fichiers un par un**, jamais de ZIP, sauf si BTK le demande.
10. **Avant une action qui efface des données** : demande une confirmation précise à BTK. Ne supprime jamais rien sans son accord.
11. **Ne pousse que sur le dépôt que BTK t'a donné pour CE chat** (`BTKzeyrox/Nprojet`). Lance `git remote -v` avant chaque envoi.
12. **Écrire sur GitHub : avec le token de BTK et le terminal (`git`), jamais avec le connecteur git.** Le connecteur ne sert qu'à lire. Le token ne s'écrit jamais dans un fichier ni dans l'adresse du dépôt (le passer à la commande seulement).
13. **Une étape à la fois : une étape finie = un commit + un push + le TODO mis à jour dans le même commit.** Jamais plusieurs étapes d'un coup dans un seul gros commit.
14. **« GO M1 » (ou M2, M3…) = tout le module, étape par étape.** Tu fais la première étape non cochée (ex. M1.3), tu pousses avec le TODO à jour, puis tu enchaînes avec l'étape suivante **sans attendre BTK**, jusqu'à la fin du module. Tu ne t'arrêtes que pour : une action qui efface des données (règle 10), un vrai doute qui change le résultat, ou un essai que seul BTK peut faire (écran, téléphone).
15. **Chaque étape met `GUIDE_SITE.md` à jour dans le même commit** : lancer `npm run guide` (parties automatiques), compléter à la main les parties écrites (rôles, parcours, modules, pièges, limites), puis `npm run check:guide` doit passer. Une page, une règle, une table ou un piège nouveau qui n'est pas dans le guide = étape non finie.

## Le token GitHub (classique) : comment l'avoir
- **Lien pour créer le token** (la case `repo` est déjà cochée) :
  https://github.com/settings/tokens/new?scopes=repo&description=nprojet
- Mets l'expiration à **7 jours**, clique « Generate token », copie le token (il commence par `ghp_`) et **colle-le dans le chat**. Jamais dans le dépôt, jamais dans un fichier.
- **Supprimer les anciens tokens** (à faire après le travail) : https://github.com/settings/tokens
- **Si le message de BTK ne contient pas de token**, donne-lui le lien ci-dessus et demande-le avant de pousser. Le dépôt est public : la lecture marche sans token.

## Les liens utiles
- Dépôt de travail : https://github.com/BTKzeyrox/Nprojet (branche `main`)
- Supabase (projet `nprojet`) : https://supabase.com/dashboard/project/fvkusbdhetxleimtdzqm
- Vercel : https://vercel.com/dashboard

## À vérifier au début de chaque nouveau chat
- Le **connecteur Supabase** doit être activé (projet `nprojet`). Sans lui, tu ne peux pas changer la base ni le serveur. Aucune clé à copier.
- Le connecteur Vercel de certains chats est un **autre compte** : il peut ne pas voir le projet du site. Si c'est le cas, dis-le à BTK, il change l'adresse lui-même dans le tableau de bord Vercel.
- Les **mots de passe des comptes de test** : BTK te les donne dans le chat, jamais dans le dépôt.
- **Ne jamais écrire un secret** (token, clé d'envoi de mails, mot de passe) dans le dépôt ni dans un fichier. Les clés de service sont dans le coffre-fort Supabase.
