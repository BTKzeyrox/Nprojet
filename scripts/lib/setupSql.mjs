// Fabrique le SQL complet d'une base NEUVE (2026-11-19) : extensions, adresse du projet dans le coffre-fort, schema.sql, seed.sql,
// puis toutes les migrations dans l'ordre. Utilisé par : scripts/build-setup-sql.mjs (npm run setup:sql) et scripts/check-setup-sql.mjs.
import { readFileSync, readdirSync } from 'node:fs';

const REF_RE = /^[a-z0-9]{20}$/;

/** Les migrations dans l'ordre (le nom commence par la date). */
export const migrationFiles = (dir = 'supabase/migrations') => readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

/** `ref` = le ref du projet Supabase (site.config.json). `opts.withExtensions` = false pour un Postgres de test sans pg_cron / pg_net. */
export function buildSetupSql(ref, opts = {}) {
  if (!REF_RE.test(String(ref))) throw new Error(`ref Supabase invalide : ${JSON.stringify(ref)}`);
  const withExt = opts.withExtensions !== false;
  const part = (title, sql) => `\n-- ===================== ${title} =====================\n${sql.trim()}\n`;
  const out = [
    `-- Gestion Pro : installation COMPLÈTE d'une base Supabase NEUVE (généré par \`npm run setup:sql\`, ne pas modifier à la main).\n-- Projet : https://${ref}.supabase.co\n-- À lancer UNE seule fois, dans le SQL Editor du projet NEUF, après avoir activé pg_cron et pg_net (Database > Extensions).`,
  ];
  if (withExt) out.push(part('Extensions', 'create extension if not exists pg_net;\ncreate extension if not exists pg_cron;'));
  out.push(part('Adresse du projet (les tâches planifiées la lisent dans le coffre-fort)', `do $$ begin
  if exists (select 1 from vault.decrypted_secrets where name = 'df_project_url') then
    raise notice 'df_project_url existe déjà : laissé tel quel';
  else
    perform vault.create_secret('https://${ref}.supabase.co', 'df_project_url');
  end if;
end $$;`));
  out.push(part('schema.sql', readFileSync('supabase/schema.sql', 'utf8')));
  out.push(part('seed.sql', readFileSync('supabase/seed.sql', 'utf8')));
  for (const f of migrationFiles()) out.push(part(`migration ${f}`, readFileSync(`supabase/migrations/${f}`, 'utf8')));
  return out.join('');
}
