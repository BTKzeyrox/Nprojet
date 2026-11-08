// Donner un compte à un employé « saisie seulement » (T3). Lancer : npm run check:give-account
import { readFileSync } from 'node:fs';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8'), st = readFileSync('src/db/store.ts', 'utf8'), ui = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8');
const fn = src.slice(src.indexOf('async function giveAccount'), src.indexOf('async function setPassword'));
ok(/if \(me\.role !== 'admin'\) return res\.status\(403\)/.test(fn), 'serveur : responsable seulement');
ok(/!isEntryOnly\(target\)/.test(fn), 'serveur : seulement pour un employé « saisie seulement »');
ok(/\[a-z0-9_\.-\]\{3,30\}/.test(fn) && /password\.length < 6/.test(fn) && /status\(409\)/.test(fn), 'serveur : mêmes règles que la création (pseudo, 6 caractères, pseudo unique)');
ok(/delete rec\.entry_only/.test(fn) && /df_credentials'\)\.insert/.test(fn) && /hashPw\(password\)/.test(fn), 'serveur : le drapeau est retiré, le mot de passe est chiffré');
ok(/\.\.\.target, username: uname/.test(fn), 'serveur : l\'historique et la paie restent (même identifiant de personne)');
ok(/action === "give-account" && req\.method === "POST"/.test(src), 'serveur : route branchée');
ok(/async giveAccount/.test(st) && /'give-account'/.test(st) && /delete \(u as any\)\.entry_only/.test(st), 'magasin : démo et serveur');
ok(/data-give-account/.test(ui) && /data-give-submit/.test(ui) && /!\(editingUser as any\)\.entry_only && <div>/.test(ui), 'écran : « Donner un compte » remplace le mot de passe pour un employé « saisie seulement »');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
