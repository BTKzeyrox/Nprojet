// Envoie les 3 fonctions serveur (df-api avec tous les fichiers de son dossier : totp.ts, accounting.ts, site-config.ts, df-restore, df-assistant) sur le projet Supabase de site.config.json (2026-11-19).
// Lancer : SUPABASE_ACCESS_TOKEN=sbp_... npm run deploy:server -- --confirm-ref <ref>      (ajouter --dry-run pour voir sans rien envoyer)
// Le --confirm-ref doit être le ref de site.config.json : un oubli ou une erreur de dossier ne peut pas envoyer sur le mauvais projet.
// Utilise la CLI Supabase officielle en mode « API » (sans Docker). Le token (Supabase > Account > Access Tokens) n'est lu que dans l'environnement.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const CLI = 'supabase@3.2.0';
const FUNCTIONS = ['df-api', 'df-restore', 'df-assistant'];
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const dry = args.includes('--dry-run');
const die = (m) => { console.error('ARRÊT : ' + m); process.exit(1); };

const mod = await import('data:text/javascript;base64,' + Buffer.from(transformSync(readFileSync('src/utils/siteConfig.ts', 'utf8'), { loader: 'ts', format: 'esm' }).code).toString('base64'));
const cfg = JSON.parse(readFileSync('site.config.json', 'utf8'));
const problems = mod.configProblems(cfg);
if (problems.length) die(problems.join('\n'));
const ref = cfg.supabase.ref;
if (opt('confirm-ref') !== ref) die(`ajoute --confirm-ref ${ref} pour confirmer le projet visé (site.config.json). Reçu : ${JSON.stringify(opt('confirm-ref'))}.`);
if (readFileSync('supabase/functions/df-api/site-config.ts', 'utf8') !== mod.serverConfigSource(cfg)) die('supabase/functions/df-api/site-config.ts n\'est pas à jour : lance « npm run config:sync » puis recommence.');
if (!dry && !process.env.SUPABASE_ACCESS_TOKEN) die('la variable SUPABASE_ACCESS_TOKEN (token personnel Supabase, commence par sbp_) est absente.');

const cmds = FUNCTIONS.map(f => ['npx', ['--yes', CLI, 'functions', 'deploy', f, '--project-ref', ref, '--use-api']]);
for (const [c, a] of cmds) console.log((dry ? 'À faire : ' : 'Envoi : ') + [c, ...a].join(' '));
if (dry) { console.log(`\nEssai à blanc : rien n'a été envoyé. Projet visé : https://${ref}.supabase.co`); process.exit(0); }

for (const [c, a] of cmds) { const r = spawnSync(c, a, { stdio: 'inherit', env: process.env }); if (r.status !== 0) die(`l'envoi a échoué (${a[3]}). Rien d'autre n'a été modifié ; corrige puis relance.`); }

// Test de santé : la route publique « signup-info » doit répondre en JSON
const url = `https://${ref}.supabase.co/functions/v1/df-api/signup-info`;
let healthy = false;
for (let i = 0; i < 5 && !healthy; i++) {
  try { const r = await fetch(url); healthy = r.ok && /json/.test(r.headers.get('content-type') || ''); } catch { /* on réessaie */ }
  if (!healthy) await new Promise(r => setTimeout(r, 3000));
}
console.log(healthy ? `\nServeur en ligne : ${url} répond.` : `\nAttention : ${url} ne répond pas encore. Attends 1 minute et ouvre-la dans un navigateur ; sinon vois NOUVEAU_PROJET.md (erreurs fréquentes).`);
process.exit(healthy ? 0 : 2);
