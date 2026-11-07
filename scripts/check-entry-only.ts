// Employé « suivi par saisie seulement » (module 26, M26.7) : jamais de connexion, jamais « en ligne », présent dans les listes. Lancer : npm run check:entry-only
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { isEntryOnly, entryOnlyRecord } from '../src/utils/entryOnly';
import { countOnline } from '../src/utils/presenceCount';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
new Function(transformSync(grab('ENTRYONLY') + '\n;globalThis.__e = { isEntryOnly, entryOnlyRecord };', { loader: 'ts' }).code)();
const S = (globalThis as any).__e;
const norm = (t: string) => t.replace(/export /g, '').replace(/\s+/g, ' ').trim();
ok(norm(readFileSync('src/utils/entryOnly.ts', 'utf8').match(/\/\/ ===== BEGIN ENTRYONLY =====\n([\s\S]*?)\/\/ ===== END ENTRYONLY =====/)![1]) === norm(grab('ENTRYONLY')), 'le bloc du serveur est la copie exacte du code du site');

ok(isEntryOnly({ entry_only: true }) && !isEntryOnly({}) && !isEntryOnly(null) && !isEntryOnly({ entry_only: 'true' }) && !isEntryOnly({ entry_only: 1 }), 'seul « vrai » compte comme suivi par saisie');
const r: any = entryOnlyRecord({ name: '  Rivo   <b>Rakoto ', team: 'Nord', shift: 'night' }, 1000);
ok(r.ok && r.rec.name === 'Rivo b Rakoto' && r.rec.entry_only === true && r.rec.role === 'employee' && r.rec.is_online === false && r.rec.phone === '' && r.rec.shift === 'night' && r.rec.status === 'active', 'dossier : opérateur actif, sans téléphone, jamais en ligne');
ok(!('password' in r.rec) && !('password_hash' in r.rec), 'dossier : aucun mot de passe');
ok(!(entryOnlyRecord({ name: 'A' }, 1) as any).ok && !(entryOnlyRecord(null, 1) as any).ok && !(entryOnlyRecord({ name: '<>' }, 1) as any).ok, 'nom de moins de 2 lettres : refusé');
ok((entryOnlyRecord({ name: 'Zo', shift: 'x' }, 1) as any).rec.shift === 'day', 'vacation inconnue : jour');
let seed = 5; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
let same = 0; const N = 3000;
for (let i = 0; i < N; i++) {
  const u = pick([null, 5, { name: 'Ab' }, { name: pick(['', 'x', 'Zo\n\tRa', '<<>>', 'é'.repeat(100)]), team: pick([undefined, 'N'.repeat(60), 'x<y']), shift: pick(['day', 'night', 'z', undefined]), entry_only: pick([true, false, 'true', undefined]) }]);
  const a = entryOnlyRecord(u, 777), b = S.entryOnlyRecord(u, 777);
  if (JSON.stringify(a) === JSON.stringify(b) && isEntryOnly(u) === S.isEntryOnly(u)) same++;
}
ok(same === N, `site = serveur sur ${N} dossiers (${same} identiques)`);
const now = Date.now(), fresh = new Date(now - 1000).toISOString();
const us = [{ id: 'a', role: 'employee', entry_only: true }, { id: 'b', role: 'employee' }];
const c = countOnline(us as any, [{ user_id: 'a', last_seen: fresh }, { user_id: 'b', last_seen: fresh }] as any, now);
ok(c.online === 1, 'même avec un signe de vie, un employé « saisie » n\'est jamais compté en ligne');

ok(/entry_only === true\) \{[\s\S]{0,400}entryOnlyRecord\(user, Date\.now\(\)\)/.test(src), 'serveur : créer un employé saisie passe par entryOnlyRecord');
ok(/Ce compte est suivi par saisie : il ne se connecte pas\./.test(src), 'serveur : la connexion est refusée');
ok((src.match(/isEntryOnly\(/g) || []).length >= 3, 'serveur : le drapeau est vérifié (connexion, mot de passe, réécriture)');
ok(/if \(isEntryOnly\(existing\)\) \(toSave as any\)\.entry_only = true; else delete/.test(src), 'serveur : le drapeau ne se change que par la création');
const st = readFileSync('src/db/store.ts', 'utf8'), ui = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8'), ch = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(/addEntryOnlyEmployee[\s\S]{0,200}role !== 'admin'/.test(st), 'magasin : création = responsable seulement');
ok(/data-entry-only-toggle/.test(ui) && /WORK_SETTINGS_LIVE && \(\s*<label data-entry-only-toggle/.test(ui) && /WORK_SETTINGS_LIVE && newEntryOnly/.test(ui), 'fiche « Ajouter » : la case n\'existe que module ouvert');
ok(/!u\.entry_only/.test(ch), 'discussions : pas de conversation avec un employé sans compte');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
