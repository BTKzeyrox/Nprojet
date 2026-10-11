import { db } from '../db/store';
import { compressProofImage } from './imageUtils';
import type { NewsAttachment } from '../types';

// Pièces jointes des publications et commentaires : préparation (compression) puis envoi.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPT_ATTR = 'image/*,application/pdf,.pdf,text/plain,.txt';
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain'];

export interface DraftAttachment {
  key: string;
  name: string;
  kind: 'image' | 'file';
  before: number; // poids d'origine (octets)
  after: number; // poids envoyé (octets)
  dataUrl: string;
  url?: string; // rempli quand le fichier est déjà envoyé (un nouvel essai ne le renvoie pas)
}

export const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
};

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Lecture impossible'));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });

// Poids réel d'une data URL (octets du fichier décodé)
const dataUrlBytes = (d: string): number => {
  const i = d.indexOf(',');
  const b64 = i >= 0 ? d.slice(i + 1) : d;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
};

let seq = 0;

// Prépare un fichier choisi : refuse les types ou poids non acceptés, compresse les photos (1600 px, ~300 Ko).
// Les GIF et les PDF/textes restent tels quels. Lance une Error avec un message court en français.
export async function prepareAttachment(file: File): Promise<DraftAttachment> {
  if (!OK_TYPES.includes(file.type)) throw new Error(`« ${file.name} » : type non accepté (photo, PDF ou texte).`);
  const isPhoto = file.type.startsWith('image/') && file.type !== 'image/gif';
  if (!isPhoto && file.size > MAX_FILE_BYTES) throw new Error(`« ${file.name} » : fichier trop gros (10 Mo maximum).`);
  let dataUrl: string;
  try {
    dataUrl = isPhoto ? await compressProofImage(file, 1600, 300 * 1024) : await readAsDataUrl(file);
  } catch {
    throw new Error(`« ${file.name} » : lecture impossible.`);
  }
  const after = dataUrlBytes(dataUrl);
  if (after > MAX_FILE_BYTES) throw new Error(`« ${file.name} » : fichier trop gros (10 Mo maximum).`);
  return {
    key: `att-${Date.now()}-${++seq}`,
    name: file.name || 'fichier',
    kind: file.type.startsWith('image/') ? 'image' : 'file',
    before: file.size,
    after: isPhoto ? after : file.size,
    dataUrl,
  };
}

// Envoie les fichiers un par un (progression 1/N). En cas d'échec, les fichiers déjà envoyés gardent leur lien
// (`url`) : un nouvel essai ne les renvoie pas.
export async function uploadAttachments(
  items: DraftAttachment[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ ok: true; files: NewsAttachment[] } | { ok: false; error: string }> {
  const total = items.length;
  let done = items.filter(i => i.url).length;
  onProgress?.(done, total);
  for (const it of items) {
    if (it.url) continue;
    const url = await db.uploadFile(it.dataUrl);
    if (!url) return { ok: false, error: `Envoi impossible pour « ${it.name} ». Réessaie.` };
    it.url = url;
    done += 1;
    onProgress?.(done, total);
  }
  return { ok: true, files: items.map(i => ({ url: i.url as string, name: i.name, kind: i.kind, size: i.after })) };
}
