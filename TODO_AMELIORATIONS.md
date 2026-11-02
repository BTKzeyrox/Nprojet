# TODO_AMELIORATIONS.md : améliorations proposées (Trésorerie, Finances, Comptabilité, Direction)

Écrit le 2026-11-02 après une lecture du code (aucun essai à l'écran, rien n'est modifié).
**Règle de BTK : rien ne se code sans le mot « GO ».** Une étape à la fois : un commit, un push, ce fichier et `GUIDE_SITE.md` mis à jour dans le même commit.
Cases : `[ ]` à faire · `[x]` fait. Pages concernées : `treasury`, `stats` (onglet Finances), `accounting`, `direction`.

## Priorité 1 : écritures comptables qui peuvent devenir fausses
- [x] (2026-11-02) **A1. Détecter une écriture qui ne correspond plus à sa pièce.**
  - Problème : l'identifiant d'une écriture vient de l'identifiant de la ligne de caisse (`entryIdFor` dans `src/utils/accountingEntries.ts`). « Générer les écritures » saute une pièce qui a déjà son écriture. Si la ligne de caisse est modifiée (montant, date, catégorie) ou supprimée après, l'écriture garde l'ancien chiffre.
  - À faire : une règle de la Santé du site (`src/utils/health/rules/accounting.ts`) qui compare chaque écriture à sa pièce et signale « N écriture(s) ne correspondent plus à leur pièce », avec sa solution dans `src/utils/advice.ts` et son lien exact.
  - À décider avec BTK : on signale seulement, ou on propose aussi « annuler et refaire l'écriture » (écriture inverse, jamais de modification).
  - Contrôle à ajouter : `check:accounting-stale`. Fiche dans la carte du site (`check:site-map`).
  - Fait : règle `accounting.stale` (« à voir », jamais urgente) dans `src/utils/health/rules/accounting.ts`, solution dans `advice.ts` (clé `stale`), phrase dans la fiche Comptabilité de `siteKnowledge.ts` et `GUIDE_SITE.md`. Elle compare chaque écriture `je-receipt-…` / `je-expense-…` à sa ligne de caisse (date, comptes, montants ; pas la note) ; une écriture déjà annulée est ignorée ; elle SIGNALE seulement, rien n'est corrigé tout seul (choix par défaut, accord par « Go »). Tests : 12 cas ajoutés dans `check:health-accounting` (39/39), au lieu d'un contrôle séparé. Site seulement, pas de serveur. Non testé à l'écran. Limite : seules les lignes de caisse sont comparées (pas les factures ni la paie). L'essai de confirmation à l'écran reste à faire par BTK.
  - Essai à faire d'abord (pour confirmer le problème) : comptabiliser une ligne de caisse, la modifier, regarder le journal.
- [x] (2026-11-02) **A2. Noter dans le journal d'audit les modifications de la caisse.** Aujourd'hui seules les suppressions (et les tarifs, réglages) sont notées ; une modification de montant par le Comptable ou le responsable ne l'est pas. Ajouter une action `cash_change` dans le serveur (bloc AUDIT de `df-api`, avec l'ancien et le nouveau montant). Serveur à redéployer : sauvegarde avant, retour en arrière écrit dans `TODO.md`.
  - Fait : nouvelle action d'audit `cash_change` (« Ligne de caisse modifiée ») : montant, date, catégorie ou sens changés, noté « ancien → nouveau » par le serveur (bloc AUDIT et synchro de `df-api`), pour le responsable et le Comptable. La note et les liens ne sont pas notés. Même liste d'actions côté site (`auditRules.ts`) ; `check:audit` : Tout est OK. Sauvegarde n° 90 avant le déploiement.

## Priorité 2 : lien cassé
- [x] (2026-11-02) **B1. Direction, carte « Stock critique » : le bouton « Voir le stock » ouvre `stats`, mais le stock est dans la page `storage` (Stockage).** Corriger `src/views/admin/DirectionPage.tsx` (ligne 122) pour ouvrir `storage`. Vérifier les autres boutons « Voir… » de la page. Ajouter un contrôle qui vérifie que chaque bouton ouvre une page qui existe (comme `check:alert-links`).
  - Fait : bouton corrigé (ouvre `storage`) ; `check:direction-page` vérifie maintenant que chaque bouton « Voir… » ouvre une page qui existe (27/27). Build OK. Non testé à l'écran (téléphone). Site seulement, pas de serveur. Retour arrière : commit précédent.

## Priorité 3 : chiffres clairs
- [x] (2026-11-02) **C1. Trésorerie du Comptable : ajouter l'argent en caisse « depuis le début »** (reçu − dépenses depuis le début, sans salaires). Aujourd'hui il ne voit que le solde du mois. Dans `TreasuryPage` / `src/utils/treasuryCharts.ts`, jamais de salaires (`check:treasury`, `check:treasury-charts`).
  - Fait : carte « En caisse (depuis le début) » en haut de la page Trésorerie (`cashSinceStart` dans `treasuryCharts.ts` : tout le reçu moins toutes les dépenses jusqu'à aujourd'hui, sans salaires, indépendante du mois choisi). 3 contrôles ajoutés (`check:treasury-charts` 18/18), fiche et guide à jour. Site seulement, non testé à l'écran.
- [x] (2026-11-02) **C2. Direction, carte « Argent du mois » : écrire « depuis le début » sur la ligne Trésorerie** (les autres lignes sont du mois). Même mot que dans Finances.
  - Fait : libellé « Trésorerie (depuis le début) » / « Cash (since the start) » dans `DirectionPage.tsx`.
- [x] (2026-11-02) **C3. Direction : dire clairement quand le chiffre d'affaires est « estimé »** (pas de facture émise ce mois-ci, donc valeur des missions validées). Le mot « estimé » existe déjà dans le libellé : le rendre plus visible (couleur ou petite note).
  - Fait : montant en ambre et petite note « Estimé : aucune facture émise ce mois-ci… » (FR et EN). 2 contrôles ajoutés dans `check:direction-page` (29/29). Site seulement, non testé à l'écran.
- [x] (2026-11-02) **C4. Finances : éviter la confusion entre deux « À encaisser ».** La tuile du haut = missions validées × prix client − reçu. Le bloc Factures = reste à payer des factures émises. Proposer un seul mot par chiffre (par exemple « Estimé à encaisser » et « Reste à payer sur factures ») dans `FinanceInsights.tsx`, avec le même mot dans `GUIDE_SITE.md` et « Pourquoi ce chiffre ? ».
  - Fait : la tuile de Finances s'appelle « Estimé à encaisser » (FR/EN), avec ses 2 phrases d'explication, la fiche Statistiques, « Pourquoi ce chiffre ? » et le rapport. « Reste à payer » (factures) et la page Factures ne changent pas. Non changé : le bouton « Argent du mois » de l'assistant écrit encore « À encaisser » (autre source de chiffre, à revoir si besoin). 12 contrôles liés réussis, site seulement, non testé à l'écran.
- [ ] **C5. Finances : préciser sur la tuile Trésorerie qu'elle ne suit pas la période choisie** (elle est déjà marquée « depuis le début » : vérifier que ça reste lisible sur téléphone).
- [ ] **C6. Trésorerie : le graphique « Solde du mois » repart de 0 chaque mois.** Option : le faire partir du solde de fin du mois précédent (à décider avec BTK, après C1).

## Priorité 4 : qualité du code et réglages
- [ ] **D1. Séparer `FinanceTab.tsx` (205 lignes) :** la saisie et le filtre d'une part, l'éditeur (fenêtre) d'autre part. Pas de changement visible. Faire seulement si on touche encore ce fichier.
- [ ] **D2. Plan comptable : faire valider par un expert-comptable** (le plan est « minimal, de départ »). Ce n'est pas du code : c'est à BTK de voir avec un comptable avant tout usage officiel. Garder l'avertissement dans la page.
- [ ] **D3. Comptabilité : plage « Ce mois » écrite `AAAA-MM-31`.** Ça marche (comparaison de textes), mais c'est une date qui n'existe pas certains mois. Utiliser la vraie fin de mois (`periodRange`). Petit nettoyage, sans effet visible.

## À essayer à l'écran par BTK (rien de tout cela n'a été testé)
- [ ] Trésorerie avec un compte Comptable : pas de salaires, saisie, filtres, changement de mois.
- [ ] Comptabilité : générer les écritures, modifier une ligne de caisse déjà comptabilisée (voir A1), annuler une écriture (responsable), clôturer un mois, rapprochement avec un relevé.
- [ ] Direction : tous les boutons « Voir… » (surtout le stock, voir B1).

## Ordre conseillé
1. B1 (petit, sans risque), 2. A1 puis A2, 3. C1, C2, C3, C4, 4. C5, C6, D1 à D3.
Chaque lettre est une étape. « GO A1 » = seulement A1 ; « GO » seul = tout le plan dans l'ordre (règle 3 de `LIRE_EN_PREMIER.md`).
