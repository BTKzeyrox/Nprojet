// Copier une image dans le presse-papiers (pour la coller ailleurs) sans la télécharger. Le presse-papiers n'accepte sûrement que le PNG : les autres formats sont convertis.
// Utilisé par : LightboxModal.tsx (bouton « Copier »). Contrôlé par scripts/check-copy-image.ts.
// Résultat : 'ok', 'unsupported' (navigateur sans cette fonction), 'failed' (image illisible, réseau, refus).
export type CopyImageResult = 'ok' | 'unsupported' | 'failed';
interface Deps {
  fetchBlob: (url: string) => Promise<Blob>;
  toPng: (b: Blob) => Promise<Blob>;
  write: (png: Promise<Blob>) => Promise<void>;
  supported: boolean;
}
async function realToPng(b: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(b);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  return await new Promise<Blob>((res, rej) => c.toBlob(x => (x ? res(x) : rej(new Error('png'))), 'image/png'));
}
const real = (): Deps => ({
  fetchBlob: async url => { const r = await fetch(url); if (!r.ok) throw new Error('http'); return await r.blob(); },
  toPng: realToPng,
  write: async png => { await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]); },
  supported: typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined',
});
export async function copyImage(url: string, d: Deps = real()): Promise<CopyImageResult> {
  if (!d.supported) return 'unsupported';
  try {
    // La promesse est donnée tout de suite au presse-papiers (Safari exige que l'écriture démarre pendant le clic)
    const png = d.fetchBlob(url).then(b => (b.type === 'image/png' ? b : d.toPng(b)));
    await d.write(png);
    return 'ok';
  } catch { return 'failed'; }
}
export function copyImageText(r: CopyImageResult): string {
  if (r === 'ok') return 'Image copiée.';
  if (r === 'unsupported') return "Ce navigateur ne peut pas copier l'image. Utilise « Télécharger ».";
  return "Impossible de copier cette image. Utilise « Télécharger ».";
}
