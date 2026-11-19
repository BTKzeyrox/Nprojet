// Contrôle du script « copier le site » (2026-11-19) : refus des mauvais choix, 2 commits (copie pure identique + comptes seulement),
// envoi vers un dépôt de test local, aucun token écrit dans la copie, dépôt d'origine intact. Lancer : npm run check:copy-project
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findTraces } from './lib/oldAccount.mjs';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const run = (a, env = {}) => spawnSync('node', ['scripts/copy-project.mjs', '--allow-dirty', ...a], { encoding: 'utf8', env: { ...process.env, GH_TOKEN: '', ...env } });
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const cur = JSON.parse(readFileSync('site.config.json', 'utf8'));
const NEW = 'abcdefghijklmnopqrst';
const before = git('.', 'rev-parse', 'HEAD');

const refuse = (a, re, m) => { const r = run(a); ok(r.status === 1 && re.test(r.stderr), m); };
refuse(['--repo', 'moi/copie'], /obligatoires/, 'refus : ref Supabase absent');
refuse(['--repo', cur.github.repo, '--supabase-ref', NEW], /protégé/, 'refus : copier sur le dépôt d\'origine');
refuse(['--repo', 'BTKzeyrox/DF-boosting', '--supabase-ref', NEW], /protégé/, 'refus : écraser DF-boosting');
refuse(['--repo', 'moi/copie', '--supabase-ref', cur.supabase.ref], /celui d'ici/, 'refus : réutiliser la base Supabase d\'origine');
refuse(['--repo', 'moi/copie', '--supabase-ref', 'NOPE'], /supabase\.ref/, 'refus : ref Supabase invalide (message clair)');
refuse(['--repo', 'moi/copie', '--supabase-ref', NEW, '--push'], /GH_TOKEN/, 'refus : --push sans token');

const tmp = mkdtempSync(join(tmpdir(), 'check-copie-'));
try {
  const out = join(tmp, 'copie');
  const r = run(['--repo', 'moi/copie', '--supabase-ref', NEW, '--cloud', 'mon-cloud', '--out', out]);
  ok(r.status === 0, 'copie sans envoi : réussie' + (r.status ? ' : ' + r.stderr : ''));
  const log = git(out, 'log', '--format=%s').split('\n');
  ok(log.length === 2 && /^Copie pure/.test(log[1]) && /^Comptes de cette copie/.test(log[0]), '2 commits : copie pure, puis comptes');
  ok(git(out, 'rev-parse', 'HEAD~1^{tree}') === git('.', 'rev-parse', 'HEAD^{tree}'), 'commit 1 : identique à l\'original (même arbre git)');
  ok(git(out, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n').sort().join() === 'site.config.json,supabase/functions/df-api/site-config.ts', 'commit 2 : seulement site.config.json et site-config.ts');
  const c = JSON.parse(readFileSync(join(out, 'site.config.json'), 'utf8'));
  ok(c.supabase.ref === NEW && c.cloudinary.cloudName === 'mon-cloud' && c.github.repo === 'moi/copie', 'comptes de la copie : nouveau Supabase, Cloudinary et dépôt');
  const srv = readFileSync(join(out, 'supabase/functions/df-api/site-config.ts'), 'utf8');
  ok(srv.includes(`"${NEW}"`) && srv.includes('"mon-cloud"') && !srv.includes(cur.supabase.ref), 'serveur de la copie : lit les nouveaux comptes');
  const tr = findTraces(out); // (--cloud mon-cloud : aucune trace, Cloudinary compris)
  ok(tr.code.length === 0, 'copie : aucune trace du compte d\'origine dans le code, les réglages ni le SQL' + (tr.code.length ? ' : ' + tr.code.join(' ; ') : ''));
  ok(!existsSync(join(out, 'node_modules')) && !existsSync(join(out, 'supabase/setup-complete.sql')), 'la copie ne contient ni node_modules ni fichiers générés');

  // Envoi vers un dépôt de test local (le vrai GitHub n'est jamais touché ici)
  const bare = join(tmp, 'distant.git');
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  const out2 = join(tmp, 'copie2');
  const r2 = run(['--repo', 'moi/copie', '--supabase-ref', NEW, '--out', out2, '--push', '--remote-url', 'file://' + bare], { GH_TOKEN: 'ghp_FAUXTOKENPOURLETEST' });
  ok(r2.status === 0 && git(bare, 'rev-list', '--count', 'main') === '2', 'envoi : le dépôt distant reçoit les 2 commits' + (r2.status ? ' : ' + r2.stderr : ''));
  ok(!/ghp_FAUX|x-access-token/.test(r2.stdout + r2.stderr + readFileSync(join(out2, '.git/config'), 'utf8')), 'le token n\'apparaît ni dans les messages ni dans la configuration git de la copie');
  const r3 = run(['--repo', 'moi/copie', '--supabase-ref', NEW, '--out', out2]);
  ok(r3.status === 1 && /déjà un dépôt git/.test(r3.stderr), 'refus : dossier de sortie déjà utilisé (rien n\'est écrasé)');
} finally { rmSync(tmp, { recursive: true, force: true }); }
ok(git('.', 'rev-parse', 'HEAD') === before, 'le dépôt d\'origine n\'a pas bougé');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
