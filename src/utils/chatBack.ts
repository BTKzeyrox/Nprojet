// Pont « Retour » du chat : le glissement de retour (App.tsx) demande à la messagerie si une discussion est ouverte (téléphone) et la referme vers la liste.
// Utilisé par : ChatView.tsx (s'inscrit), App.tsx (demande). Contrôlé par : npm run check:page-swipe.
let canBackFn: () => boolean = () => false;
let backFn: () => void = () => {};
export function registerChatBack(canBack: () => boolean, back: () => void): () => void {
  canBackFn = canBack; backFn = back;
  return () => { if (canBackFn === canBack) { canBackFn = () => false; backFn = () => {}; } };
}
export const chatCanBack = (): boolean => { try { return canBackFn(); } catch { return false; } };
export const chatBack = (): void => { try { backFn(); } catch { /* rien */ } };
