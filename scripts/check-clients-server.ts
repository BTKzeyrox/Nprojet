// Contrôle de la sécurité des clients dans le serveur df-api (module 1, étape M1.3), sans réseau.
// Lancer : npm run check:clients-server
// 1) teste la vraie fonction cleanClient (extraite du fichier du serveur) ; 2) vérifie par lecture du code que la lecture ET l'écriture
// de la collection « clients » sont refusées aux employés, que le lien `client_id` n'est jamais envoyé ni écrit par un employé,
// qu'un client avec des missions ne se supprime pas ; 3) vérifie la migration (RLS, aucun accès public). Si quelqu'un retire une protection, ce contrôle échoue.
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { checkClientDraft } from '../src/utils/clients';

const read = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };

// --- extraire et exécuter les blocs du serveur ---
const block = (name: string) => {
  const m = new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`).exec(src);
  ok(!!m, `bloc « ${name} » trouvé dans le serveur`);
  return transformSync(m![1], { loader: 'ts' }).code;
};
const cashJs = block('CASH').replace(/function cleanCash[\s\S]*$/, '');
const clientsJs = block('CLIENTS');
const privacyJs = block('PRIVACY');
const mod = new Function(`${cashJs}\n${clientsJs}\n${privacyJs}\nreturn { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE, cleanClient, cleanClientRef, withoutClientPrice };`)() as {
  ADMIN_ONLY_READ: string[]; ADMIN_ONLY_WRITE: string[];
  cleanClient: (r: any, e: any, me: string, now: string) => any; cleanClientRef: (v: unknown) => any; withoutClientPrice: (r: any, me: any) => any;
};
const { ADMIN_ONLY_READ, ADMIN_ONLY_WRITE, cleanClient, cleanClientRef, withoutClientPrice } = mod;
const NOW = '2026-10-20T08:00:00.000Z';
const good = { id: 'cl-1', name: 'Atelier Rakoto', contact_name: 'Rakoto', phone: '034 00 000 00', email: 'contact@rakoto.mg', address: 'Antananarivo', note: 'client sérieux', payment_terms_days: 30, price_default_ar: 50000, price_by_type: { 'NO R/C': 40000 }, active: true };

// --- listes de protection ---
ok(ADMIN_ONLY_READ.includes('clients'), 'lecture réservée à l\'admin : clients');
ok(ADMIN_ONLY_WRITE.includes('clients'), 'écriture réservée à l\'admin : clients');
ok(ADMIN_ONLY_READ.includes('cash') && ADMIN_ONLY_WRITE.includes('products'), 'les protections des finances et du stock sont toujours là');

// --- cleanClient : fiches valides ---
const v = cleanClient(good, undefined, 'admin-1', NOW);
ok(v.ok && v.save.created_by === 'admin-1' && v.save.created_at === NOW && v.save.updated_at === NOW, 'fiche valide acceptée, créateur et dates posés par le serveur');
ok(v.save.payment_terms_days === 30 && v.save.price_default_ar === 50000 && v.save.price_by_type['NO R/C'] === 40000 && v.save.active === true, 'échéance, prix et exceptions gardés');
const up = cleanClient({ ...good, name: 'Atelier Rakoto 2', price_default_ar: 50000.6 }, { created_by: 'admin-0', created_at: '2026-10-01T00:00:00.000Z' }, 'admin-1', NOW);
ok(up.ok && up.save.created_by === 'admin-0' && up.save.created_at === '2026-10-01T00:00:00.000Z' && up.save.price_default_ar === 50001, 'modification : créateur et date de création conservés, prix arrondi');
const min = cleanClient({ id: 'cl-2', name: 'Minimal' }, undefined, 'a', NOW);
ok(min.ok && !('payment_terms_days' in min.save) && !('price_default_ar' in min.save) && !('price_by_type' in min.save) && min.save.active === true, 'fiche minimale (juste un nom) acceptée, active par défaut, aucun prix inventé');
ok(cleanClient({ ...good, active: false }, undefined, 'a', NOW).save.active === false, 'client désactivé (archivé) gardé');
ok(cleanClient({ ...good, active: 'non' }, undefined, 'a', NOW).save.active === true, 'active n\'est faux que si c\'est vraiment `false`');
ok(cleanClient({ ...good, payment_terms_days: 0 }, undefined, 'a', NOW).save.payment_terms_days === 0, 'échéance 0 jour (paiement comptant) acceptée');
ok(cleanClient({ ...good, email: '' }, undefined, 'a', NOW).ok, 'e-mail vide accepté');
ok(!('price_by_type' in cleanClient({ ...good, price_by_type: {} }, undefined, 'a', NOW).save), 'exceptions vides : champ non écrit');

// --- cleanClient : fiches refusées ---
const bad = (patch: any, reason: string, name: string) => { const r = cleanClient({ ...good, ...patch }, undefined, 'a', NOW); ok(!r.ok && r.reason === reason, name); };
bad({ name: '' }, 'name', 'nom vide refusé');
bad({ name: '   ' }, 'name', 'nom d\'espaces refusé');
bad({ name: undefined }, 'name', 'nom absent refusé');
bad({ id: '' }, 'id', 'identifiant vide refusé');
bad({ id: 'x'.repeat(81) }, 'id', 'identifiant trop long refusé');
bad({ id: 42 }, 'id', 'identifiant qui n\'est pas un texte refusé');
bad({ email: 'pas-un-email' }, 'email', 'e-mail sans @ refusé');
bad({ email: 'a b@c.mg' }, 'email', 'e-mail avec espace refusé');
bad({ email: '<script>@x.mg' }, 'email', 'e-mail avec < refusé');
bad({ payment_terms_days: -1 }, 'terms', 'échéance négative refusée');
bad({ payment_terms_days: 400 }, 'terms', 'échéance de plus de 365 jours refusée');
bad({ payment_terms_days: 'abc' }, 'terms', 'échéance texte refusée');
bad({ price_default_ar: -5 }, 'price', 'prix négatif refusé');
bad({ price_default_ar: 'abc' }, 'price', 'prix texte refusé');
bad({ price_default_ar: 1e13 }, 'price', 'prix démesuré refusé');
bad({ price_default_ar: NaN }, 'price', 'prix NaN refusé');
bad({ price_by_type: [1, 2] }, 'price_by_type', 'exceptions en liste refusées');
bad({ price_by_type: 'x' }, 'price_by_type', 'exceptions en texte refusées');
bad({ price_by_type: { A: -1 } }, 'price_by_type', 'exception négative refusée');
bad({ price_by_type: { A: 'x' } }, 'price_by_type', 'exception texte refusée');
bad({ price_by_type: JSON.parse('{"__proto__": 5}') }, 'price_by_type', 'clé « __proto__ » refusée');
bad({ price_by_type: { constructor: 5 } }, 'price_by_type', 'clé « constructor » refusée');
bad({ price_by_type: Object.fromEntries(Array.from({ length: 21 }, (_, i) => ['T' + i, 1000])) }, 'price_by_type', 'plus de 20 exceptions refusées');
ok(!cleanClient(null, undefined, 'a', NOW).ok, 'fiche vide (null) refusée sans erreur');
ok(!cleanClient('x', undefined, 'a', NOW).ok, 'fiche qui est un texte refusée sans erreur');
const long = cleanClient({ ...good, name: 'n'.repeat(300), contact_name: 'c'.repeat(300), phone: 'p'.repeat(300), address: 'a'.repeat(900), note: 'x'.repeat(2000), email: '' }, undefined, 'a', NOW).save;
ok(long.name.length === 80 && long.contact_name.length === 80 && long.phone.length === 40 && long.address.length === 200 && long.note.length === 500, 'textes trop longs coupés (nom 80, contact 80, téléphone 40, adresse 200, note 500)');
const evil = cleanClient({ ...good, password_hash: 'x', role: 'admin', status: 'strategic', revenue: 99 }, undefined, 'a', NOW).save;
ok(!('password_hash' in evil) && !('role' in evil) && !('status' in evil) && !('revenue' in evil), 'champs inconnus non copiés (le statut n\'est jamais stocké)');
ok(cleanClient({ ...good, created_by: 'pirate', created_at: '1999-01-01' }, undefined, 'admin-1', NOW).save.created_by === 'admin-1', 'créateur envoyé par le navigateur ignoré');
ok(cleanClient({ ...good, name: '  Espaces  ' }, undefined, 'a', NOW).save.name === 'Espaces', 'espaces autour du nom retirés');
ok(cleanClient({ ...good, price_by_type: { '  NO R/C  ': 1000 } }, undefined, 'a', NOW).save.price_by_type['NO R/C'] === 1000, 'clé d\'exception nettoyée');

// --- le site (checkClientDraft) et le serveur (cleanClient) donnent le même résultat ---
{
  type Spec = { name?: unknown; contact?: unknown; phone?: unknown; email?: unknown; address?: unknown; note?: unknown; terms?: unknown; price?: unknown; types?: [unknown, unknown][] };
  const toSite = (x: Spec): any => ({ name: x.name, contact_name: x.contact, phone: x.phone, email: x.email, address: x.address, note: x.note, payment_terms_days: x.terms, price_default: x.price, price_by_type: (x.types || []).map(([type, price]) => ({ type, price })) });
  const toServer = (x: Spec): any => ({ id: 'cl-p', name: x.name, contact_name: x.contact, phone: x.phone, email: x.email, address: x.address, note: x.note, payment_terms_days: x.terms, price_default_ar: x.price, price_by_type: x.types ? Object.fromEntries(x.types.map(([k, v]) => [String(k), v])) : undefined });
  const strip = (s: any) => { const { id, active, created_by, created_at, updated_at, ...rest } = s; return rest; };
  const L = (n: number) => 'x'.repeat(n);
  const specs: Spec[] = [
    { name: 'Atelier' }, { name: ' Atelier  ', contact: ' R ', phone: '034', email: 'a@b.mg', address: 'Tana', note: 'ok', terms: 30, price: 50000, types: [['WEB', 12000]] },
    { name: '' }, { name: '   ' }, { name: undefined }, { name: 5 }, { name: L(300), contact: L(300), phone: L(300), address: L(900), note: L(2000) },
    { name: 'X', email: 'oups' }, { name: 'X', email: 'a b@c.mg' }, { name: 'X', email: L(200) + '@b.mg' }, { name: 'X', email: '' }, { name: 'X', email: '  a@b.mg ' },
    { name: 'X', terms: 0 }, { name: 'X', terms: 365 }, { name: 'X', terms: 366 }, { name: 'X', terms: -1 }, { name: 'X', terms: 29.6 }, { name: 'X', terms: 'abc' }, { name: 'X', terms: '' }, { name: 'X', terms: null }, { name: 'X', terms: [5] }, { name: 'X', terms: true }, { name: 'X', terms: NaN }, { name: 'X', terms: Infinity },
    { name: 'X', price: 0 }, { name: 'X', price: 1e12 }, { name: 'X', price: 1e12 + 1 }, { name: 'X', price: 1500.5 }, { name: 'X', price: '2500' }, { name: 'X', price: 'abc' }, { name: 'X', price: [5] }, { name: 'X', price: false }, { name: 'X', price: -0.4 },
    { name: 'X', types: [['WEB', 0]] }, { name: 'X', types: [['WEB', '']] }, { name: 'X', types: [['WEB', null]] }, { name: 'X', types: [['WEB', -1]] }, { name: 'X', types: [['WEB', 'abc']] }, { name: 'X', types: [['WEB', [5]]] }, { name: 'X', types: [['WEB', true]] },
    { name: 'X', types: [['', 500]] }, { name: 'X', types: [['   ', 500]] }, { name: 'X', types: [['__proto__', 5]] }, { name: 'X', types: [['constructor', 5]] }, { name: 'X', types: [['prototype', 5]] },
    { name: 'X', types: [['  WEB ', 1000], ['WEB', 2000]] }, { name: 'X', types: [[L(60), 1000]] }, { name: 'X', types: [] },
    { name: 'X', types: Array.from({ length: 20 }, (_, i) => ['T' + i, 100] as [string, number]) }, { name: 'X', types: Array.from({ length: 21 }, (_, i) => ['T' + i, 100] as [string, number]) },
  ];
  let same = 0; const diffs: string[] = [];
  for (const sp of specs) {
    const a = checkClientDraft(toSite(sp)), b = cleanClient(toServer(sp), undefined, 'a', NOW);
    // Un champ vide (ligne d'exception ou champ ignoré) n'existe pas côté serveur : on compare seulement quand les deux ont une réponse comparable
    const okSame = a.ok === b.ok && (a.ok ? JSON.stringify(a.clean) === JSON.stringify(strip(b.save)) : (a as any).error === b.reason);
    if (okSame) same++; else diffs.push(JSON.stringify(sp).slice(0, 90) + ' → site ' + JSON.stringify(a).slice(0, 70) + ' / serveur ' + JSON.stringify(b).slice(0, 70));
  }
  for (const x of diffs) console.log('   différence : ' + x);
  ok(diffs.length === 0, `site et serveur donnent le même résultat sur ${specs.length} fiches (${same} identiques)`);
}

// --- lien mission → client ---
ok(cleanClientRef(undefined).ok && cleanClientRef(undefined).id === null && cleanClientRef('').id === null && cleanClientRef(null).id === null, 'lien vide : accepté, aucun client');
ok(cleanClientRef('cl-1').id === 'cl-1', 'lien valide gardé');
ok(!cleanClientRef(12).ok && !cleanClientRef({}).ok && !cleanClientRef('x'.repeat(81)).ok, 'lien qui n\'est pas un texte court refusé');

// --- l'opérateur ne reçoit jamais le lien client ni le prix client ---
const emp = { role: 'employee', id: 'e1' }, adm = { role: 'admin', id: 'a1' };
const mission = { id: 'm1', client_name: 'X', client_id: 'cl-1', client_price_ar: 50000 };
const stripped = withoutClientPrice(mission, emp);
ok(!('client_id' in stripped) && !('client_price_ar' in stripped) && stripped.client_name === 'X', 'opérateur : mission sans client_id ni prix client (le titre reste)');
ok(withoutClientPrice(mission, adm).client_id === 'cl-1', 'admin : mission avec client_id');
ok('client_id' in mission, 'la mission d\'origine n\'est pas modifiée');
ok(!('client_id' in withoutClientPrice({ id: 'm2', client_id: 'cl-1' }, emp)), 'opérateur : client_id retiré même sans prix client');
ok(withoutClientPrice({ id: 'm3' }, emp).id === 'm3', 'mission sans lien : rien ne casse');

// --- lecture du code : les protections sont bien branchées ---
const stateFn = /async function state\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
const syncFn = /async function sync\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(stateFn.includes('!admin && ADMIN_ONLY_READ.includes(col)'), 'state : clients jamais envoyés à un employé');
ok(stateFn.includes("withoutClientPrice(c, me)") && /stripPost[\s\S]{0,200}withoutClientPrice/.test(src), 'state : missions et sessions passent par withoutClientPrice (qui retire client_id)');
const gate = syncFn.indexOf('!admin && ADMIN_ONLY_WRITE.includes(col)');
ok(gate > 0 && gate < syncFn.indexOf('for (const rec of upserts)'), 'sync : refus des écritures d\'un employé AVANT toute autre règle');
ok(/ADMIN_ONLY_WRITE\.includes\(col\)\)\s*\{[\s\S]*?for \(const id of deletes\) rejected\.push[\s\S]*?continue;/.test(syncFn), 'sync : suppressions d\'un employé refusées aussi');
ok(syncFn.includes("col === 'clients'") && syncFn.includes('cleanClient('), 'sync : chaque fiche de l\'admin passe par cleanClient');
ok(/client_id: existing\?\.client_id/.test(syncFn), 'sync : une session écrite par un employé garde le client_id d\'origine (jamais celui du navigateur)');
ok(syncFn.includes('cleanClientRef(') && syncFn.includes('T.clients'), 'sync : le lien mission → client est vérifié (texte court, fiche existante)');
ok(/in_use/.test(syncFn) && /data->>client_id/.test(syncFn), 'sync : un client qui a des missions ou des sessions n\'est jamais supprimé');
const tBlock = /const T = \{([\s\S]*?)\} as const/.exec(src)?.[1] || '';
ok(tBlock.includes('clients:') && tBlock.indexOf('clients:') < tBlock.indexOf('posts:') && tBlock.indexOf('clients:') < tBlock.indexOf('contracts:'), 'clients traités avant les missions et les sessions (même envoi)');
ok(/clients: "df_clients"/.test(src) && (src.match(/df_clients/g) || []).length === 1, 'aucune autre route du serveur ne lit la table df_clients (une seule mention : la liste des collections)');

// --- migration et remise à zéro ---
const mig = read('supabase/migrations/20261020_create_df_clients.sql');
ok(/create table if not exists public\.df_clients/.test(mig) && /enable row level security/.test(mig), 'migration : table df_clients avec sécurité RLS');
ok(/revoke all on public\.df_clients from anon, authenticated/.test(mig), 'migration : aucun accès public (ni anon, ni authenticated)');
ok(/drop table public\.df_clients/.test(mig), 'migration : retour en arrière écrit');
ok(!/df_clients/.test(read('supabase/functions/df-restore/index.ts')), 'df-restore : ne touche pas aux clients (la remise à zéro les garde)');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
