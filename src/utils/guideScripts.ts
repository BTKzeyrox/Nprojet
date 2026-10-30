// Les 4 guides interactifs (un par rôle, 2026-10-29). Chaque étape ouvre la vraie page et fait clignoter un élément réel ; certaines proposent une petite simulation.
// Les phrases décrivent ce que fait vraiment le site (elles reprennent la carte du site : siteKnowledge.ts). Contrôlé par `npm run check:guide-tour`.
import type { Bi } from './siteKnowledge';
import { guideProblems, type GuideRole, type GuideStep } from './guideEngine';

const b = (fr: string, en: string): Bi => ({ fr, en });
const SIM = b('Simulation : rien n\'est modifié.', 'Simulation: nothing is changed.');
const NO_ELEMENT = b('Cet élément apparaît quand il y a quelque chose à traiter.', 'This item shows up when there is something to handle.');
const THEME = b('Choisis le thème avec l\'interrupteur soleil / lune, la langue avec la petite liste, et la taille du texte.', 'Pick the theme with the sun / moon switch, the language with the small list, and the text size.');
const THEME_TARGET = [b('Apparence et langue', 'Appearance and language')];
const SETTINGS_MISSING = b('Ouvre « Réglages » dans le menu : tu y trouves le thème, la langue et la taille du texte.', 'Open "Settings" in the menu: you will find the theme, the language and the text size.');

// ───────────── Responsable ─────────────
const ADMIN: GuideStep[] = [
  { id: 'welcome', page: null, target: null, title: b('Guide du responsable', 'Manager guide'),
    text: b('Tu valides le travail, tu factures, tu paies et tu suis les chiffres. Ce guide ouvre tes vraies pages et fait clignoter ce qu\'il faut regarder. Rien n\'est modifié pendant la visite.', 'You validate the work, invoice, pay and follow the figures. This guide opens your real pages and blinks what to look at. Nothing is changed during the tour.') },
  { id: 'dashboard', page: 'dashboard', target: { texts: [b('Tableau de bord', 'Dashboard')] }, title: b('Ton tableau de bord', 'Your dashboard'),
    text: b('Les missions en cours, celles à valider et les chiffres du jour. C\'est ton point de départ chaque matin.', 'Running missions, those to validate and today\'s figures. It is your starting point every morning.'),
    missing: b('Ouvre « Tableau de bord » dans le menu.', 'Open "Dashboard" in the menu.') },
  { id: 'validate', page: 'validations', target: { texts: [b('Valider', 'Approve')] }, title: b('Valider le travail', 'Validate the work'),
    text: b('Quand un opérateur démarre ou termine une mission, sa demande arrive ici. Tu regardes les preuves, puis tu acceptes, ou tu refuses en donnant un motif.', 'When an operator starts or ends a mission, the request lands here. You look at the proofs, then accept, or refuse with a reason.'),
    action: { hint: b('Touche « Valider » pour essayer.', 'Tap "Approve" to try it.'), result: b('La mission devient « Validée ». La paie de l\'opérateur et le prix client sont figés.', 'The mission becomes "Approved". The operator\'s pay and the client price are frozen.') },
    missing: b('Quand un opérateur démarre ou termine une mission, sa demande arrive ici. La pastille du menu tombe à zéro quand tout est traité.', 'When an operator starts or ends a mission, the request lands here. The menu badge drops to zero when everything is handled.') },
  { id: 'clients', page: 'clients', target: { texts: [b('Nouveau client', 'New client')] }, title: b('Tes clients', 'Your clients'),
    text: b('Les fiches clients, leur tarif et leur chiffre d\'affaires. Le statut d\'un client n\'est jamais saisi : il se calcule avec ses missions validées.', 'Client records, their price and revenue. A client\'s status is never typed: it is computed from its approved missions.'),
    action: { hint: b('Touche « Nouveau client ».', 'Tap "New client".'), result: b('Une fiche s\'ouvre : nom, contact et tarif facultatif.', 'A record opens: name, contact and optional price.') }, missing: NO_ELEMENT },
  { id: 'invoices', page: 'invoices', target: { texts: [b('Nouvelle facture', 'New invoice')] }, title: b('Faire une facture', 'Make an invoice'),
    text: b('Tu fais les factures des clients, tu notes chaque paiement reçu et tu annules une facture fausse par un avoir.', 'You make client invoices, record each payment received and cancel a wrong invoice with a credit note.'),
    action: { hint: b('Touche « Nouvelle facture ».', 'Tap "New invoice".'), result: b('Tu choisis le client, tu coches ses missions validées et tu enregistres le brouillon. À l\'émission, le numéro est donné par le serveur et ne change plus.', 'You choose the client, tick its approved missions and save the draft. When issued, the number is given by the server and never changes.') }, missing: NO_ELEMENT },
  { id: 'stats', page: 'stats', target: { texts: [b('Finances', 'Finances')] }, title: b('Les chiffres', 'The figures'),
    text: b('Trois onglets : Statistiques (missions), Finances (argent) et Rapport (le rapport du mois).', 'Three tabs: Statistics (missions), Finances (money) and Report (the monthly report).'),
    action: { hint: b('Touche l\'onglet « Finances ».', 'Tap the "Finances" tab.'), result: b('Tu vois l\'argent reçu et dépensé, le facturé et le reçu. L\'onglet « Rapport » garde aussi les rapports automatiques.', 'You see money received and spent, billed and received. The "Report" tab also keeps the automatic reports.') }, missing: NO_ELEMENT },
  { id: 'employees', page: 'employees', target: { texts: [b('Ajouter un Opérateur', 'Add Operator')] }, title: b('Ton équipe', 'Your team'),
    text: b('Les profils, l\'accès selon l\'heure de la vacation et l\'état de chacun. Tu bloques ou tu supprimes un profil avec une confirmation.', 'Profiles, access by shift time and each person\'s status. You block or delete a profile with a confirmation.'),
    action: { hint: b('Touche « Ajouter un Opérateur ».', 'Tap "Add Operator".'), result: b('Un formulaire s\'ouvre : pseudo, nom, téléphone, vacation, rôle et mot de passe.', 'A form opens: username, name, phone, shift, role and password.') }, missing: NO_ELEMENT },
  { id: 'health', page: 'health', target: { texts: [b('Santé du site', 'Site health')] }, title: b('La santé du site', 'Site health'),
    text: b('La liste de ce qui demande ton attention (retards, argent, comptabilité…), avec la solution proposée pour chaque point.', 'The list of what needs your attention (delays, money, accounting…), with the proposed solution for each point.'),
    missing: b('Ouvre « Santé du site » dans le menu.', 'Open "Site health" in the menu.') },
  { id: 'settings', page: 'settings', target: { texts: THEME_TARGET }, title: b('Réglages du responsable', 'Manager settings'),
    text: b('Le plafond du Chef d\'équipe (Missions), les tarifs, la taille du texte, le thème et la langue. Le rapport automatique est dans Statistiques > Rapport.', 'The team lead limit (Missions), prices, text size, theme and language. The automatic report is in Statistics > Report.'),
    missing: SETTINGS_MISSING },
];

// ───────────── Chef d'équipe ─────────────
const TEAM_LEAD: GuideStep[] = [
  { id: 'welcome', page: null, target: null, title: b('Guide du chef d\'équipe', 'Team lead guide'),
    text: b('Tu valides le travail de ton équipe : les débuts et les fins de mission. Ce guide ouvre tes vraies pages et fait clignoter ce qu\'il faut regarder. Rien n\'est modifié pendant la visite.', 'You validate your team\'s work: mission starts and ends. This guide opens your real pages and blinks what to look at. Nothing is changed during the tour.') },
  { id: 'validate', page: 'validations', target: { texts: [b('Valider', 'Approve')] }, title: b('Valider un début ou une fin', 'Approve a start or an end'),
    text: b('Quand quelqu\'un de ton équipe démarre ou termine une mission, sa demande arrive ici avec ses preuves. Le serveur fait le calcul : tu ne vois jamais les prix.', 'When someone on your team starts or ends a mission, the request lands here with the proofs. The server does the calculation: you never see the prices.'),
    action: { hint: b('Touche « Valider » pour essayer.', 'Tap "Approve" to try it.'), result: b('Le début (ou la fin) est accepté et la mission avance.', 'The start (or end) is accepted and the mission moves on.') },
    missing: b('Quand quelqu\'un de ton équipe démarre ou termine une mission, sa demande arrive ici.', 'When someone on your team starts or ends a mission, the request lands here.') },
  { id: 'refuse', page: 'validations', target: { texts: [b('Refuser', 'Refuse')] }, title: b('Refuser si les preuves ne vont pas', 'Refuse if the proofs are not right'),
    text: b('Si la preuve est fausse ou floue, tu refuses. L\'opérateur voit le refus et peut recommencer.', 'If the proof is wrong or unclear, you refuse. The operator sees the refusal and can try again.'),
    action: { hint: b('Touche « Refuser ».', 'Tap "Refuse".'), result: b('La demande est refusée et l\'opérateur le voit.', 'The request is refused and the operator sees it.') }, missing: NO_ELEMENT },
  { id: 'limit', page: 'validations', target: { texts: [b('Validations', 'Validations')] }, title: b('Le plafond du responsable', 'The manager\'s limit'),
    text: b('Si le responsable a réglé un plafond, une mission au-dessus de ce prix n\'est pas à toi : tu ne peux ni la valider ni la refuser, le responsable décide. Le montant ne t\'est jamais montré.', 'If the manager set a limit, a mission above that price is not yours: you can neither approve nor refuse it, the manager decides. The amount is never shown to you.'),
    missing: NO_ELEMENT },
  { id: 'chat', page: 'chat', target: { tour: 'nav-chat' }, title: b('Parler à ton équipe', 'Talk to your team'),
    text: b('Parle avec ton équipe et avec le responsable.', 'Talk with your team and with the manager.'), missing: NO_ELEMENT },
  { id: 'settings', page: 'settings', target: { texts: THEME_TARGET }, title: b('Régler ton affichage', 'Adjust your display'), text: THEME, missing: SETTINGS_MISSING },
];

// ───────────── Comptable ─────────────
const ACCOUNTANT: GuideStep[] = [
  { id: 'welcome', page: null, target: null, title: b('Guide du comptable', 'Accountant guide'),
    text: b('Tu fais les factures, tu suis les paiements, les clients et les achats. Tu ne valides pas les missions. Ce guide ouvre tes vraies pages ; rien n\'est modifié pendant la visite.', 'You make invoices and follow payments, clients and purchases. You do not validate missions. This guide opens your real pages; nothing is changed during the tour.') },
  { id: 'invoice-new', page: 'invoices', target: { texts: [b('Nouvelle facture', 'New invoice')] }, title: b('Ton écran principal : les factures', 'Your main screen: invoices'),
    text: b('C\'est ton écran principal : les factures des clients, du brouillon jusqu\'au paiement.', 'This is your main screen: client invoices, from draft to payment.'),
    action: { hint: b('Touche « Nouvelle facture ».', 'Tap "New invoice".'), result: b('Tu choisis le client, tu coches ses missions validées et tu enregistres le brouillon.', 'You choose the client, tick its approved missions and save the draft.') }, missing: NO_ELEMENT },
  { id: 'invoice-issue', page: 'invoices', target: { texts: [b('Émettre', 'Issue')] }, title: b('Émettre et encaisser', 'Issue and collect'),
    text: b('Quand tu émets une facture, le numéro est donné par le serveur et ne change plus. Ensuite tu notes chaque paiement reçu. Si la facture est fausse, tu l\'annules par un avoir.', 'When you issue an invoice, the number is given by the server and never changes. Then you record each payment received. If the invoice is wrong, you cancel it with a credit note.'),
    action: { hint: b('Touche « Émettre » sur un brouillon.', 'Tap "Issue" on a draft.'), result: b('Le numéro est attribué et la facture est figée. Un brouillon peut encore être modifié, une facture émise non.', 'The number is assigned and the invoice is locked. A draft can still be edited, an issued invoice cannot.') }, missing: b('Le bouton « Émettre » apparaît quand tu as un brouillon de facture.', 'The "Issue" button shows up when you have a draft invoice.') },
  { id: 'clients', page: 'clients', target: { texts: [b('Nouveau client', 'New client')] }, title: b('À qui facturer', 'Who to invoice'),
    text: b('Les fiches clients, leur tarif et leur chiffre d\'affaires, pour savoir à qui facturer.', 'Client records, their price and revenue, to know who to invoice.'), missing: NO_ELEMENT },
  { id: 'purchasing', page: 'purchasing', target: { texts: [b('Bons de commande', 'Purchase orders')] }, title: b('Les achats', 'Purchasing'),
    text: b('Tes fournisseurs, les bons de commande, la réception dans le stock et l\'inventaire.', 'Your suppliers, purchase orders, receiving into stock and inventory.'),
    action: { hint: b('Touche l\'onglet « Bons de commande ».', 'Tap the "Purchase orders" tab.'), result: b('Un bon de commande suit trois temps : Brouillon, Commander, puis Recevoir (en une ou plusieurs fois).', 'A purchase order goes through three steps: Draft, Place order, then Receive (in one or several steps).') }, missing: NO_ELEMENT },
  { id: 'chat', page: 'chat', target: { tour: 'nav-chat' }, title: b('Écrire au responsable', 'Write to the manager'),
    text: b('Parle avec le responsable quand une facture ou un paiement pose question.', 'Talk with the manager when an invoice or a payment raises a question.'), missing: NO_ELEMENT },
  { id: 'settings', page: 'settings', target: { texts: THEME_TARGET }, title: b('Thème, langue et texte', 'Theme, language and text'), text: THEME, missing: SETTINGS_MISSING },
];

// ───────────── Opérateur ─────────────
const EMPLOYEE: GuideStep[] = [
  { id: 'welcome', page: null, target: null, title: b('Guide de l\'opérateur', 'Operator guide'),
    text: b('Tu prends une mission, tu envoies tes preuves et tu vois ta paie. Ce guide ouvre tes vraies pages et fait clignoter ce qu\'il faut toucher. Rien n\'est modifié pendant la visite.', 'You take a mission, send your proofs and see your pay. This guide opens your real pages and blinks what to tap. Nothing is changed during the tour.') },
  { id: 'feed', page: 'feed', target: { texts: [b('Actualités', 'News')] }, title: b('Les actualités', 'News'),
    text: b('Les annonces et publications de l\'équipe. Tu peux aimer, commenter et partager.', 'The team\'s announcements and posts. You can like, comment and share.'), missing: NO_ELEMENT },
  { id: 'take', page: 'grid', target: { texts: [b('Prendre', 'Take')] }, title: b('Prendre une mission', 'Take a mission'),
    text: b('La liste des missions disponibles. Tu choisis une mission libre. Une mission grisée n\'est pas réservable.', 'The list of available missions. You pick a free mission. A greyed-out mission cannot be reserved.'),
    action: { hint: b('Touche « Prendre ».', 'Tap "Take".'), result: b('La mission est réservée pour toi. Ensuite tu la démarres à l\'heure, avec la preuve de début.', 'The mission is reserved for you. Then you start it on time, with the start proof.') },
    missing: b('Quand une mission est libre, un bouton « Prendre » apparaît sur sa case.', 'When a mission is free, a "Take" button appears on its cell.') },
  { id: 'finish', page: 'active-post', target: { texts: [b('Envoyer pour validation', 'Submit for validation')] }, title: b('Finir ta mission', 'Finish your mission'),
    text: b('Pendant ta mission tu travailles ; à la fin tu envoies la preuve de fin. Le responsable (ou ton chef d\'équipe) valide ou refuse.', 'During your mission you work; at the end you send the end proof. The manager (or your team lead) approves or refuses.'),
    action: { hint: b('Touche « Envoyer pour validation ».', 'Tap "Submit for validation".'), result: b('Ta preuve de fin est envoyée. Tu es prévenu quand c\'est validé, et la mission est payée.', 'Your end proof is sent. You are notified when it is approved, and the mission is paid.') },
    missing: b('Quand ta mission est en cours, ce bouton apparaît ici, avec l\'envoi de la preuve de fin.', 'When your mission is running, this button shows up here, with the end proof upload.') },
  { id: 'sheets', page: 'sheets', target: { tour: 'sheets-new' }, title: b('Ton tableau de mission', 'Your mission table'),
    text: b('À chaque mission démarrée, un tableau est préparé pour toi sous « Tableaux de mes missions », avec les colonnes qui conviennent. Tu le remplis et tu le télécharges en Excel ou en PDF.', 'Each time you start a mission, a table is prepared for you under "Tables for my missions", with the right columns. You fill it in and download it as Excel or PDF.'),
    missing: b('Ouvre « Mes tableaux » dans le menu.', 'Open "My tables" in the menu.') },
  { id: 'leave', page: 'hr', target: { tour: 'leave-request' }, title: b('Demander un congé', 'Request leave'),
    text: b('Dans « Mon dossier et congés » tu lis ton dossier et tu demandes tes congés. Un congé accepté apparaît au calendrier.', 'In "My file and leave" you read your file and request leave. An approved leave shows in the calendar.'),
    action: { hint: b('Touche le titre « Demander un congé ».', 'Tap the "Request leave" title.'), result: b('Tu choisis le type et les dates, puis tu envoies. Le responsable accepte ou refuse.', 'You pick the type and dates, then send. The manager accepts or refuses.') },
    missing: b('Ouvre « Mon dossier et congés » dans le menu, onglet Congés.', 'Open "My file and leave" in the menu, Leave tab.') },
  { id: 'pay', page: 'advances', target: { texts: [b('Ma paie', 'My pay')] }, title: b('Ta paie', 'Your pay'),
    text: b('Ce que tu as gagné avec tes missions validées, et tes demandes d\'avance.', 'What you earned with your approved missions, and your advance requests.'), missing: NO_ELEMENT },
  { id: 'chat', page: 'chat', target: { tour: 'nav-chat' }, title: b('Poser une question', 'Ask a question'),
    text: b('Parle avec ton équipe et avec le responsable. Pour une question sur une mission, écris ici.', 'Talk with your team and the manager. For a question about a mission, write here.'), missing: NO_ELEMENT },
  { id: 'calendar', page: 'calendar', target: { tour: 'nav-calendar' }, title: b('Le calendrier', 'The calendar'),
    text: b('Tes missions et tes congés acceptés, jour par jour.', 'Your missions and approved leave, day by day.'), missing: NO_ELEMENT },
  { id: 'settings', page: 'settings', target: { texts: THEME_TARGET }, title: b('Confort de lecture', 'Reading comfort'), text: THEME, missing: SETTINGS_MISSING },
];

export const GUIDE_SCRIPTS: Record<GuideRole, GuideStep[]> = { admin: ADMIN, team_lead: TEAM_LEAD, accountant: ACCOUNTANT, employee: EMPLOYEE };
export const SIMULATION_NOTE = SIM;

const isRole = (r: unknown): r is GuideRole => r === 'admin' || r === 'employee' || r === 'accountant' || r === 'team_lead';
/** Le guide d'un rôle. Un rôle inconnu reçoit celui de l'opérateur (le moins de droits). */
export function guideSteps(role: unknown): GuideStep[] { return GUIDE_SCRIPTS[isRole(role) ? role : 'employee']; }
/** Tous les problèmes de tous les guides (liste vide = tout est bon). */
export function allGuideProblems() { return (Object.keys(GUIDE_SCRIPTS) as GuideRole[]).flatMap(r => guideProblems(r, GUIDE_SCRIPTS[r])); }
