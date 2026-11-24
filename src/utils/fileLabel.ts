// Nom neutre d'un fichier joint : « Document PDF », « Tableur »… (le vrai nom d'origine et la taille ne sont montrés qu'à l'admin : c'est trop d'informations publiques).
// Utilisé par : ChatView.tsx, FeedView.tsx, FileViewerModal.tsx. Contrôlé par scripts/check-hide-file-details.ts.
const KINDS: Array<[RegExp, string]> = [
  [/\.pdf$/i, 'Document PDF'],
  [/\.(docx?|odt|rtf)$/i, 'Document Word'],
  [/\.(xlsx?|ods|csv)$/i, 'Tableur'],
  [/\.(pptx?|odp)$/i, 'Présentation'],
  [/\.txt$/i, 'Texte'],
  [/\.(png|jpe?g|gif|webp|bmp|avif|heic)$/i, 'Photo'],
];
export function neutralFileLabel(name: string | undefined | null): string {
  const n = String(name || '');
  for (const [re, label] of KINDS) if (re.test(n)) return label;
  return 'Fichier';
}
/** Ce qui s'affiche : le vrai nom pour l'admin, un nom neutre pour tous les autres. */
export function shownFileName(name: string | undefined | null, isAdmin: boolean): string {
  return isAdmin ? String(name || '') || 'fichier' : neutralFileLabel(name);
}
/** La taille n'est montrée qu'à l'admin. */
export function shownFileSize(label: string, isAdmin: boolean): string {
  return isAdmin ? label : '';
}
