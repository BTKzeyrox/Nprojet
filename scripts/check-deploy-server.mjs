// Contrôle du script de déploiement du serveur (2026-11-19), sans rien envoyer : confirmation du projet, token, fichiers à jour, commandes prévues.
// Lancer : npm run check:deploy-server
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const run = (a, env = {}) => spawnSync('node', ['scripts/deploy-server.mjs', ...a], { encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: '', ...env } });
const ref = JSON.parse(readFileSync('site.config.json', 'utf8')).supabase.ref;

let r = run(['--dry-run']);
ok(r.status === 1 && /--confirm-ref/.test(r.stderr), 'refus : sans --confirm-ref');
r = run(['--dry-run', '--confirm-ref', 'abcdefghijklmnopqrst']);
ok(r.status === 1 && /--confirm-ref/.test(r.stderr), 'refus : --confirm-ref différent du ref de site.config.json');
r = run(['--confirm-ref', ref]);
ok(r.status === 1 && /SUPABASE_ACCESS_TOKEN/.test(r.stderr), 'refus : envoi réel sans token');
r = run(['--dry-run', '--confirm-ref', ref]);
const lines = r.stdout.split('\n').filter(l => l.startsWith('À faire'));
ok(r.status === 0 && lines.length === 3, 'essai à blanc : 3 envois prévus');
ok(['df-api', 'df-restore', 'df-assistant'].every(f => lines.some(l => l.includes(`functions deploy ${f} `) && l.includes(`--project-ref ${ref}`) && l.includes('--use-api'))), 'df-api, df-restore et df-assistant visent le projet de site.config.json');
ok(/rien n'a été envoyé/.test(r.stdout), 'essai à blanc : rien n\'est envoyé');
ok(!/ghp_|sbp_/.test(r.stdout + r.stderr), 'aucun token dans les messages');
// Les fichiers envoyés avec df-api sont bien dans son dossier (le déploiement envoie tout le dossier)
const files = spawnSync('ls', ['supabase/functions/df-api'], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).sort().join();
ok(files === 'accounting.ts,index.ts,site-config.ts,totp.ts', 'dossier df-api : accounting.ts, index.ts, site-config.ts et totp.ts (tout est envoyé ensemble)');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
