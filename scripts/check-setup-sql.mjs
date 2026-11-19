// Contrôle du SQL d'installation d'une base NEUVE (2026-11-19) sur un VRAI Postgres local (PGlite) : il s'applique en entier, aucune adresse de
// Nprojet n'y reste, les tâches planifiées lisent l'adresse dans le coffre-fort, et chaque table que le serveur utilise existe. Lancer : npm run check:setup-sql
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const site = JSON.parse(readFileSync('site.config.json', 'utf8')); // les comptes d'origine (à ne retrouver nulle part dans le SQL d'une copie)
import { buildSetupSql, migrationFiles } from './lib/setupSql.mjs';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const REF = 'abcdefghijklmnopqrst';
// pg_cron et pg_net n'existent pas dans le Postgres de test : leurs lignes « create extension » sont retirées (le décor ci-dessous les remplace)
const sql = buildSetupSql(REF, { withExtensions: false }).replace(/^create extension [^;]*;\s*$/gim, '');

// Décor : ce que Supabase fournit déjà (rôles, coffre-fort, tâches planifiées, réseau, stockage), en version minimale
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema vault; create schema cron; create schema net; create schema storage;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(s text, n text default null, d text default '') returns uuid language sql as $$ insert into vault.secrets (name, secret) values (n, s) returning id $$;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
  create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
  create function net.http_post(url text, headers jsonb default '{}', body jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
`);
let applied = true, msg = '';
try { await db.exec(sql); } catch (e) { applied = false; msg = String(e.message || e); }
ok(applied, 'le SQL complet s\'applique sans erreur sur une base neuve' + (msg ? ' : ' + msg : ''));
if (!applied) { console.log('\n1 échec'); process.exit(1); }

const rows = async (q) => (await db.query(q)).rows;
ok(!sql.includes(site.supabase.ref) && !sql.includes(site.cloudinary.cloudName), 'aucune adresse ni compte du site d\'origine dans le SQL');
const sec = await rows(`select decrypted_secret from vault.decrypted_secrets where name = 'df_project_url'`);
ok(sec.length === 1 && sec[0].decrypted_secret === `https://${REF}.supabase.co`, 'l\'adresse du projet est rangée dans le coffre-fort');
const jobs = await rows(`select jobname, command from cron.job order by 1`);
const http = jobs.filter(j => /net\.http_post/.test(j.command));
ok(http.length === 4 && http.every(j => /df_project_url/.test(j.command) && !/supabase\.co/.test(j.command)), `4 tâches qui appellent le serveur lisent son adresse dans le coffre-fort (${http.map(j => j.jobname).join(', ')})`);
ok(jobs.length === 5 && jobs.some(j => j.jobname === 'df-nightly-backup' && /df_take_backup/.test(j.command)), '5 tâches planifiées au total, dont la sauvegarde de nuit (comme dans la base de Nprojet)');
const bk = await rows(`select public.df_take_backup() as id`);
ok(bk.length === 1 && Number((await rows(`select count(*)::int as n from public.df_backups`))[0].n) === 1, 'df_take_backup() fabrique bien une sauvegarde sur la base neuve');
ok(await db.query(`select 1 from vault.decrypted_secrets where name = 'push_cron_secret'`).then(r => r.rows.length === 1), 'le secret des tâches planifiées (push_cron_secret) est créé');

// Rejouer : refus ou succès, mais jamais de demi-installation silencieuse ; on dit lequel
let replay = 'ok'; try { await db.exec(sql); } catch (e) { replay = 'refusé'; }
console.log('INFO  rejouer le SQL complet :', replay === 'ok' ? 'accepté (idempotent)' : 'refusé : à lancer une seule fois (dit en tête du fichier)');

// Toutes les tables créées par les migrations existent, avec RLS
const created = new Set();
for (const f of ['schema.sql', ...migrationFiles().map(m => 'migrations/' + m)]) for (const m of readFileSync('supabase/' + f, 'utf8').matchAll(/create table (?:if not exists )?public\.(df_[a-z_]+)/g)) created.add(m[1]);
const tables = await rows(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'df\\_%'`);
const have = new Map(tables.map(t => [t.relname, t.relrowsecurity]));
ok([...created].every(t => have.has(t)), `les ${created.size} tables des fichiers SQL existent après l'installation`);
const noRls = tables.filter(t => !t.relrowsecurity).map(t => t.relname);
ok(noRls.length === 0, 'toutes les tables df_* ont la sécurité de ligne (RLS) activée' + (noRls.length ? ' : manque ' + noRls.join(', ') : ''));

// Tout ce que le serveur lit ou écrit existe
const fnames = new Set((await rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).map(r => r.proname));
const used = new Set();
for (const f of ['supabase/functions/df-api/index.ts', 'supabase/functions/df-restore/index.ts', 'supabase/functions/df-assistant/index.ts']) for (const m of readFileSync(f, 'utf8').matchAll(/["'`](df_[a-z_]+)["'`]/g)) used.add(m[1]);
const secretNames = new Set(['df_project_url']);
const missing = [...used].filter(n => !have.has(n) && !fnames.has(n) && !secretNames.has(n) && n !== 'df_session_token_v2');
ok(missing.length === 0, 'chaque table ou fonction df_* citée par le serveur existe dans la base neuve' + (missing.length ? ' : MANQUE ' + missing.join(', ') : ''));
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
