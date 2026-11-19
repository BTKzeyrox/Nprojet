// Contrôle « zéro trace de l'ancien compte » (2026-11-19). Dans une COPIE du site, aucun fichier de code, de réglage ou de SQL ne doit citer le Supabase,
// le Cloudinary ni le dépôt de Nprojet (les textes .md sont listés pour être réécrits, sans bloquer). Dans le dépôt d'ORIGINE, le contrôle ne s'applique pas.
// Lancer : npm run check:no-old-account
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ORIGIN, findTraces } from './lib/oldAccount.mjs';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };

// 1) Le détecteur lui-même, sur un dossier de test
const t = mkdtempSync(join(tmpdir(), 'traces-'));
try {
  mkdirSync(join(t, 'src')); mkdirSync(join(t, 'node_modules'));
  writeFileSync(join(t, 'src/a.ts'), `const u = 'https://${ORIGIN.supabaseRef}.supabase.co';`);
  writeFileSync(join(t, 'notes.md'), `Dépôt ${ORIGIN.githubRepo}`);
  writeFileSync(join(t, 'node_modules/x.js'), ORIGIN.cloudinaryCloud);
  writeFileSync(join(t, 'propre.ts'), 'export const x = 1;');
  const r = findTraces(t);
  ok(r.code.length === 1 && r.code[0].startsWith('src/a.ts'), 'détecteur : trouve le Supabase d\'origine dans un fichier de code');
  ok(r.docs.length === 1 && r.docs[0].startsWith('notes.md'), 'détecteur : un texte .md est signalé à part (non bloquant)');
  ok(!r.code.concat(r.docs).some(x => x.startsWith('node_modules') || x.startsWith('propre')), 'détecteur : ignore node_modules et les fichiers propres');
  for (const [k, v] of Object.entries(ORIGIN)) { writeFileSync(join(t, 'src/b.ts'), `x ${v} y`); ok(findTraces(t).code.some(x => x.startsWith('src/b.ts')), `détecteur : reconnaît ${k}`); }
} finally { rmSync(t, { recursive: true, force: true }); }

// 2) Le dépôt où l'on est
const cfg = JSON.parse(readFileSync('site.config.json', 'utf8'));
if (cfg.supabase.ref === ORIGIN.supabaseRef) {
  console.log('INFO  dépôt d\'origine (Nprojet) : le contrôle « zéro trace » ne s\'applique qu\'aux copies');
} else {
  const share = cfg.cloudinary.cloudName === ORIGIN.cloudinaryCloud; // même Cloudinary gardé volontairement : pas une trace
  if (share) console.log('INFO  Cloudinary partagé avec Nprojet (volontaire) : son nom n\'est pas compté comme une trace');
  const r = findTraces('.', { shareCloudinary: share });
  ok(r.code.length === 0, 'copie : aucune trace de Nprojet dans le code, les réglages ni le SQL' + (r.code.length ? ' : ' + r.code.join(' ; ') : ''));
  if (r.docs.length) console.log(`INFO  ${r.docs.length} texte(s) .md citent encore Nprojet (à réécrire pour ta copie) : ${r.docs.join(' ; ')}`);
}
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
