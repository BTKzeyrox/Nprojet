// Écrit supabase/setup-complete.sql : TOUT ce qu'il faut lancer dans un projet Supabase neuf (2026-11-19). Lancer : npm run setup:sql
// Le ref vient de site.config.json. Le fichier n'est pas gardé dans git (il contient l'adresse du projet) : on le refait à la demande.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildSetupSql } from './lib/setupSql.mjs';

const cfg = JSON.parse(readFileSync('site.config.json', 'utf8'));
const sql = buildSetupSql(cfg.supabase.ref);
writeFileSync('supabase/setup-complete.sql', sql);
console.log(`supabase/setup-complete.sql écrit (${sql.split('\n').length} lignes) pour https://${cfg.supabase.ref}.supabase.co`);
