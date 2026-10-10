// Crée le compte administrateur : affiche le SQL à lancer (le mot de passe n'est jamais écrit dans un fichier).
// Usage :  ADMIN_USERNAME=admin ADMIN_NAME="Nom Affiché" ADMIN_PASSWORD="mot-de-passe-d-au-moins-6-caractères" node supabase/create_admin.mjs
// Puis lancer le SQL affiché dans Supabase (SQL Editor ou connecteur). Ne pas garder ce SQL dans un fichier.
import { randomBytes, scryptSync } from 'node:crypto';

const username = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
const name = String(process.env.ADMIN_NAME || '').trim();
const password = String(process.env.ADMIN_PASSWORD || '');
if (!/^[a-z0-9_.-]{3,30}$/.test(username)) { console.error('ADMIN_USERNAME : 3 à 30 lettres/chiffres (a-z, 0-9, _ . -).'); process.exit(1); }
if (!name || name.length > 60) { console.error('ADMIN_NAME : le nom affiché (1 à 60 caractères).'); process.exit(1); }
if (password.length < 6) { console.error('ADMIN_PASSWORD : 6 caractères minimum.'); process.exit(1); }

const salt = randomBytes(16).toString('hex');
const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`; // même format que le serveur (df-api)
// L'identifiant « user-admin-1 » est attendu par le site : ne pas le changer.
const doc = {
  id: 'user-admin-1', name, username, role: 'admin', status: 'active', shift: 'day', is_online: false,
  total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0, performance_badge: 'Standard',
};
const q = s => s.replace(/'/g, "''");
console.log(`insert into public.df_users (id, data) values ('user-admin-1', '${q(JSON.stringify(doc))}'::jsonb)
  on conflict (id) do update set data = excluded.data, updated_at = now();
insert into public.df_credentials (user_id, username, password_hash) values ('user-admin-1', '${q(username)}', '${hash}')
  on conflict (user_id) do update set username = excluded.username, password_hash = excluded.password_hash, updated_at = now();`);
