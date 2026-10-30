// Taille du texte, réglée sur cet appareil (garde dans le navigateur)
export const FONT_SIZES = [
  { id: 'xxs', label: 'Très petite', pct: 80 },
  { id: 'xs', label: 'Petite', pct: 90 },
  { id: 'md', label: 'Normale', pct: 100 },
  { id: 'lg', label: 'Grande', pct: 110 },
] as const;
// « Très grande » (120 %) n'existe plus (2026-10-29) : ceux qui l'avaient gardée passent à « Grande ».
const LEGACY: Record<string, string> = { xl: 'lg' };
const KEY = 'gp_font_size';
export const getFontSize = (): string => {
  let id = 'md';
  try { id = localStorage.getItem(KEY) || 'md'; } catch { /* stockage indisponible */ }
  id = LEGACY[id] ?? id;
  return FONT_SIZES.some(f => f.id === id) ? id : 'md';
};
export const applyFontSize = (id: string = getFontSize()) => {
  const f = FONT_SIZES.find(x => x.id === (LEGACY[id] ?? id)) || FONT_SIZES[2];
  document.documentElement.style.fontSize = `${f.pct}%`;
};
export const setFontSize = (id: string) => {
  try { localStorage.setItem(KEY, id); } catch { /* stockage indisponible */ }
  applyFontSize(id);
};
