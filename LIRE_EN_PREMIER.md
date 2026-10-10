# ⛔ LIS CE FICHIER EN PREMIER (avant AI_STUDIO.md et HANDOVER.md)

Ordre de lecture : **1. `LIRE_EN_PREMIER.md`** (ce fichier) → **2. `AI_STUDIO.md`** → **3. `HANDOVER.md`**.
Ne modifie rien et ne propose rien avant d'avoir lu les trois.

> **Ce dépôt est-il une COPIE du projet DF-boosting (nouveau projet, nouveaux comptes) ?** Si oui, lis **`NOUVEAU_PROJET.md`** juste après ce fichier. Les liens et adresses plus bas sont ceux de l'**ancien** projet : ne les utilise pas pour la copie, et remplace-les par ceux du nouveau projet quand il est en place.

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
11. **Ne pousse que sur le dépôt que BTK t'a donné pour CE chat.** Si tu travailles sur une **copie** (nouveau projet), le dépôt original `BTKzeyrox/DF-boosting` est en **lecture seule** : n'y écris jamais. Lance `git remote -v` avant chaque envoi.

## Le token GitHub (classique) : comment l'avoir
- **Lien pour créer le token** (la case `repo` est déjà cochée) :
  https://github.com/settings/tokens/new?scopes=repo&description=df-boosting
- Mets l'expiration à **7 jours**, clique « Generate token », copie le token (il commence par `ghp_`) et **colle-le dans le chat**. Jamais dans le dépôt, jamais dans un fichier.
- **Supprimer les anciens tokens** (à faire après le travail) : https://github.com/settings/tokens
- **Si le message de BTK ne contient pas de token**, donne-lui le lien ci-dessus et demande-le avant de pousser. Le dépôt est public : la lecture marche sans token.

## Les liens utiles
- Dépôt : https://github.com/BTKzeyrox/DF-boosting
- Site en ligne : https://df-boosting-5u7c.vercel.app/
- Supabase (projet « Replay ») : https://supabase.com/dashboard/project/ljorjzrxkxqacmmkmqdx
- Vercel : https://vercel.com/dashboard

## À vérifier au début de chaque nouveau chat
- Le **connecteur Supabase** doit être activé (projet « Replay »). Sans lui, tu ne peux pas changer la base ni le serveur. Aucune clé à copier.
- Le connecteur Vercel de certains chats est un **autre compte** : il peut ne pas voir le projet du site. Si c'est le cas, dis-le à BTK, il change l'adresse lui-même dans le tableau de bord Vercel.
- Les **mots de passe des comptes de test** (`admin`, `kiot`, `toki`, `sarah`) : BTK te les donne dans le chat, jamais dans le dépôt.
- **Ne jamais écrire un secret** (token, clé d'envoi de mails, mot de passe) dans le dépôt ni dans un fichier. Les clés de service sont dans le coffre-fort Supabase.
