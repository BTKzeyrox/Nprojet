// Essai de l'import Excel et CSV côté site (module 16, M16.1), sans écran réel ni réseau : boutons dans les 4 pages (FR et EN),
// déroulé complet d'un import sur la démo (aperçu, écriture, deuxième import = tout ignoré), droits de l'opérateur.
// Lancer : npm run check:import-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { ClientsPage } = await import('../src/views/admin/ClientsPage');
const { StockTab } = await import('../src/views/admin/StockTab');
const { MySheets } = await import('../src/components/MySheets');
const { buildPreview, okDrafts, parseCsv, generatePassword } = await import('../src/utils/importRules');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const page = (el: React.ReactElement, lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider>{el}</AppProvider>).replace(/<!-- -->/g, '').replace(/[  ]/g, ' '); };
const range = { start: '2000-01-01', end: todayMada() };
const existing = () => ({ clients: db.getClients().map(c => c.name), products: db.getProducts().map(p => p.name), usernames: db.getUsers().map(u => u.username) });

// ---------- boutons « Importer » ----------
db.enterDemo('admin');
for (const lang of ['fr', 'en'] as const) {
  const label = lang === 'en' ? 'Import (Excel, CSV)' : 'Importer (Excel, CSV)';
  const c = page(<ClientsPage />, lang), s = page(<StockTab lang={lang} />, lang);
  ok(!bad(c) && c.includes(label), `${lang} : page Clients : bouton d'import, aucune erreur affichée`);
  ok(!bad(s) && s.includes(label), `${lang} : Stock : bouton d'import, aucune erreur affichée`);
  ok(c.includes('min-h-[44px]') && s.includes('min-h-[44px]'), `${lang} : cibles tactiles de 44 px`);
}
db.enterDemo('employee');
for (const lang of ['fr', 'en'] as const) {
  const h = page(<MySheets />, lang);
  ok(!bad(h) && h.includes(lang === 'en' ? 'Import (Excel, CSV)' : 'Importer (Excel, CSV)'), `${lang} : Mes tableaux (opérateur) : bouton d'import`);
}
db.enterDemo('admin');
ok(!page(<MySheets />, 'fr').includes('Importer (Excel, CSV)'), 'Mes tableaux (responsable, en lecture seule) : pas de bouton d\'import');

// ---------- déroulé : clients ----------
const before = db.getClients().length;
const csvClients = parseCsv('Nom;E-mail;Délai de paiement (jours)\nImport Un;un@x.mg;20\nImport Deux;;\nImport Un;;\nMauvais;pas-un-mail;\n');
const p1 = buildPreview('clients', csvClients, existing());
ok(JSON.stringify(p1.counts) === JSON.stringify({ ok: 2, error: 1, duplicate: 1 }), 'clients : aperçu 2 bons, 1 erreur, 1 doublon');
ok(db.getClients().length === before, 'clients : aperçu = rien d\'écrit');
let added = 0; for (const d of okDrafts(p1)) if (db.addClient(d).success) added++;
ok(added === 2 && db.getClients().length === before + 2, 'clients : seules les 2 lignes bonnes sont écrites');
ok(db.getClients().find(c => c.name === 'Import Un')?.payment_terms_days === 20, 'clients : le délai de paiement du fichier est gardé');
const p2 = buildPreview('clients', csvClients, existing());
ok(JSON.stringify(p2.counts) === JSON.stringify({ ok: 0, error: 1, duplicate: 3 }), 'clients : deuxième import du même fichier = tout ignoré (aucun doublon créé)');

// ---------- déroulé : produits ----------
const bp = db.getProducts().length;
const pp = buildPreview('products', parseCsv('Produit;Prix achat;Prix vente;Seuil\nImport Colle;300;500;10\nImport Colle;1;1;1\nImport Ruban;abc;;\n'), existing());
ok(JSON.stringify(pp.counts) === JSON.stringify({ ok: 1, error: 1, duplicate: 1 }), 'produits : aperçu 1 bon, 1 erreur, 1 doublon');
for (const d of okDrafts(pp)) db.addProduct(d);
const col = db.getProducts().find(p => p.name === 'Import Colle');
ok(db.getProducts().length === bp + 1 && col?.buy_price_ar === 300 && col?.sell_price_ar === 500 && col?.alert_threshold === 10, 'produits : écrit avec ses prix et son seuil');

// ---------- déroulé : salariés (démo : faux serveur local) ----------
const pe = buildPreview('employees', parseCsv('Identifiant;Nom complet;Vacation;Équipe\nimport.nuit;Import Nuit;Nuit;Équipe Z\nimport.jour;Import Jour;;\n'), existing());
ok(pe.counts.ok === 2, 'salariés : aperçu 2 bons');
const nu = db.getUsers().length;
for (const d of okDrafts(pe)) {
  const r = await db.addUser({ username: d.username, name: d.name, phone: d.phone, shift: d.shift, role: 'employee', team: d.team, status: 'active', avatar_url: '', performance_badge: 'Standard' }, 'demo-password');
  ok(r.success === true, `salariés : compte ${d.username} créé (démo)`);
  await new Promise(res => setTimeout(res, 25));
}
const made = db.getUsers().filter(u => u.username.startsWith('import.'));
ok(db.getUsers().length === nu + 2 && made.every(u => u.role === 'employee' && u.status === 'active'), 'salariés : 2 comptes opérateurs actifs (jamais un autre rôle)');
ok(made.find(u => u.username === 'import.nuit')?.shift === 'night' && made.find(u => u.username === 'import.nuit')?.team === 'Équipe Z', 'salariés : vacation de nuit et équipe lues');
ok(new Set(made.map(u => u.id)).size === 2, 'salariés : deux comptes créés à la suite ont deux identifiants différents');
ok(buildPreview('employees', parseCsv('Identifiant;Nom complet\nimport.nuit;Encore\n'), existing()).rows[0].code === 'exists', 'salariés : deuxième import = identifiant déjà là, ignoré');

// ---------- droits : l'opérateur ne peut rien importer ----------
db.enterDemo('employee');
ok(db.addClient({ name: 'Pirate' }).error === 'admin' && db.addProduct({ name: 'Pirate' }).error === 'admin', 'opérateur : écriture des clients et des produits refusée (même par un import)');

// ---------- mots de passe ----------
const set = new Set<string>(); let s = 1; const rnd = (m: number) => { s = (s * 48271) % 2147483647; return s % m; };
for (let i = 0; i < 200; i++) set.add(generatePassword(rnd));
ok(set.size === 200, 'mots de passe provisoires : 200 tirages, 200 mots de passe différents');

ok(calls === 0, `aucun appel réseau pendant tout l'essai (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
