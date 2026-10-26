// Photos « collées » dans un enregistrement (module 13, M13.5b) : quand l'envoi d'une photo échoue (pas de réseau), l'appli garde la version compressée
// sous forme d'adresse « data:image/… » dans la mission. Ces fonctions pures la retrouvent, la comptent et la remplacent par la vraie adresse une fois la photo envoyée.
// Contrôlé par `npm run check:offline-sync`.
export type Path = (string | number)[];
export interface Found { path: Path; value: string }

/** Une « photo collée » : une adresse data:image/… ou data:application/pdf… assez longue pour être un vrai fichier. */
export const isInlineFile = (v: unknown): v is string => typeof v === 'string' && v.length > 500 && /^data:(image|application)\/[a-z0-9.+-]+;base64,/i.test(v);

/** Toutes les photos collées d'un enregistrement (3 niveaux de profondeur au plus : champ, liste, objet de la liste). */
export function findInlineFiles(rec: unknown, maxDepth = 3): Found[] {
  const out: Found[] = [];
  const walk = (v: unknown, path: Path, depth: number) => {
    if (isInlineFile(v)) { out.push({ path, value: v }); return; }
    if (depth >= maxDepth || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...path, i], depth + 1));
    else for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, [...path, k], depth + 1);
  };
  walk(rec, [], 0);
  return out;
}

/** Nombre de photos collées et taille totale (en caractères, proche des octets envoyés). */
export function inlineFileStats(rec: unknown): { count: number; bytes: number } {
  const f = findInlineFiles(rec);
  return { count: f.length, bytes: f.reduce((t, x) => t + x.value.length, 0) };
}

/** Copie de l'enregistrement où la valeur à `path` est remplacée (seulement si elle est encore celle attendue : l'enregistrement a pu changer pendant l'envoi). Sinon : null. */
export function replaceInlineFile<T>(rec: T, path: Path, expected: string, replacement: string): T | null {
  const clone = (v: unknown): unknown => (Array.isArray(v) ? [...v] : v && typeof v === 'object' ? { ...(v as object) } : v);
  const root = clone(rec) as any;
  let cur = root;
  for (let i = 0; i < path.length - 1; i++) { if (cur == null || typeof cur !== 'object') return null; cur[path[i] as any] = clone(cur[path[i] as any]); cur = cur[path[i] as any]; }
  const last = path[path.length - 1];
  if (cur == null || typeof cur !== 'object' || cur[last as any] !== expected) return null;
  cur[last as any] = replacement;
  return root as T;
}
