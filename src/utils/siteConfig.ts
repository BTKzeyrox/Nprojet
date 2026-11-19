// Réglages des comptes du site (Supabase, Cloudinary, GitHub) : règles pures, sans écran, sans réseau (2026-11-19).
// Utilisé par : db/storeShared.ts (adresse du serveur), vite.config.ts (la construction s'arrête si les réglages sont faux),
// scripts/sync-site-config.mjs et scripts/check-site-config.ts. Pour modifier un compte : seulement site.config.json, puis `npm run config:sync`.

export interface SiteConfig {
  supabase: { ref: string };
  cloudinary: { cloudName: string };
  github: { repo: string };
}

/** Un projet Supabase a un « ref » de 20 lettres minuscules et chiffres (ex. abcdefghijklmnopqrst). */
export const REF_RE = /^[a-z0-9]{20}$/;
/** Nom de cloud Cloudinary : lettres, chiffres, tirets. */
export const CLOUD_RE = /^[a-z0-9][a-z0-9_-]{1,40}$/i;
/** Dépôt GitHub : « compte/nom ». */
export const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Liste des erreurs (vide = réglages corrects). Les messages disent quoi faire, en mots simples. */
export function configProblems(c: any): string[] {
  const out: string[] = [];
  const ref = c?.supabase?.ref, cloud = c?.cloudinary?.cloudName, repo = c?.github?.repo;
  if (typeof ref !== 'string' || !REF_RE.test(ref)) out.push(`site.config.json : « supabase.ref » doit être le ref du projet Supabase (20 lettres minuscules et chiffres, visible dans l'adresse https://<ref>.supabase.co). Reçu : ${JSON.stringify(ref)}.`);
  if (typeof cloud !== 'string' || !CLOUD_RE.test(cloud)) out.push(`site.config.json : « cloudinary.cloudName » doit être le nom du cloud Cloudinary. Reçu : ${JSON.stringify(cloud)}.`);
  if (typeof repo !== 'string' || !REPO_RE.test(repo)) out.push(`site.config.json : « github.repo » doit être de la forme compte/nom. Reçu : ${JSON.stringify(repo)}.`);
  return out;
}

/** Adresse du projet Supabase, sans « / » final. `override` = réglage Vercel VITE_SUPABASE_URL (facultatif). */
export function supabaseUrl(c: SiteConfig, override?: string): string {
  const o = String(override || '').trim();
  return (o || `https://${c.supabase.ref}.supabase.co`).replace(/\/+$/, '');
}

/** Contenu du fichier lu par le serveur (supabase/functions/df-api/site-config.ts). Le serveur ne peut pas lire site.config.json : il est déployé seul. */
export function serverConfigSource(c: SiteConfig): string {
  return `// GÉNÉRÉ depuis site.config.json par \`npm run config:sync\` : ne pas modifier à la main (\`npm run check:site-config\` compare).
// Les comptes du site lus par le serveur df-api. Déployé avec index.ts et totp.ts.
export const SITE = {
  supabaseRef: ${JSON.stringify(c.supabase.ref)},
  cloudinaryCloud: ${JSON.stringify(c.cloudinary.cloudName)},
  githubRepo: ${JSON.stringify(c.github.repo)},
} as const;
`;
}
