// Taille du texte, réglée sur cet appareil (garde dans le navigateur)
export const FONT_SIZES = [
  { id: 'xs', label: 'Petite', pct: 90 },
  { id: 'md', label: 'Normale', pct: 100 },
  { id: 'lg', label: 'Grande', pct: 110 },
  { id: 'xl', label: 'Très grande', pct: 120 },
] as const;
const KEY = 'gp_font_size';
export const getFontSize = (): string => {
  try { return localStorage.getItem(KEY) || 'md'; } catch { return 'md'; }
};
export const applyFontSize = (id: string = getFontSize()) => {
  const f = FONT_SIZES.find(x => x.id === id) || FONT_SIZES[1];
  document.documentElement.style.fontSize = `${f.pct}%`;
};
export const setFontSize = (id: string) => {
  try { localStorage.setItem(KEY, id); } catch { /* stockage indisponible */ }
  applyFontSize(id);
};
