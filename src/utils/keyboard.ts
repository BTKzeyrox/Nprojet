// Clavier virtuel ouvert ? (iPhone : la vue visible rétrécit et la page est poussée vers le haut)
// Certains iPhone (mode application, iOS récent) réduisent aussi window.innerHeight : l'écart seul ne suffit pas.
// On considère donc aussi qu'un champ de saisie actif + une vue décalée ou réduite = clavier ouvert.
export function isKeyboardOpen(vv: VisualViewport | null = window.visualViewport): boolean {
  if (!vv) return false;
  const gap = window.innerHeight - vv.height;
  if (gap > 100) return true;
  const el = document.activeElement as HTMLElement | null;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  return typing && (vv.offsetTop > 0 || gap > 50);
}
