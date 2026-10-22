// Carte du site (module 11, M11.8) : pour CHAQUE page du menu, à quoi elle sert, comment l'utiliser, ses règles et ses chiffres avec leur formule. FR et EN.
// Sert de base à l'assistant (M11.10) et à « Pourquoi ce chiffre ? » (M11.9). Pur, sans écran, sans serveur.
// Règle d'or : on n'écrit ici que ce que le code fait vraiment (formules relues dans src/utils/*.ts et supabase/functions/df-api). Une formule change = cette fiche change.
// `npm run check:site-map` échoue si une page du menu n'a pas sa fiche, si une fiche est incomplète, ou si l'anglais contient du français.

export type Audience = 'admin' | 'employee' | 'both';
export interface Bi { fr: string; en: string }
export interface SiteFigure { name: Bi; formula: Bi }
export interface SitePage {
  id: string; // identifiant du menu (voir Sidebar)
  audience: Audience;
  title: Bi;
  purpose: Bi;
  howto: [Bi, Bi, Bi]; // le mode d'emploi en 3 lignes
  rules: Bi[]; // règles du site qui touchent cette page
  conditions?: string[]; // réglages de la page Conditions liés, au format « section.clé » (contrôlé contre companyRules)
  figures: SiteFigure[];
}
const b = (fr: string, en: string): Bi => ({ fr, en });

export const SITE_MAP: SitePage[] = [
  {
    id: 'feed', audience: 'both', title: b('Actualités', 'News'),
    purpose: b('Les annonces de l\'équipe : ce qu\'il faut savoir avant de travailler.', 'Team announcements: what to know before working.'),
    howto: [b('Lire les publications, les plus récentes en premier.', 'Read the posts, newest first.'), b('Un employé peut proposer une publication.', 'An employee can propose a post.'), b('L\'admin accepte ou refuse, avec un motif.', 'The admin accepts or refuses, with a reason.')],
    rules: [b('Une publication d\'employé n\'est visible de tous qu\'après acceptation par l\'admin.', 'An employee post is visible to everyone only after admin approval.')],
    figures: [],
  },
  {
    id: 'dashboard', audience: 'admin', title: b('Tableau de bord', 'Dashboard'),
    purpose: b('Le point d\'entrée de l\'admin : missions du moment, alertes d\'argent et de stock, objectifs du mois.', 'The admin\'s entry point: current missions, money and stock alerts, monthly goals.'),
    howto: [b('Regarder les alertes en haut et cliquer pour ouvrir la bonne page.', 'Check the alerts at the top and click to open the right page.'), b('Suivre les barres d\'objectifs du mois.', 'Follow the monthly goal bars.'), b('Gérer les missions du tableau (créer, modifier, relier à un client).', 'Manage the board missions (create, edit, link to a client).')],
    rules: [b('Les objectifs d\'argent ne sont jamais envoyés aux employés.', 'Money goals are never sent to employees.'), b('Les objectifs se règlent dans Réglages (missions, bénéfice, plafond de dépenses).', 'Goals are set in Settings (missions, profit, expense cap).')],
    conditions: ['options.mission_requires_client'],
    figures: [{ name: b('Objectif du mois', 'Monthly goal'), formula: b('Chiffre du mois (du 1er au dernier jour) comparé à l\'objectif réglé : missions validées, bénéfice, dépenses.', 'Month figure (1st to last day) compared with the set goal: validated missions, profit, expenses.') }],
  },
  {
    id: 'validations', audience: 'admin', title: b('Validations', 'Validations'),
    purpose: b('Tout ce que l\'admin doit accepter ou refuser : débuts et fins de mission, avances, inscriptions, réinitialisations de mot de passe, changements de profil.', 'Everything the admin must accept or refuse: mission starts and ends, advances, sign-ups, password resets, profile changes.'),
    howto: [b('Ouvrir une demande et regarder les preuves.', 'Open a request and look at the proofs.'), b('Accepter, ou refuser en donnant un motif.', 'Accept, or refuse with a reason.'), b('La pastille du menu tombe à zéro quand tout est traité.', 'The menu badge drops to zero when everything is handled.')],
    rules: [b('Un refus demande un motif si le réglage « motif de refus obligatoire » est activé.', 'A refusal needs a reason when the "refusal reason required" setting is on.'), b('Le prix de la mission est figé au moment de la validation.', 'The mission price is frozen at validation time.'), b('La Santé du site signale une mission en attente depuis plus de 24 h (réglable).', 'Site health flags a mission waiting more than 24 h (adjustable).')],
    conditions: ['missions.validation_hours', 'missions.refusal_reason_required'],
    figures: [{ name: b('Pastille Validations', 'Validations badge'), formula: b('Débuts à valider + fins à valider + avances en attente + inscriptions + réinitialisations + demandes de profil.', 'Starts to validate + ends to validate + pending advances + sign-ups + resets + profile requests.') }],
  },
  {
    id: 'history', audience: 'admin', title: b('Historique', 'History'),
    purpose: b('Toutes les missions passées, avec de quoi les retrouver.', 'All past missions, with ways to find them.'),
    howto: [b('Filtrer la liste pour retrouver une mission.', 'Filter the list to find a mission.'), b('Afficher plus de lignes (50 de plus à chaque fois).', 'Show more rows (50 more each time).'), b('Ouvrir une mission pour voir son détail.', 'Open a mission to see its details.')],
    rules: [b('L\'histoire d\'un client reste figée quand une mission change de client.', 'A client\'s history stays frozen when a mission changes client.')],
    figures: [],
  },
  {
    id: 'clients', audience: 'admin', title: b('Clients', 'Clients'),
    purpose: b('Les fiches clients, leur statut calculé, leur tarif et leur chiffre d\'affaires.', 'Client records, their computed status, price and revenue.'),
    howto: [b('Créer une fiche (nom, contact, tarif facultatif).', 'Create a record (name, contact, optional price).'), b('Rattacher les anciennes missions avec l\'outil « Missions à rattacher ».', 'Link old missions with the "Missions to link" tool.'), b('Archiver un client plutôt que le supprimer s\'il a des missions.', 'Archive a client instead of deleting it if it has missions.')],
    rules: [b('Le statut n\'est jamais saisi : il se calcule avec les missions validées.', 'The status is never typed: it is computed from validated missions.'), b('Un client qui a des missions n\'est jamais supprimé, seulement archivé.', 'A client with missions is never deleted, only archived.'), b('Les clients sont visibles de l\'admin seulement.', 'Clients are visible to the admin only.')],
    conditions: ['clients.new_days', 'clients.regular_missions', 'clients.regular_months', 'clients.strategic_top_pct', 'clients.strategic_months', 'clients.strategic_min_missions', 'clients.inactive_days', 'options.mission_requires_client'],
    figures: [
      { name: b('Prospect', 'Prospect'), formula: b('Aucune mission validée.', 'No validated mission.') },
      { name: b('Nouveau', 'New'), formula: b('Première mission il y a moins de N jours (60 par défaut).', 'First mission less than N days ago (60 by default).') },
      { name: b('Régulier', 'Regular'), formula: b('Au moins N missions validées sur les M derniers mois (3 sur 6 par défaut).', 'At least N validated missions in the last M months (3 in 6 by default).') },
      { name: b('Stratégique', 'Strategic'), formula: b('Parmi les P % premiers du chiffre d\'affaires des M derniers mois (20 % sur 12 par défaut), avec au moins N missions (5 par défaut).', 'Among the top P % of revenue over the last M months (20 % over 12 by default), with at least N missions (5 by default).') },
      { name: b('Inactif', 'Inactive'), formula: b('Aucune mission depuis N jours ou plus (90 par défaut).', 'No mission for N days or more (90 by default).') },
      { name: b('Prix d\'une mission', 'Mission price'), formula: b('1) prix de la mission, 2) prix du client pour ce type, 3) prix par défaut du client, 4) prix du type (Réglages), 5) prix par défaut (Réglages). Un prix à 0 est un vrai prix (mission offerte).', '1) the mission price, 2) the client\'s price for that type, 3) the client\'s default price, 4) the type price (Settings), 5) the default price (Settings). A price of 0 is a real price (free mission).') },
    ],
  },
  {
    id: 'performance', audience: 'admin', title: b('Performance', 'Performance'),
    purpose: b('Comment chaque salarié travaille : missions faites, refusées, délais.', 'How each employee works: missions done, refused, timing.'),
    howto: [b('Choisir la période (7 jours, 30 jours, tout).', 'Pick the period (7 days, 30 days, all).'), b('Comparer les salariés entre eux.', 'Compare employees with each other.'), b('Exporter en Excel ou en CSV.', 'Export to Excel or CSV.')],
    rules: [b('Ce sont des indicateurs, pas des sanctions : le contexte reste à l\'admin.', 'These are indicators, not penalties: context stays with the admin.')],
    conditions: ['options.badges_enabled'],
    figures: [
      { name: b('Taux d\'acceptation', 'Acceptance rate'), formula: b('Missions validées ÷ (validées + refusées), en %. Vide s\'il n\'y a aucune mission jugée.', 'Validated missions ÷ (validated + refused), in %. Empty if no mission was judged.') },
      { name: b('Délai moyen', 'Average time'), formula: b('Moyenne des durées des missions (début à fin, passage de minuit compris).', 'Average mission duration (start to end, midnight crossing included).') },
    ],
  },
  {
    id: 'stats', audience: 'admin', title: b('Statistiques', 'Statistics'),
    purpose: b('Les chiffres de l\'entreprise : missions, finances, stock et rapport du mois.', 'The company figures: missions, finance, stock and the monthly report.'),
    howto: [b('Choisir l\'onglet (Statistiques, Finances, Stock, Rapport) puis la période.', 'Pick the tab (Statistics, Finance, Stock, Report) then the period.'), b('Saisir les entrées et dépenses dans l\'onglet Finances.', 'Enter income and expenses in the Finance tab.'), b('Saisir les entrées, sorties et ajustements dans l\'onglet Stock.', 'Enter entries, exits and adjustments in the Stock tab.')],
    rules: [b('Finances et Stock sont réservés à l\'admin : le serveur refuse tout autre accès.', 'Finance and Stock are admin-only: the server refuses any other access.'), b('La quantité en stock n\'est jamais saisie : elle se calcule avec les mouvements.', 'Stock quantity is never typed: it is computed from movements.'), b('Les avances sont déjà dans les salaires : elles ne sont pas comptées deux fois.', 'Advances are already inside salaries: they are not counted twice.')],
    figures: [
      { name: b('Facturé', 'Billed'), formula: b('Missions validées × prix client.', 'Validated missions × client price.') },
      { name: b('Encaissé', 'Collected'), formula: b('Somme des paiements reçus.', 'Sum of payments received.') },
      { name: b('À encaisser', 'To collect'), formula: b('Facturé − encaissé.', 'Billed − collected.') },
      { name: b('Dépenses', 'Expenses'), formula: b('Dépenses saisies + salaires (les avances sont déjà dans les salaires).', 'Recorded expenses + salaries (advances are already in salaries).') },
      { name: b('Bénéfice', 'Profit'), formula: b('Encaissé − dépenses.', 'Collected − expenses.') },
      { name: b('Marge', 'Margin'), formula: b('Bénéfice ÷ encaissé, en %. Vide si rien n\'est encaissé.', 'Profit ÷ collected, in %. Empty if nothing is collected.') },
      { name: b('Valeur du stock', 'Stock value'), formula: b('Pour chaque produit : quantité (jamais négative) × prix d\'achat ; puis la somme.', 'For each product: quantity (never negative) × purchase price; then the sum.') },
      { name: b('Quantité en stock', 'Stock quantity'), formula: b('Entrées − sorties ± ajustements.', 'Entries − exits ± adjustments.') },
    ],
  },
  {
    id: 'grid', audience: 'employee', title: b('Missions', 'Missions'),
    purpose: b('La liste des postes disponibles pour l\'employé.', 'The list of posts available to the employee.'),
    howto: [b('Choisir un poste libre.', 'Pick a free post.'), b('Le réserver et commencer la mission à l\'heure.', 'Reserve it and start the mission on time.'), b('Envoyer les preuves demandées à la fin.', 'Send the requested proofs at the end.')],
    rules: [b('Un poste « sans compte » est grisé : il n\'est pas réservable.', 'A "no account" post is greyed out: it cannot be reserved.'), b('Un employé ne voit jamais les prix clients ni les fiches clients.', 'An employee never sees client prices or client records.')],
    figures: [],
  },
  {
    id: 'active-post', audience: 'both', title: b('Mission en cours / Suivi des sessions', 'Current mission / Session tracking'),
    purpose: b('Pour l\'employé : sa mission active. Pour l\'admin : toutes les sessions en cours.', 'For the employee: their active mission. For the admin: all running sessions.'),
    howto: [b('Démarrer la mission avec la preuve de début.', 'Start the mission with the start proof.'), b('Travailler, puis envoyer la preuve de fin.', 'Work, then send the end proof.'), b('L\'admin valide ou refuse la session.', 'The admin validates or refuses the session.')],
    rules: [b('Début et fin passent par une validation de l\'admin.', 'Start and end go through admin validation.'), b('La Santé du site signale une mission en cours depuis plus de 12 h sans fin.', 'Site health flags a mission running over 12 h with no end.')],
    figures: [],
  },
  {
    id: 'employees', audience: 'admin', title: b('Employés', 'Employees'),
    purpose: b('La gestion de l\'équipe : profils, accès, état de chacun.', 'Team management: profiles, access, each person\'s status.'),
    howto: [b('Ouvrir un profil pour voir ou modifier les informations.', 'Open a profile to view or edit information.'), b('Régler l\'accès selon l\'heure de la vacation (auto, toujours, bloqué).', 'Set access by shift time (auto, always, blocked).'), b('Bloquer ou supprimer un profil avec confirmation.', 'Block or delete a profile with confirmation.')],
    rules: [b('Accès « auto » : la connexion n\'est permise que pendant la vacation, avec une marge avant et après.', '"Auto" access: login is only allowed during the shift, with a margin before and after.'), b('Supprimer un profil est définitif.', 'Deleting a profile is permanent.')],
    figures: [],
  },
  {
    id: 'profile', audience: 'employee', title: b('Mon profil', 'My profile'),
    purpose: b('Les informations de l\'employé, qu\'il peut demander à modifier.', 'The employee\'s information, which they can ask to change.'),
    howto: [b('Voir ses informations.', 'View your information.'), b('Demander une modification.', 'Ask for a change.'), b('Attendre l\'accord de l\'admin.', 'Wait for the admin\'s approval.')],
    rules: [b('Un changement de profil passe par une validation de l\'admin.', 'A profile change goes through admin validation.')],
    figures: [],
  },
  {
    id: 'chat', audience: 'both', title: b('Messagerie', 'Messages'),
    purpose: b('Discussions entre personnes et groupes, comme une messagerie classique.', 'Conversations between people and groups, like a regular messenger.'),
    howto: [b('Choisir une discussion ou un groupe.', 'Pick a conversation or a group.'), b('Écrire, joindre un fichier, réagir avec un emoji.', 'Write, attach a file, react with an emoji.'), b('Modifier ou épingler ses propres messages.', 'Edit or pin your own messages.')],
    rules: [b('On ne modifie que ses propres messages, même l\'admin.', 'You only edit your own messages, even the admin.'), b('Supprimer pour tous : l\'auteur ou l\'admin ; une trace reste dans la discussion.', 'Delete for everyone: the author or the admin; a trace stays in the conversation.'), b('Une seule réaction par personne et par message.', 'One reaction per person per message.')],
    figures: [],
  },
  {
    id: 'calendar', audience: 'both', title: b('Calendrier', 'Calendar'),
    purpose: b('Les présences et les retards, jour par jour.', 'Attendance and lateness, day by day.'),
    howto: [b('Choisir le mois et la personne.', 'Pick the month and the person.'), b('Cliquer un jour pour voir les sessions.', 'Click a day to see the sessions.'), b('Repérer les retards.', 'Spot the late arrivals.')],
    rules: [b('Le dimanche est un jour de repos.', 'Sunday is a rest day.'), b('Les heures sont celles de Madagascar (UTC+3).', 'Times are Madagascar time (UTC+3).')],
    conditions: ['leave.late_limit_time'],
    figures: [{ name: b('En retard', 'Late'), formula: b('Début de la session après l\'heure de début de la vacation + la tolérance (15 min par défaut) ; pile à la tolérance n\'est pas un retard. Vacation de jour à 08:00, de nuit à 20:00 par défaut.', 'Session start after the shift start + the tolerance (15 min by default); exactly at the tolerance is not late. Day shift at 08:00, night shift at 20:00 by default.') }],
  },
  {
    id: 'advances', audience: 'both', title: b('Paie / Ma paie', 'Payroll / My pay'),
    purpose: b('La paie des salariés, les avances et les bulletins.', 'Employee pay, advances and payslips.'),
    howto: [b('L\'employé demande une avance ; l\'admin accepte ou refuse.', 'The employee requests an advance; the admin accepts or refuses.'), b('À la clôture d\'une période, les bulletins sont calculés.', 'When a period is closed, payslips are computed.'), b('L\'admin marque chaque bulletin payé (mode et référence).', 'The admin marks each payslip paid (method and reference).')],
    rules: [b('La paie est mensuelle ou par quinzaine (réglage).', 'Pay is monthly or half-monthly (setting).'), b('Les avances sont plafonnées à un % de ce qui est gagné dans la période (0 = pas de plafond).', 'Advances are capped at a % of what is earned in the period (0 = no cap).'), b('Les retenues et pénalités sont désactivées par défaut.', 'Deductions and penalties are off by default.'), b('Un employé ne voit que sa propre paie.', 'An employee only sees their own pay.')],
    conditions: ['payroll.pay_day', 'payroll.pay_rounding'],
    figures: [
      { name: b('Brut', 'Gross'), formula: b('Somme des missions validées de la période (montant figé à la validation, sinon le prix par mission des Réglages).', 'Sum of the period\'s validated missions (amount frozen at validation, otherwise the price per mission from Settings).') },
      { name: b('Retenues appliquées', 'Deductions applied'), formula: b('Les pénalités, jamais plus que brut + primes.', 'Penalties, never more than gross + bonuses.') },
      { name: b('Avances remboursées', 'Advances repaid'), formula: b('Le plus petit entre l\'avance restant due et la part de remboursement (en %) du reste après retenues.', 'The smaller of the advance still due and the repayment share (in %) of what remains after deductions.') },
      { name: b('Net', 'Net'), formula: b('Brut + primes − retenues appliquées − avances remboursées. Jamais négatif.', 'Gross + bonuses − deductions applied − advances repaid. Never negative.') },
    ],
  },
  {
    id: 'health', audience: 'admin', title: b('Santé du site', 'Site health'),
    purpose: b('Le site contrôle chaque page tout seul et signale ce qui mérite un coup d\'œil.', 'The site checks every page by itself and flags what deserves a look.'),
    howto: [b('Regarder les alertes, les plus graves d\'abord.', 'Look at the alerts, most serious first.'), b('Cliquer « Ouvrir » pour aller à la bonne page.', 'Click "Open" to go to the right page.'), b('« Vérifié » ou « Ignorer » cache l\'alerte ; elle revient si ça s\'aggrave.', '"Checked" or "Ignore" hides the alert; it returns if it gets worse.')],
    rules: [b('Ce sont des signaux à vérifier, jamais des sanctions automatiques.', 'These are signals to check, never automatic penalties.'), b('Calcul dans le navigateur de l\'admin ; un employé ne voit rien.', 'Computed in the admin\'s browser; an employee sees nothing.'), b('Les marques « Ignorer / Vérifié » sont gardées sur l\'appareil.', '"Ignore / Checked" marks are kept on the device.'), b('Aucune alerte n\'est lancée sans un minimum de données.', 'No alert fires without a minimum of data.')],
    figures: [
      { name: b('Gravité', 'Severity'), formula: b('Info (pour savoir), À voir (bientôt), Urgent (maintenant). La pastille compte À voir + Urgent.', 'Info (to know), To check (soon), Urgent (now). The badge counts To check + Urgent.') },
      { name: b('Comparaison statistique', 'Statistical comparison'), formula: b('Chiffre actuel comparé à la médiane des périodes d\'avant, avec au moins 3 périodes ; les deux chiffres sont toujours montrés.', 'Current figure compared with the median of earlier periods, with at least 3 periods; both figures are always shown.') },
    ],
  },
  {
    id: 'errors', audience: 'admin', title: b('Journal des erreurs', 'Error log'),
    purpose: b('Les plantages et erreurs du site, regroupés, avec les signalements des employés.', 'Site crashes and errors, grouped, with employee reports.'),
    howto: [b('Ouvrir une erreur pour voir le détail.', 'Open an error to see the details.'), b('Copier le rapport pour le développeur.', 'Copy the report for the developer.'), b('La marquer « résolue ».', 'Mark it "resolved".')],
    rules: [b('Les erreurs identiques sont regroupées avec un compteur.', 'Identical errors are grouped with a counter.'), b('Une erreur résolue qui revient est rouverte.', 'A resolved error that comes back is reopened.')],
    figures: [],
  },
  {
    id: 'settings', audience: 'both', title: b('Réglages', 'Settings'),
    purpose: b('Les réglages du site : horaires, prix, objectifs, Conditions de l\'entreprise, sauvegardes.', 'Site settings: hours, prices, goals, company Conditions, backups.'),
    howto: [b('Choisir la section à régler.', 'Pick the section to set.'), b('Enregistrer pour appliquer le changement.', 'Save to apply the change.'), b('Faire une sauvegarde avant un gros changement.', 'Take a backup before a big change.')],
    rules: [b('Une sauvegarde de nuit est faite automatiquement et gardée environ 14 jours.', 'A nightly backup is made automatically and kept for about 14 days.'), b('Les changements des Conditions sont notés dans un historique.', 'Conditions changes are recorded in a log.'), b('Un employé ne reçoit que le règlement et les règles de congés et de présence.', 'An employee only receives the rules and the leave and attendance policy.')],
    figures: [],
  },
];

export const findPage = (id: string): SitePage | undefined => SITE_MAP.find(p => p.id === id);
export const pagesFor = (role: 'admin' | 'employee'): SitePage[] => SITE_MAP.filter(p => p.audience === 'both' || p.audience === role);
