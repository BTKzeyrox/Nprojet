// Contrôle « comptes du site à un seul endroit » (2026-11-19) : site.config.json est valide, le fichier du serveur en est la copie exacte,
// le site et le serveur le lisent, et aucun compte n'est écrit en dur ailleurs. Lancer : npm run check:site-config
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { configProblems, supabaseUrl, serverConfigSource, REF_RE } from '../src/utils/siteConfig';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const cfg = JSON.parse(readFileSync('site.config.json', 'utf8'));
ok(configProblems(cfg).length === 0, 'site.config.json : réglages valides');
const good = { supabase: { ref: 'abcdefghijklmnopqrst' }, cloudinary: { cloudName: 'mon-cloud' }, github: { repo: 'moi/site' } };
ok(configProblems(good).length === 0, 'un réglage correct est accepté');
ok(configProblems({}).length === 3 && configProblems({ ...good, supabase: { ref: 'A_REMPLIR' } }).length === 1 && configProblems({ ...good, github: { repo: 'sans-slash' } }).length === 1 && configProblems(null).length === 3, 'réglages absents ou faux : une erreur claire par champ');
ok(configProblems({ ...good, supabase: { ref: 'ABCDEFGHIJKLMNOPQRST' } }).length === 1 && !REF_RE.test('abc'), 'ref Supabase : 20 minuscules/chiffres exigés');
ok(supabaseUrl(good) === 'https://abcdefghijklmnopqrst.supabase.co', 'adresse Supabase tirée du ref');
ok(supabaseUrl(good, 'https://autre.supabase.co//') === 'https://autre.supabase.co' && supabaseUrl(good, '  ') === 'https://abcdefghijklmnopqrst.supabase.co', 'VITE_SUPABASE_URL passe avant (sans « / » final) ; vide = ignoré');
const server = readFileSync('supabase/functions/df-api/site-config.ts', 'utf8');
ok(server === serverConfigSource(cfg), 'supabase/functions/df-api/site-config.ts = copie exacte de site.config.json (sinon : npm run config:sync)');
const api = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/from "\.\/site-config\.ts"/.test(api) && /const CLD_CLOUD = SITE\.cloudinaryCloud/.test(api) && /\$\{SITE\.githubRepo\}/.test(api), 'serveur : Cloudinary et adresse VAPID lus dans site-config.ts');
const shared = readFileSync('src/db/storeShared.ts', 'utf8');
ok(/site\.config\.json/.test(shared) && /supabaseUrl\(siteConfig/.test(shared) && !/https:\/\/[a-z0-9]{20}\.supabase\.co/.test(shared), 'site : adresse Supabase lue dans site.config.json, aucun repli écrit en dur');
const vite = readFileSync('vite.config.ts', 'utf8');
ok(/configProblems\(siteConfig\)/.test(vite) && /throw new Error/.test(vite), 'construction : arrêt avec un message clair si les réglages sont faux');
// Aucun compte écrit en dur dans le code (hors réglages, migrations déjà appliquées et textes) : ref, cloud, dépôt
const hard: string[] = [];
const skip = new Set(['node_modules', 'dist', '.git', 'docs']);
const walk = (d: string) => { for (const n of readdirSync(d)) { if (skip.has(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mjs|js|html|toml)$/.test(n) && !/site-config\.ts$|check-site-config\.ts$|oldAccount/.test(n) && p !== 'scripts/lib/oldAccount.mjs') { const t = readFileSync(p, 'utf8'); for (const v of [cfg.supabase.ref, cfg.cloudinary.cloudName, cfg.github.repo]) if (t.includes(v)) hard.push(`${p} → ${v}`); } } };
for (const d of ['src', 'supabase/functions', 'scripts', 'public']) walk(d);
for (const f of ['index.html', 'vite.config.ts', 'supabase/config.toml']) { const t = readFileSync(f, 'utf8'); for (const v of [cfg.supabase.ref, cfg.cloudinary.cloudName, cfg.github.repo]) if (t.includes(v)) hard.push(`${f} → ${v}`); }
ok(hard.length === 0, 'aucun compte écrit en dur dans le code' + (hard.length ? ' : ' + hard.join(' ; ') : ''));
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
