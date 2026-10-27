// Règles communes des documents imprimés et téléchargés (PDF et pages imprimables) : A4, Times New Roman, taille normale (12 pt).
// Règle de BTK : on ne rétrécit jamais le texte pour tout faire entrer ; si c'est long, le document continue sur la page A4 suivante
// (PDF) ou dans un autre fichier (Excel, voir `xlsxA4.ts`). Tout est pur ici (testé par `npm run check:export-format`).

/** Times New Roman d'abord ; « Tinos » (livrée avec le site, mêmes largeurs de lettres) quand la machine n'a pas Times New Roman (téléphones). */
export const PRINT_FONT = "'Times New Roman','Tinos','Liberation Serif',Times,serif";
/** Taille normale du texte, en points. */
export const PRINT_PT = 12;

export const A4_MM = { w: 210, h: 297 } as const;
/** Marges « normales » de la page. */
export const PRINT_MARGIN_MM = 15;
/** Largeur utile de la page : 210 − 2 × 15 = 180 mm. */
export const PRINT_CONTENT_W_MM = A4_MM.w - 2 * PRINT_MARGIN_MM;
/** 180 mm à 96 dpi : le PDF dessine la page à cette largeur, donc 12 pt à l'écran = 12 pt sur le papier (rien n'est rétréci). */
export const PRINT_CONTENT_W_PX = Math.round((PRINT_CONTENT_W_MM / 25.4) * 96);

/** Police Tinos livrée avec le site (public/fonts). Mise dans chaque page imprimable. */
export const PRINT_FONT_FACE = ['normal', 'italic']
  .flatMap(style => [400, 700].map(w => `@font-face{font-family:'Tinos';font-style:${style};font-weight:${w};font-display:swap;src:url('/fonts/tinos-latin-${w}-${style}.woff2') format('woff2')}`))
  .join('');

/**
 * Où couper une page du PDF. `safe` = bas des blocs qu'on ne veut pas couper en deux (lignes de tableau, titres, paragraphes), en pixels du dessin.
 * On coupe au dernier bas de bloc qui tient dans la page ; si aucun ne tient (bloc plus haut que la page), on coupe à la hauteur de la page.
 */
export function pickBreak(safe: number[], start: number, pageH: number, total: number): number {
  if (start + pageH >= total) return total;
  const limit = start + pageH;
  let best = -1;
  for (const b of safe) if (b > start + pageH * 0.3 && b <= limit && b > best) best = b;
  return best > 0 ? best : limit;
}

/** Feuille de style qui impose la règle à une page HTML déjà faite (le texte garde ses tailles de titres, le texte courant passe à 12 pt). */
export const PRINT_OVERRIDE_CSS = `*{font-family:${PRINT_FONT} !important}body{font-size:${PRINT_PT}pt !important;line-height:1.35 !important;margin:0 !important;padding:0 !important}th,td,li,p{font-size:${PRINT_PT}pt !important}`;

/** Ajoute la police et la règle dans une page HTML complète (avant `</head>`, sinon au tout début). */
export function withPrintRules(html: string, origin: string): string {
  const inject = `<base href="${origin.replace(/[<>"'`\s]/g, '')}/"><style>${PRINT_FONT_FACE}${PRINT_OVERRIDE_CSS}</style>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${inject}</head>`) : `${inject}${html}`;
}
