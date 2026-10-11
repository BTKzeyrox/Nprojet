// Guides des 5 types de mission : ce qu'il faut faire, quel justificatif envoyer, ce que le responsable vérifie.
// Les types sont réglables dans Réglages : un type inconnu reçoit le guide général.

export interface GuideStep {
  title: string; // Prendre, Faire, Envoyer, Validation
  text: string; // une ou deux phrases simples
}

export interface MissionGuide {
  type: string;
  summary: string; // à quoi sert ce type de mission
  unit: string; // ce que l'on compte (fiches, éléments...)
  endPhotoRequired: boolean; // photo de fin obligatoire ?
  endPhotoLabel: string; // quel justificatif envoyer
  endNoteRequired: boolean; // note de fin obligatoire ?
  endNoteLabel: string;
  endNotePlaceholder: string;
  steps: GuideStep[]; // 4 étapes : Prendre, Faire, Envoyer, Validation
  checks: string[]; // ce que le responsable vérifie
  refusals: string[]; // motifs de refus fréquents (aide pour le responsable)
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

const commonSteps = (doText: string, sendText: string, checkText: string): GuideStep[] => [
  { title: 'Prendre', text: "Lis la consigne, puis touche « Prendre cette mission ». Tu peux ajouter une petite note de départ. Le responsable confirme ton départ." },
  { title: 'Faire', text: doText },
  { title: 'Envoyer', text: sendText },
  { title: 'Validation', text: checkText },
];

const GUIDES: MissionGuide[] = [
  {
    type: 'Saisie de fiches',
    summary: 'Recopier des informations (contacts, dossiers...) dans le formulaire ou le tableau, fiche par fiche.',
    unit: 'fiches',
    endPhotoRequired: true,
    endPhotoLabel: 'Capture du tableau ou du formulaire rempli',
    endNoteRequired: false,
    endNoteLabel: 'Note de fin (facultatif)',
    endNotePlaceholder: 'ex : 200 fiches saisies, 3 numéros illisibles signalés',
    steps: commonSteps(
      "Saisis les fiches une par une. Aucun champ ne doit rester vide. Relis chaque numéro et chaque nom avant de passer à la suivante.",
      "Indique combien de fiches tu as saisies, ajoute une capture du tableau rempli (touche « Terminer »), et une note si un document était illisible.",
      "Le responsable relit ton travail. S'il est bon, la mission est validée. Sinon elle est refusée avec un motif : corrige puis renvoie."
    ),
    checks: ['Aucun champ vide', 'Aucun doublon', 'Numéros et noms au bon format', 'Le nombre de fiches saisies est exact'],
    refusals: ['Champs vides', 'Doublons', 'Mauvais format de numéro', 'Capture illisible'],
  },
  {
    type: 'Contrôle qualité',
    summary: 'Relire le travail déjà fait par un collègue et trouver les erreurs.',
    unit: 'fiches relues',
    endPhotoRequired: false,
    endPhotoLabel: 'Capture de la liste des erreurs trouvées (facultatif)',
    endNoteRequired: true,
    endNoteLabel: 'Erreurs trouvées (obligatoire)',
    endNotePlaceholder: 'ex : fiche 12 : doublon ; fiche 47 : numéro à 9 chiffres. Ou : aucune erreur.',
    steps: commonSteps(
      "Relis chaque fiche : champs vides, doublons, mauvais formats. Note le numéro de la fiche pour chaque erreur trouvée.",
      "Indique combien de fiches tu as relues et écris la liste des erreurs trouvées. Si tout est bon, écris « aucune erreur ».",
      "Le responsable vérifie que tes erreurs sont vraies et qu'aucune n'est oubliée, puis valide ou refuse avec un motif."
    ),
    checks: ['Les erreurs signalées sont vraies', 'Aucune erreur évidente oubliée', 'Le nombre de fiches relues est exact', 'La liste est claire (numéro de fiche + problème)'],
    refusals: ['Liste des erreurs absente', 'Erreur signalée à tort', 'Erreurs oubliées'],
  },
  {
    type: 'Tâche administrative',
    summary: 'Classer des fichiers, remplir un tableau ou rédiger un courrier.',
    unit: 'éléments',
    endPhotoRequired: true,
    endPhotoLabel: 'Le fichier final ou une capture du dossier rangé',
    endNoteRequired: false,
    endNoteLabel: 'Note de fin (facultatif)',
    endNotePlaceholder: 'ex : 50 documents classés par année, 2 manquants',
    steps: commonSteps(
      "Suis la consigne point par point : nom des fichiers, dossier de rangement, modèle de courrier. Garde un travail propre et lisible.",
      "Indique le nombre d'éléments traités et envoie le fichier final ou une capture du dossier rangé (touche « Terminer »).",
      "Le responsable compare ton travail à la consigne, puis valide ou refuse avec un motif."
    ),
    checks: ['Le travail correspond à la consigne', 'Fichiers bien nommés et bien rangés', 'Texte sans faute (courrier)', 'Le justificatif montre le résultat final'],
    refusals: ['Consigne non respectée', 'Fichiers mal rangés', 'Fautes dans le courrier', 'Justificatif manquant'],
  },
  {
    type: 'Demande d’aide',
    summary: "Aider une personne qui a un problème (support niveau 1) et noter ce qui a été fait.",
    unit: 'demandes',
    endPhotoRequired: false,
    endPhotoLabel: 'Capture du problème réglé (facultatif)',
    endNoteRequired: true,
    endNoteLabel: 'Ce que tu as fait (obligatoire)',
    endNotePlaceholder: 'ex : imprimante hors ligne ; redémarrage + réinstallation du pilote ; problème réglé',
    steps: commonSteps(
      "Écoute le problème, essaie les solutions simples (redémarrer, vérifier les câbles, mettre à jour), et note chaque chose que tu essaies.",
      "Écris ce que tu as fait, étape par étape, et si le problème est réglé. Ajoute une capture si elle aide.",
      "Le responsable lit ta note : problème réglé et note claire = validé. Sinon il refuse avec un motif."
    ),
    checks: ['Le problème est réglé ou bien expliqué', 'La note dit clairement quoi faire et dans quel ordre', "L'utilisateur est informé du résultat"],
    refusals: ['Note trop courte', 'Problème non réglé', 'Étapes manquantes'],
  },
  {
    type: 'Tâche web',
    summary: 'Créer ou modifier une page, un texte ou un fichier pour le web.',
    unit: 'pages ou éléments',
    endPhotoRequired: false,
    endPhotoLabel: 'Capture du résultat (facultatif)',
    endNoteRequired: true,
    endNoteLabel: 'Lien ou fichier livré (obligatoire)',
    endNotePlaceholder: 'Colle ici le lien de la page ou écris où se trouve le fichier',
    steps: commonSteps(
      "Réalise la page ou le contenu demandé. Teste-le sur téléphone et sur ordinateur avant de l'envoyer.",
      "Colle le lien (ou indique où est le fichier) dans la note de fin. Ajoute une capture si tu veux.",
      "Le responsable ouvre ton lien, vérifie le contenu, puis valide ou refuse avec un motif."
    ),
    checks: ['Le lien s’ouvre', 'Le contenu est correct et sans faute', 'Affichage correct sur téléphone', 'La consigne est respectée'],
    refusals: ['Lien qui ne s’ouvre pas', 'Contenu incomplet', 'Affichage cassé sur téléphone'],
  },
];

const GENERAL: MissionGuide = {
  type: 'Mission',
  summary: 'Une tâche à faire, puis à envoyer au responsable avec un justificatif.',
  unit: 'unités',
  endPhotoRequired: true,
  endPhotoLabel: 'Photo ou capture montrant le travail terminé',
  endNoteRequired: false,
  endNoteLabel: 'Note de fin (facultatif)',
  endNotePlaceholder: 'ex : tout est fait, un document manquant',
  steps: commonSteps(
    'Fais le travail demandé en suivant la consigne de la mission.',
    "Indique ce que tu as fait (quantité) et envoie un justificatif avec une petite note (touche « Terminer »).",
    "Le responsable vérifie ton travail, puis valide ou refuse avec un motif."
  ),
  checks: ['Le travail correspond à la consigne', 'Le justificatif est lisible', 'La quantité indiquée est exacte'],
  refusals: ['Consigne non respectée', 'Justificatif illisible', 'Quantité incorrecte'],
};

export const getGuide = (type?: string): MissionGuide => {
  if (!type) return GENERAL;
  const k = norm(type);
  return GUIDES.find(g => norm(g.type) === k) || GENERAL;
};

// Étape en cours pour l'opérateur, selon l'état de sa mission (1 à 4)
export const stepOfStatus = (status?: string): number =>
  status === 'pending_start' ? 1 : status === 'active' ? 2 : status === 'pending_end' ? 4 : status === 'completed' ? 4 : 1;
