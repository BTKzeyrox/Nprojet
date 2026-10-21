// Essai de la démo des clients (M1.7) : 6 fiches inventées avec tous les statuts, missions liées, opérateur sans rien voir, FR et EN, 0 appel réseau.
// Lancer : npm run check:clients-demo
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
const { clientMissionsFromPosts, summarizeClients, clientThresholds, clientReceived, suggestClientMatches } = await import('../src/utils/clients');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><ClientsPage /></AppProvider>).replace(/<!-- -->/g, '').replace(/&nbsp;| | /g, ' '); };
const today = todayMada();

db.enterDemo('admin');
const clients = db.getClients();
const set = db.getSettings();
const missions = clientMissionsFromPosts(db.getPosts(), db.getContracts(), clients, { client_price_default_ar: set.client_price_default_ar, client_prices_by_type: set.client_prices_by_type });
const sum = summarizeClients(clients, missions, today, clientThresholds((set as any).company));
const byName = (nm: string) => clients.find(c => c.name === nm)!;
const st = (nm: string) => sum.get(byName(nm).id)!;

ok(clients.length === 6, '6 fiches de démonstration');
ok(new Set(clients.map(c => c.id)).size === 6 && new Set(clients.map(c => c.name)).size === 6, 'identifiants et noms tous différents');
ok(st('Atelier Rivage').main === 'strategic' && st('Atelier Rivage').statuses.includes('regular'), 'Atelier Rivage : stratégique (et régulier)');
ok(st('Société Delta Services').statuses.includes('regular') && !st('Société Delta Services').statuses.includes('strategic'), 'Société Delta Services : régulier, pas stratégique');
ok(st('Cabinet Horizon').main === 'new' && !st('Cabinet Horizon').statuses.includes('regular'), 'Cabinet Horizon : nouveau');
ok(st('Maison Lumière').main === 'active', 'Maison Lumière : actif (statut neutre)');
ok(st('Boutique Soleil').main === 'inactive', 'Boutique Soleil : inactif');
ok(st('Studio Nova').main === 'prospect' && st('Studio Nova').missions_total === 0, 'Studio Nova : prospect (aucune mission)');
ok(new Set(clients.map(c => sum.get(c.id)!.main)).size === 6, 'les 6 statuts sont tous représentés');
ok(clients.every(c => c.active === true && !!c.created_at && (c.phone || '').startsWith('034 00 000')), 'fiches actives, numéros de téléphone factices');
ok(clients.every(c => !/@(?!exemple)/.test(c.email || '')), 'aucun vrai e-mail');
ok(byName('Cabinet Horizon').price_default_ar === 15000 && st('Cabinet Horizon').revenue_total === 2 * 15000, 'tarif propre du client appliqué (Cabinet Horizon : 2 missions × 15 000)');

// Missions liées
const contracts = db.getContracts();
const linked = contracts.filter(c => c.client_id);
const unlinked = contracts.filter(c => !c.client_id);
ok(contracts.length === 15 && linked.length === 14 && unlinked.length === 1, '15 missions : 14 liées à une fiche, 1 ancienne sans fiche');
ok(linked.every(c => clients.some(x => x.id === c.client_id)), 'chaque lien pointe vers une fiche qui existe');
ok(unlinked[0].client_name === 'Aide à l\'équipe du support', 'la mission sans fiche est « Aide à l\'équipe du support »');
const sug = suggestClientMatches(unlinked.map(c => c.client_name), clients);
ok(sug.length === 1 && sug[0].client_id === null, 'l\'outil « Missions à rattacher » n\'invente aucune correspondance');

// Argent reçu (les paiements de démo portent les noms de 4 fiches)
const recv = clientReceived(db.getCash(), clients);
ok(recv.get(byName('Atelier Rivage').id)!.received > 0 && recv.get(byName('Société Delta Services').id)!.received > 0, 'paiements de démo rattachés à Atelier Rivage et Société Delta Services');
ok(recv.get(byName('Studio Nova').id)!.received === 0, 'Studio Nova : aucun paiement');

// Page, français et anglais
const fr = view('fr'), en = view('en');
ok(!bad(fr) && !bad(en), 'page sans NaN, undefined ni null (FR et EN)');
ok(clients.every(c => fr.includes(c.name.replace(/'/g, '&#x27;'))), 'page française : les 6 noms apparaissent');
ok(/Stratégique/.test(fr) && /Nouveau/.test(fr) && /Inactif/.test(fr) && /Prospect/.test(fr), 'page française : statuts en français');
ok(/Strategic/.test(en) && /Inactive/.test(en) && /Prospect/.test(en) && !/Stratégique/.test(en), 'page anglaise : statuts en anglais');

// Démo opérateur : rien de visible
db.enterDemo('employee');
ok(db.getClients().length === 0, 'opérateur : aucune fiche client');
ok(db.getContracts().length === 15 && db.getContracts().every(c => !('client_id' in c)), 'opérateur : les missions n\'ont plus de lien client');
ok(db.getPosts().every(p => !('client_id' in p)), 'opérateur : les sessions n\'ont plus de lien client');
const emp = JSON.stringify([db.getContracts(), db.getPosts(), db.getSettings()]);
ok(!/demo_cl[1-6]/.test(emp), 'opérateur : aucun identifiant de fiche client dans ses données');
ok(db.getCash().length === 0, 'opérateur : aucune ligne d\'argent');

ok(calls === 0, `0 appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
