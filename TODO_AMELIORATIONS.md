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
- [x] (2026-11-02) **C5. Finances : préciser sur la tuile Trésorerie qu'elle ne suit pas la période choisie** (elle est déjà marquée « depuis le début » : vérifier que ça reste lisible sur téléphone).
  - Vérifié dans le code : la tuile porte déjà le mot « depuis le début » (FR) / « since the start » (EN), sans changement nécessaire. La lisibilité sur téléphone reste à voir à l'écran par BTK.
- [x] (2026-11-02) **C6. Trésorerie : le graphique « Solde du mois » repart de 0 chaque mois.** Option : le faire partir du solde de fin du mois précédent (à décider avec BTK, après C1).
  - Fait (« Go all » de BTK) : le graphique s'appelle « Solde de la caisse » et part de ce qui restait à la fin du mois précédent (`opening` et `balanceTotal` dans `treasuryCharts.ts` ; les lignes datées après aujourd'hui ne comptent pas). `balance` (solde du mois seul) reste calculé. 3 contrôles ajoutés (`check:treasury-charts` 21/21), guide à jour. Site seulement, non testé à l'écran.

## Priorité 4 : qualité du code et réglages
- [ ] (reporté) **D1. Séparer `FinanceTab.tsx` (205 lignes) :** la saisie et le filtre d'une part, l'éditeur (fenêtre) d'autre part. Pas de changement visible. Faire seulement si on touche encore ce fichier.
  - 2026-11-02 : non fait volontairement (« Go all » reçu, mais ce fichier n'a pas été touché et un découpage sans changement visible n'apporte rien tant qu'on n'y ajoute pas de fonction). À reprendre au prochain changement de `FinanceTab.tsx`.
- [ ] (à faire par BTK, pas du code) **D2. Plan comptable : faire valider par un expert-comptable** (le plan est « minimal, de départ »). Ce n'est pas du code : c'est à BTK de voir avec un comptable avant tout usage officiel. Garder l'avertissement dans la page.
- [x] (2026-11-02) **D3. Comptabilité : plage « Ce mois » écrite `AAAA-MM-31`.** Ça marche (comparaison de textes), mais c'est une date qui n'existe pas certains mois. Utiliser la vraie fin de mois (`periodRange`). Petit nettoyage, sans effet visible.
  - Fait : `monthEnd('AAAA-MM')` dans `accounting.ts` (28, 29, 30 ou 31 ; mois illisible : ancien comportement, jamais d'erreur), utilisée par « Ce mois » dans `AccountingPage.tsx`. 2 contrôles ajoutés (`check:accounting` 76/76). Le calcul interne de la TVA (`vatByMonth`) garde `-31` : il ne sert qu'à comparer des textes, aucun effet. Site seulement.

## À essayer à l'écran par BTK (rien de tout cela n'a été testé)
- [ ] Trésorerie avec un compte Comptable : pas de salaires, saisie, filtres, changement de mois.
- [ ] Comptabilité : générer les écritures, modifier une ligne de caisse déjà comptabilisée (voir A1), annuler une écriture (responsable), clôturer un mois, rapprochement avec un relevé.
- [ ] Direction : tous les boutons « Voir… » (surtout le stock, voir B1).

## Ordre conseillé
1. B1 (petit, sans risque), 2. A1 puis A2, 3. C1, C2, C3, C4, 4. C5, C6, D1 à D3.
Chaque lettre est une étape. « GO A1 » = seulement A1 ; « GO » seul = tout le plan dans l'ordre (règle 3 de `LIRE_EN_PREMIER.md`).

---

# Suite : pages Factures et Achats (analyse du 2026-11-02, « Go all » de BTK)
Lecture des règles (`invoices.ts`, `purchasing.ts`) et du serveur. Les écrans `InvoicesView.tsx` et `PurchaseOrdersSection.tsx` n'ont pas été lus en détail. Rien n'est testé à l'écran.

## Factures
- [ ] **F1. Annuler un paiement saisi par erreur.** Les lignes de paiement d'une facture sont verrouillées (`invoice_locked`) et il n'y a pas de route pour les annuler : une facture avec un mauvais paiement ne peut ni être annulée ni être corrigée. À faire : une route serveur « annuler un paiement » (écriture inverse tracée, motif obligatoire, Journal d'audit, jamais de suppression). Serveur à redéployer, sauvegarde avant.
- [x] (2026-11-02, lecture) **F2. Vérifier l'avoir partiel.** Lire `invoice-cancel` : annule-t-il toujours toute la facture ? Si oui, décider avec BTK s'il faut un avoir partiel.
  - Constaté dans `df_cancel_invoice` (SQL) : l'avoir reprend TOUTES les lignes et le total de la facture, et l'annulation est refusée (`has_payments`) dès qu'un paiement existe. Donc pas d'avoir partiel. Décision de BTK : en veut-il un ? (change la base et la comptabilité : à ne faire qu'avec son accord).
- [x] (2026-11-02) **F3. Paiement daté dans un mois clos.** Vérifier ce qui se passe (écriture refusée « closed ») et ajouter une alerte dans la Santé du site si rien ne le signale.
  - Constaté : `df_pay_invoice` accepte n'importe quelle date de paiement. Fait : règle `accounting.cash-closed` (« à voir ») : une ligne de caisse datée dans un mois clos, sans écriture, est signalée (rouvrir le mois avec un motif, générer, reclore). `check:health-accounting` 46/46. Site seulement, non testé à l'écran.

## Achats
- [ ] **P1. Prix réel à la réception.** Aujourd'hui la dépense = quantité reçue × prix commandé (lignes figées). Permettre de saisir le prix réel de la livraison, avec trace de l'écart. Serveur à redéployer.
- [ ] **P2. « Solder le reste ».** Un bon reçu en partie ne s'annule plus et reste « Commandé » et « en retard » pour toujours. Ajouter une action qui clôt le bon sans livrer le reste (état final, tracé). Serveur à redéployer.
- [ ] **P3. Réception définitive, pas de retour fournisseur.** Une erreur de quantité se corrige par l'inventaire mais la dépense « Achats » reste. À décider avec BTK : retour fournisseur ou correction de réception.
- [ ] **P4. Dépense d'achat modifiable.** (étape 1 faite le 2026-11-02, étape 2 à faire) Seuls les paiements de factures sont verrouillés ; la ligne « Achats » liée à un bon de commande (`po_id`) peut être modifiée ou supprimée dans Finances. Étape 1 (site seulement) : alerte dans la Santé du site quand le montant d'une dépense ne correspond plus à la réception. Étape 2 (serveur) : verrouiller ces lignes.
  - Étape 1 faite : règle `suppliers.po-cash-mismatch` (« à voir ») : attendu = quantité reçue × prix du bon, réel = dépenses de la caisse qui citent le bon (`po_id`), tolérance 1 Ar par ligne et par réception ; bon sans réception ignoré. `check:health-suppliers` 22/22. Limite : un vieux bon reçu avant que les dépenses citent `po_id` peut être signalé à tort (à voir sur les vraies données). Site seulement, non testé à l'écran.
- [ ] **P5. Facture et paiement fournisseur.** E1 à E3 de la section précédente : numéro de facture fournisseur, échéance, « payé / à payer », « À payer aux fournisseurs » sur la Direction, compte 401. En attente de la réponse de BTK : paie-t-il ses fournisseurs à la réception ou plus tard sur facture ?

## Ordre
1. F2 et F3 (lecture), 2. P4 étape 1, 3. F1, 4. P2, 5. P1, 6. P4 étape 2, puis P3 et P5 après décision de BTK. Une étape à la fois, un commit chacune ; les étapes serveur avec sauvegarde avant et retour en arrière noté dans `TODO.md`.
