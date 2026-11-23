// Coller une image (capture d'écran, image copiée) avec Ctrl+V / Cmd+V / « Coller » : règles pures, sans écran.
// Utilisé par : ChatView.tsx (message), FeedView.tsx (publication et commentaire), ReportProblemModal.tsx (signalement), EmployeeDashboard.tsx (photos de début de mission).
// L'image collée prend le MÊME chemin que « choisir un fichier » (mêmes limites de taille et de type). Le collage de texte n'est jamais gêné. Contrôlé par scripts/check-paste-images.ts.
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif' };
const GENERIC = /^(image|capture|screenshot|blob|unnamed|sans[- ]titre)?\.?\w{0,5}$/i; // « image.png » : nom donné par le navigateur à une capture collée

const two = (n: number) => String(n).padStart(2, '0');
/** Nom lisible d'une image collée : capture-2026-11-21-13h54.png (le n° 2, 3… est ajouté quand il y en a plusieurs). */
export function pastedName(now: Date, type: string, n = 1): string {
  const ext = EXT[type] || (type.startsWith('image/') ? type.slice(6).replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png' : 'png');
  return `capture-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}h${two(now.getMinutes())}${n > 1 ? `-${n}` : ''}.${ext}`;
}
/** Faut-il prendre l'image plutôt que le texte ? Oui s'il n'y a pas de texte, ou seulement un nom court sur une ligne (cas d'un fichier copié). Un tableau ou un paragraphe copié reste du texte. */
export function imageWinsOverText(text: string): boolean {
  const t = String(text || '').trim();
  return t === '' || (t.length <= 260 && !/[\t\r\n]/.test(t));
}
interface ClipLike { files?: ArrayLike<File> | null; items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }> | null; getData?: (f: string) => string }
/** Les images du presse-papiers (déjà renommées si le nom est générique), ou [] s'il faut laisser le collage normal. */
export function pastedImages(cd: ClipLike | null | undefined, now: Date = new Date()): File[] {
  if (!cd) return [];
  const found: File[] = [];
  const add = (f: File | null | undefined) => { if (f && f.type.startsWith('image/') && !found.some(g => g.size === f.size && g.type === f.type && g.name === f.name)) found.push(f); };
  for (const f of Array.from(cd.files || [])) add(f);
  for (const it of Array.from(cd.items || [])) if (it.kind === 'file') add(it.getAsFile());
  if (found.length === 0) return [];
  let text = '';
  try { text = cd.getData ? cd.getData('text/plain') : ''; } catch { text = ''; }
  if (!imageWinsOverText(text)) return [];
  return found.map((f, i) => (GENERIC.test(f.name || '') ? new File([f], pastedName(now, f.type, found.length > 1 ? i + 1 : 1), { type: f.type, lastModified: now.getTime() }) : f));
}
/** À brancher sur onPaste : si le presse-papiers contient une image, on l'envoie à `take` et on empêche le collage normal. Renvoie vrai si une image a été prise. */
export function takePastedImages(e: { clipboardData: ClipLike | null; preventDefault(): void }, take: (files: File[]) => void): boolean {
  const files = pastedImages(e.clipboardData);
  if (files.length === 0) return false;
  e.preventDefault();
  take(files);
  return true;
}

/** Bouton « Coller » (téléphone surtout, où le collage dans un champ ne donne pas l'image) : lit l'image du presse-papiers à la demande.
 *  Renvoie les images, ou la raison pour laquelle il n'y en a pas : 'unsupported' (navigateur sans cette fonction), 'denied' (refusé), 'none' (aucune image copiée). */
export type ClipboardReadResult = { files: File[]; reason?: 'unsupported' | 'denied' | 'none' };
interface NavLike { clipboard?: { read?: () => Promise<Array<{ types: readonly string[]; getType(t: string): Promise<Blob> }>> } }
export async function readClipboardImages(nav: NavLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as unknown as NavLike), now: Date = new Date()): Promise<ClipboardReadResult> {
  if (!nav?.clipboard?.read) return { files: [], reason: 'unsupported' };
  let items: Awaited<ReturnType<NonNullable<NonNullable<NavLike['clipboard']>['read']>>>;
  try { items = await nav.clipboard.read(); } catch { return { files: [], reason: 'denied' }; }
  const blobs: Blob[] = [];
  for (const it of items) {
    const t = it.types.find(x => x.startsWith('image/'));
    if (!t) continue;
    try { blobs.push(await it.getType(t)); } catch { /* image illisible : on passe */ }
  }
  if (blobs.length === 0) return { files: [], reason: 'none' };
  return { files: blobs.map((b, i) => new File([b], pastedName(now, b.type, blobs.length > 1 ? i + 1 : 1), { type: b.type, lastModified: now.getTime() })) };
}
/** Phrase affichée quand le bouton « Coller » ne donne rien. */
export function pasteReasonText(reason: ClipboardReadResult['reason']): string {
  if (reason === 'none') return "Aucune image copiée. Fais d'abord une capture ou copie une image.";
  if (reason === 'denied') return "Collage refusé. Autorise « Coller » dans le navigateur, ou utilise le trombone.";
  return "Ce navigateur ne permet pas de coller l'image ici. Utilise le trombone.";
}
