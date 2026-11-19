// Copie le site dans un NOUVEAU dépôt GitHub, avec un autre projet Supabase (2026-11-19). Lancer : npm run copy:project -- --help
// Fait 2 commits dans le nouveau dépôt : (1) copie pure et identique du dernier commit d'ici (même arbre git, vérifié) ; (2) seulement les comptes
// (site.config.json + supabase/functions/df-api/site-config.ts). Ne touche JAMAIS à ce dépôt-ci ni à son GitHub : il ne fait que lire.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const HERE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Dépôts à ne JAMAIS écraser (Nprojet lui-même, DF-boosting, nova-language-coach). */
const PROTECTED = ['btkzeyrox/nprojet', 'btkzeyrox/df-boosting', 'btkzeyrox/nova-language-coach'];

const HELP = `Copier le site dans un nouveau dépôt, avec un autre Supabase.

  npm run copy:project -- --repo COMPTE/NOUVEAU --supabase-ref REF20LETTRES [--cloud NOM_CLOUDINARY] [--out DOSSIER] [--push] [--create]

  --repo          nouveau dépôt GitHub (compte/nom). Jamais le dépôt d'origine, ni DF-boosting, ni nova-language-coach.
  --supabase-ref  ref du NOUVEAU projet Supabase (20 lettres, visible dans https://<ref>.supabase.co). Différent de l'actuel.
  --cloud         nom du cloud Cloudinary (par défaut : celui d'ici, si les photos restent chez le même Cloudinary).
  --out           dossier où écrire la copie (par défaut : un dossier temporaire affiché à la fin).
  --push          envoie sur GitHub. Le token est lu dans la variable GH_TOKEN (jamais dans la commande, jamais écrit dans un fichier).
  --create        avec --push : crée d'abord le dépôt (privé) s'il n'existe pas (il faut le droit « repo » sur le token ; la commande gh est utilisée).
  --allow-dirty   accepter des changements non enregistrés ici (ils sont ignorés : seul le dernier commit est copié).
  --remote-url    adresse du dépôt à la place de https://github.com/COMPTE/NOUVEAU.git (pour les essais).
Sans --push, rien n'est envoyé : tu relis la copie, puis tu relances avec --push.`;

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || !args.length) { console.log(HELP); process.exit(args.length ? 0 : 1); }
const opt = (n) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined; };
const flag = (n) => args.includes('--' + n);
const die = (m) => { console.error('ARRÊT : ' + m); process.exit(1); };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Les règles de réglages sont celles du site (src/utils/siteConfig.ts) : une seule source
const mod = await import('data:text/javascript;base64,' + Buffer.from(transformSync(readFileSync(join(HERE, 'src/utils/siteConfig.ts'), 'utf8'), { loader: 'ts', format: 'esm' }).code).toString('base64'));
const cur = JSON.parse(readFileSync(join(HERE, 'site.config.json'), 'utf8'));
const repo = opt('repo'), ref = opt('supabase-ref'), cloud = opt('cloud') || cur.cloudinary.cloudName;
if (!repo || !ref) die('--repo et --supabase-ref sont obligatoires (voir --help).');
const next = { supabase: { ref }, cloudinary: { cloudName: cloud }, github: { repo } };
const problems = mod.configProblems(next);
if (problems.length) die(problems.join('\n'));
if (ref === cur.supabase.ref) die(`le ref Supabase est celui d'ici (${ref}) : la copie écrirait dans la base d'origine. Donne le ref du NOUVEAU projet.`);
if (PROTECTED.includes(repo.toLowerCase()) || repo.toLowerCase() === cur.github.repo.toLowerCase()) die(`le dépôt « ${repo} » est protégé (origine ou autre projet) : choisis un nouveau nom.`);
if (flag('push') && !process.env.GH_TOKEN && !opt('remote-url')) die('--push demande le token GitHub dans la variable GH_TOKEN.');

// 1) Il faut un état propre et un commit ici
let sha, srcTree;
try { sha = git(HERE, 'rev-parse', 'HEAD'); srcTree = git(HERE, 'rev-parse', 'HEAD^{tree}'); } catch { die('ce dossier n\'est pas un dépôt git avec au moins un commit.'); }
if (git(HERE, 'status', '--porcelain').split('\n').some(l => l && !l.includes('node_modules')) && !flag('allow-dirty')) die('des changements ne sont pas enregistrés (commit) ici. Enregistre-les, ou ajoute --allow-dirty (ils seront ignorés).');

// 2) Copie pure : les fichiers du dernier commit, sans l'historique
const out = resolve(opt('out') || mkdtempSync(join(tmpdir(), 'copie-site-')));
if (existsSync(join(out, '.git'))) die(`${out} contient déjà un dépôt git : choisis un dossier vide.`);
mkdirSync(out, { recursive: true });
execFileSync('sh', ['-c', 'git archive HEAD | tar -x -C "$OUT"'], { cwd: HERE, env: { ...process.env, OUT: out } });
const id = ['-c', 'user.name=Copie du site', '-c', 'user.email=copie@users.noreply.github.com', '-c', 'commit.gpgsign=false'];
git(out, 'init', '-q', '-b', 'main');
git(out, 'add', '-A');
git(out, ...id, 'commit', '-q', '-m', `Copie pure de ${cur.github.repo} (commit ${sha.slice(0, 7)}), sans aucun changement`);
if (git(out, 'rev-parse', 'HEAD^{tree}') !== srcTree) die('la copie n\'est pas identique à l\'original (arbres git différents). Rien n\'a été envoyé.');

// 3) Les comptes seulement
writeFileSync(join(out, 'site.config.json'), readFileSync(join(HERE, 'site.config.json'), 'utf8').replace(cur.supabase.ref, next.supabase.ref).replace(cur.cloudinary.cloudName, next.cloudinary.cloudName).replace(cur.github.repo, next.github.repo));
execFileSync('node', [join(HERE, 'scripts/sync-site-config.mjs')], { cwd: out, stdio: ['ignore', 'pipe', 'inherit'] });
git(out, 'add', '-A');
const changed = git(out, 'diff', '--cached', '--name-only').split('\n').sort();
const expected = ['site.config.json', 'supabase/functions/df-api/site-config.ts'];
if (JSON.stringify(changed) !== JSON.stringify(expected)) die(`le 2e commit devait changer seulement ${expected.join(' et ')} (obtenu : ${changed.join(', ')}). Rien n'a été envoyé.`);
git(out, ...id, 'commit', '-q', '-m', `Comptes de cette copie : Supabase ${ref}, Cloudinary ${cloud}, dépôt ${repo}`);
console.log(`Copie prête dans ${out}\n  commit 1 : copie pure, identique à l'original (même arbre git ${srcTree.slice(0, 10)})\n  commit 2 : comptes seulement (${expected.join(', ')})`);

// 4) Envoi (seulement si demandé)
if (!flag('push')) { console.log('\nRien n\'a été envoyé. Relis la copie, puis relance la même commande avec --push.'); process.exit(0); }
const url = opt('remote-url') || `https://github.com/${repo}.git`;
const auth = process.env.GH_TOKEN ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from('x-access-token:' + process.env.GH_TOKEN).toString('base64')}`] : [];
if (flag('create') && !opt('remote-url')) {
  try { execFileSync('gh', ['repo', 'create', repo, '--private'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN } }); console.log(`Dépôt privé ${repo} créé.`); }
  catch (e) { console.log('Création : ' + String(e.stderr || e.message).split('\n')[0] + ' (si le dépôt existe déjà, on continue)'); }
}
git(out, 'remote', 'add', 'origin', url);
try { git(out, ...auth, 'push', '-u', 'origin', 'main'); } catch (e) { die('l\'envoi a échoué : ' + String(e.stderr || e.message).replace(/x-access-token[^\s]*/g, '***').split('\n').slice(0, 3).join(' | ') + '\nSi le dépôt n\'est pas vide ou n\'existe pas, vois NOUVEAU_PROJET.md (ajoute --create pour le créer).'); }
git(out, 'remote', 'set-url', 'origin', url);
console.log(`Envoyé sur ${url} (branche main, sans force). Étape suivante : base de données et serveur (NOUVEAU_PROJET.md).`);
