// Lance toutes les commandes `npm run check:*` et dit lesquelles échouent.
// Utilisé par : .github/workflows/ci.yml. Pour lancer à la main : node scripts/run-checks.mjs
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Le guide cite supabase/setup-complete.sql (fichier fabriqué, absent d'une copie neuve) : on le fabrique d'abord.
spawnSync('node', ['scripts/build-setup-sql.mjs'], { stdio: 'ignore' });

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const names = Object.keys(pkg.scripts).filter((k) => k.startsWith('check:') && k !== 'check:all');
const parallel = Number(process.env.CHECK_PARALLEL || 6);
const failed = [];
let next = 0;
let done = 0;

// Un contrôle de vitesse peut rater sur une machine lente : on le relance une fois avant de dire « échec ».
async function runOne(name) {
  const first = await runOnce(name);
  if (first.code === 0) return report(name, first);
  return report(name, await runOnce(name));
}

function report(name, r) {
  done++;
  if (r.code !== 0) failed.push({ name, out: r.out.split('\n').slice(-15).join('\n') });
  console.log(`[${done}/${names.length}] ${r.code === 0 ? 'OK ' : 'ÉCHEC'} ${name}`);
}

function runOnce(name) {
  return new Promise((resolve) => {
    const p = spawn('npm', ['run', '--silent', name], { shell: process.platform === 'win32' });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => p.kill(), 120000);
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

async function worker() {
  while (next < names.length) await runOne(names[next++]);
}

await Promise.all(Array.from({ length: parallel }, worker));
console.log(`\n${names.length - failed.length} réussis, ${failed.length} échecs`);
for (const f of failed) console.log(`\n--- ${f.name} ---\n${f.out}`);
process.exit(failed.length ? 1 : 0);
