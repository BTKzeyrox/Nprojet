// Règles pures de <SafeImage> (src/components/SafeImage.tsx) : petite image sans texte, libellé du cadre de remplacement. Contrôlé par scripts/check-safe-image.ts.

/** Petite image (une dimension de 1 à 16 : w-8, h-10, w-14…) : le cadre de remplacement n'a pas la place d'un texte, seulement l'icône. */
export function isCompactClass(className: string): boolean {
  return /(^|\s)(?:[a-z0-9-]+:)?[wh]-(?:[1-9]|1[0-6])(?=\s|$)/.test(String(className || ''));
}
/** Texte du cadre de remplacement : « Hors ligne » sans réseau, sinon « Image indisponible ». */
export function placeholderLabel(online: boolean): string {
  return online ? 'Image indisponible' : 'Hors ligne';
}
