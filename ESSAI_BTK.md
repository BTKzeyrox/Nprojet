# Essai complet par BTK (étape M8.2)

Cet essai se fait **sur un vrai téléphone**, par BTK. Une IA ne peut pas le faire : elle ne voit pas l'écran, ne touche pas, ne connaît pas ton réseau.
Dès qu'un défaut est trouvé, note-le dans le tableau en bas (page, ce que tu as fait, ce que tu as vu, ce que tu attendais) et donne-le à l'IA.

## Avant de commencer
- **Deux façons d'essayer :**
  - **Démo** (données inventées, rien n'est enregistré) : ouvre `/?demo=admin` (responsable) ou `/?demo=employee` (opérateur). Le bouton rond avec la flèche, en haut, remet la démo à zéro. **C'est la seule façon de voir des scores, des badges et des clients en retard.**
  - **Vraie base** : pour l'instant 1 responsable, 1 opérateur, 0 mission, 2 clients, 0 facture. Tu y verras surtout « Pas assez de données » : **c'est normal**, pas un défaut.
- **Comptes manquants dans la vraie base :** aucun Comptable ni Chef d'équipe n'existe. Leurs écrans n'ont donc jamais été essayés avec un vrai compte (voir M7.1 dans `TODO_MODULES.md`).
- **À faire dans l'ordre :** téléphone d'abord, puis (si tu peux) un second téléphone ou un autre navigateur pour l'opérateur.
- **Pour chaque page**, regarde : thème **clair** puis **sombre** ; langue **FR** puis **EN** ; téléphone **debout** puis **couché** ; rien ne dépasse de l'écran, tout se lit, tout se touche facilement.

## Module 3 : Performance (démo responsable : `/?demo=admin`)
1. **Menu Performance.** Deux onglets : « Tableau » (comme avant) et « Scores et badges ».
2. **Scores et badges.** Tu dois voir : la carte « Employé du mois » (septembre fini, octobre en cours), puis le classement des 30 derniers jours (6 personnes, un score chacune sauf une : « Pas assez de données »).
3. **Touche une ligne.** Elle s'ouvre : le score, les 4 parties, les badges avec le **pourquoi**, la tendance en 3 périodes, et un cadre jaune « Points d'attention (visibles par le responsable seulement) » quand il y en a.
4. **Excel / CSV** (onglet Tableau) : le fichier doit avoir 4 colonnes en plus (Score, Tendance, Badges, Points d'attention). Ouvre-le dans Excel.
5. **Réglages > Performance.** Change « Période du score » de 30 à 45 puis « Enregistrer » : message vert, et le classement change. Essaie ensuite 3 : un **message rouge** doit dire quel champ est faux, et rien n'est enregistré. « Remettre les valeurs de départ » demande confirmation.
6. **Équipe.** Sous le nom de chaque salarié : les petites pastilles de badge.
7. **Clients.** Pastilles « À surveiller », « Gros volume » sur les lignes ; bouton « Points d'attention (2) » qui filtre ; une fiche ouverte montre le **score de relation** et le pourquoi.
8. **Accueil.** Une alerte « clients à surveiller » doit mener à la page Clients.
9. **Rapport mensuel** (Finances > rapport) : onglets Excel « Performance équipe » et « Clients à surveiller » ; page imprimable avec les deux sections.
10. **Employé du mois.** Avec peu d'employés actifs il n'y a pas de gagnant (**normal** : il faut 5 salariés actifs). Pour voir le bouton « Publier dans Actualités », mets dans Réglages > Performance « Employé du mois : salariés actifs minimum » à 2 et « Missions jugées minimum pour le badge Qualité » à 1, puis regarde septembre. Le message de confirmation montre le texte exact et **ne contient ni score ni argent**. Après publication : « Déjà publié ».

## Module 3 : Performance (démo opérateur : `/?demo=employee`)
1. **Menu « Ma performance ».** Tu dois voir **seulement toi** : ton score (anneau bleu), tes badges et leur pourquoi, ta tendance.
2. **Tu ne dois voir** : aucun autre nom, aucun classement, aucun « Employé du mois », aucun point d'attention, aucune partie faible du score (juste une phrase qui explique le score).
3. **Fiche Profil** d'un collègue (touche son nom ailleurs dans l'appli) : **pas** de score ni de badges. Sur ta propre fiche : oui.
4. **Félicitations.** En démo : ouvre `/?demo=employee`, puis ouvre l'appli une 2e fois : rien ne doit s'afficher (le premier passage mémorise sans féliciter). Un message « Bravo ! » ne s'affiche que quand un badge **nouveau** est gagné.

## Module 3 : Performance (vraie base, avec ton vrai compte)
- Responsable : « Scores et badges » doit dire « Il faut au moins 5 salariés actifs (il y en a 1) » ; l'opérateur est dans le classement avec « Pas assez de données (0/10 missions jugées) ».
- Opérateur : le menu « Ma performance » doit **s'ouvrir** (le serveur v26 envoie les 3 réglages oui/non). Si tu vois « Cette page n'est pas activée », dis-le : cela veut dire que ces réglages n'arrivent pas.
- Dans Réglages > Conditions, mets « le salarié voit ses badges » sur Non : au prochain rafraîchissement de l'opérateur, la page doit se fermer et le menu disparaître.

## Mode hors ligne (module 13) : à essayer sur ton téléphone, compte OPÉRATEUR
**Ce qui existe aujourd'hui** : l'appli s'ouvre sans réseau, et ce que l'opérateur écrit (messages, missions…) est gardé puis envoyé au retour du réseau. **Pas encore** : les photos, les décisions de l'admin, Actualités, ni l'écran « N actions en attente » (ça viendra). Rien n'est affiché pour te dire que des actions attendent : tu le verras seulement à l'arrivée sur l'autre téléphone.
1. Connecte-toi **avec réseau** comme opérateur. Attends 10 secondes (l'appli garde ses fichiers et une copie des données).
2. **Mode avion.** Écris un **message** dans la messagerie. Il reste affiché.
3. **Ferme complètement l'appli** (retire-la des applications récentes) et **rouvre-la, toujours en mode avion**. Tu dois **rester connecté** (pas d'écran de connexion), voir tes anciens messages **et le message que tu viens d'écrire**.
4. **Coupe le mode avion.** Dans la minute, le message doit arriver chez les autres (regarde sur un 2e appareil ou en admin). **Il ne doit arriver qu'une fois.**
5. Si tu vois « Connexion perdue » en rouge un moment, c'est normal ; il disparaît quand le réseau revient.
6. **Déconnexion avec une action en attente** : en mode avion, écris un message puis déconnecte-toi, remets le réseau, reconnecte-toi : le message doit être envoyé.
7. **Défauts à signaler** : message perdu, message envoyé deux fois, écran de connexion alors que tu étais connecté, appli lente au démarrage.

## Les autres modules (essai rapide, mêmes règles : clair/sombre, FR/EN, debout/couché)
Pour chaque module, fais les actions principales décrites dans sa case de `TODO_MODULES.md` : Conditions (M0), Clients (M1), Factures et devis (M2), Fournisseurs et stock (M4), Dossier salarié et congés (M5), Missions avancées (M6), Audit et sauvegarde (M7), Assistant (M11). Les cases disent ce qui n'a **jamais** été essayé avec de vraies données.

## Défauts déjà connus (pas la peine de les signaler)
- La démo n'a pas de client « Bon payeur » ni « Payeur lent » (il faut 3 factures payées) ni de badge Qualité ou Ponctualité (il faut 20 missions) : ces badges sont testés par les contrôles automatiques, pas visibles en démo.
- Les seuils des badges des **clients** ne sont pas réglables (valeurs de départ).
- Le score d'un salarié porte toujours sur la fenêtre des Réglages (30 jours), même si le Tableau est sur « 7 jours » ou « Tout ».
- Pas de notification poussée pour un badge : seulement le petit message dans l'appli.
- Les noms de types de mission et de clients ne sont jamais traduits (ce sont tes données).

## Tableau des défauts trouvés
| # | Page | Ce que j'ai fait | Ce que j'ai vu | Ce que j'attendais | Clair/Sombre | FR/EN | Téléphone |
|---|------|------------------|----------------|--------------------|--------------|-------|-----------|
| 1 |      |                  |                |                    |              |       |           |
