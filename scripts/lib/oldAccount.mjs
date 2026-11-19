// Les comptes du site d'ORIGINE (Nprojet) et la recherche de leurs traces dans une copie (2026-11-19).
// Utilisé par : scripts/check-no-old-account.mjs (npm run check:no-old-account) et scripts/copy-project.mjs (vérification avant envoi).
// Ce fichier est le seul endroit (avec site.config.json de l'original) où ces valeurs ont le droit d'être écrites.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const ORIGIN = {
  supabaseRef: 'fvkusbdhetxleimtdzqm',
  cloudinaryCloud: 'dirnrsy5v',
  githubRepo: 'BTKzeyrox/Nprojet',
  vercelHost: 'nprojet-beta.vercel.app',
};
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build']);
const SKIP_FILES = new Set(['scripts/lib/oldAccount.mjs']);
const TEXT_RE = /\.(ts|tsx|js|mjs|cjs|json|sql|html|css|toml|yml|yaml|md|txt|env|example)$/i;

/** Cherche les comptes d'origine dans un dossier. `code` = fichiers qui les contiennent (bloquant) ; `docs` = textes .md (à réécrire, non bloquant). */
/** `opts.shareCloudinary` : la copie garde volontairement le même Cloudinary (les photos restent au même endroit) : son nom n'est alors pas une trace. */
export function findTraces(root, opts = {}) {
  const VALUES = Object.entries(ORIGIN).filter(([k]) => !(opts.shareCloudinary && k === 'cloudinaryCloud')).map(([, v]) => v);
  const code = [], docs = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (SKIP_DIRS.has(n)) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      const rel = relative(root, p).split('\\').join('/');
      if (SKIP_FILES.has(rel) || !TEXT_RE.test(n) || n === 'package-lock.json') continue;
      const t = readFileSync(p, 'utf8');
      const found = VALUES.filter(v => t.includes(v));
      if (found.length) (/\.md$/i.test(n) ? docs : code).push(`${rel} → ${found.join(', ')}`);
    }
  };
  walk(root);
  return { code, docs };
}
