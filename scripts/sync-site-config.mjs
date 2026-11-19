// Écrit supabase/functions/df-api/site-config.ts à partir de site.config.json (2026-11-19). Lancer : npm run config:sync
// Après avoir changé un compte dans site.config.json. `npm run check:site-config` échoue si les deux fichiers ne correspondent plus.
import { readFileSync, writeFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

const src = readFileSync('src/utils/siteConfig.ts', 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(transformSync(src, { loader: 'ts', format: 'esm' }).code).toString('base64'));
const cfg = JSON.parse(readFileSync('site.config.json', 'utf8'));
const problems = mod.configProblems(cfg);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
writeFileSync('supabase/functions/df-api/site-config.ts', mod.serverConfigSource(cfg));
console.log('supabase/functions/df-api/site-config.ts mis à jour.');
