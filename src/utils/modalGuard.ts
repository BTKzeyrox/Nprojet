// Fermeture d'une fenêtre par un clic sur le fond sombre. Règles pures, sans écran. Contrôlé par `npm run check:reason-modal`.
// Pourquoi : sur téléphone, le clavier du champ se ferme quand on touche « Valider » ; la fenêtre bouge pendant le toucher et le navigateur livre le clic
// au FOND au lieu du bouton. La fenêtre se fermait alors sans rien valider, et on recommençait sans fin. Un clic ne ferme donc la fenêtre que si le doigt
// ou la souris s'est AUSSI posé sur le fond (pas dans la fenêtre).
export interface BackdropState { downOnBackdrop: boolean }
/** À l'appui : vrai seulement si l'appui est sur le fond lui-même. */
export const backdropDown = (target: unknown, currentTarget: unknown): boolean => target !== null && target !== undefined && target === currentTarget;
/** Au clic : on ferme seulement si l'appui ET le clic sont sur le fond. */
export const backdropShouldClose = (downOnBackdrop: boolean, clickTarget: unknown, currentTarget: unknown): boolean => downOnBackdrop === true && clickTarget !== null && clickTarget !== undefined && clickTarget === currentTarget;
