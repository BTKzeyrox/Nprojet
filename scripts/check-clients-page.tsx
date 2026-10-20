// Essai de la page Clients (sans écran réel, sans réseau) : démo admin et opérateur, ajout / modification / archivage / suppression, FR et EN.
// Lancer : npm run check:clients-page
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
const { addDays, todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
// Le HTML est simplifié : sans les marqueurs de React (<!-- -->), espaces insécables comptés comme des espaces.
const view = (lang: 'fr' | 'en', initialOpen?: string) => { mem.delta_lang = lang; return renderToString(<AppProvider><ClientsPage initialOpen={initialOpen} /></AppProvider>).replace(/<!-- -->/g, '').replace(/[\u00a0\u202f]/g, ' '); };
const today = todayMada();

// ---------- liste vide ----------
db.enterDemo('admin');
ok(db.getClients().length === 0, 'démo admin : aucune fiche au départ (la démo des clients viendra à l\'étape M1.7)');
const empty = view('fr');
ok(!bad(empty) && empty.includes('Aucun client pour l&#x27;instant'), 'liste vide : message clair, sans erreur');
ok(view('en').includes('No clients yet'), 'liste vide en anglais');

// ---------- ajout, modification, archivage, suppression ----------
const a = db.addClient({ name: 'Atelier Rivage', contact_name: 'Hery', phone: '034 00 000 00', email: 'hery@rivage.mg', address: 'Lot 5, Tana', note: 'Client de démonstration', payment_terms_days: '15', price_default: '9 000', price_by_type: [{ type: 'WEB', price: '12000' }] });
const b = db.addClient({ name: 'Maison Lumière' });
const c = db.addClient({ name: 'Zéro mission' });
ok(a.success && b.success && c.success && db.getClients().length === 3, 'ajout de 3 clients');
ok(db.getClients().every(x => x.active === true && x.created_by && x.created_at), 'chaque fiche : active, créateur et date posés');
ok(db.addClient({ name: 'atelier  RIVAGE' }).error === 'duplicate' && db.addClient({ name: 'Atelier Rívage' }).error === 'duplicate', 'même nom (majuscules, espaces, accents) : refusé');
ok(db.addClient({ name: '' }).error === 'name' && db.addClient({ name: 'X', email: 'oups' }).error === 'email' && db.addClient({ name: 'X', payment_terms_days: '999' }).error === 'terms' && db.addClient({ name: 'X', price_default: 'abc' }).error === 'price', 'nom vide, e-mail, échéance et prix faux : refusés avec le bon code');
ok(db.getClients().length === 3, 'rien n\'a été ajouté par les refus');
const A = db.getClients().find(x => x.name === 'Atelier Rivage')!;
ok(A.payment_terms_days === 15 && A.price_default_ar === 9000 && A.price_by_type?.WEB === 12000, 'nombres lus (« 9 000 » = 9000)');

// on relie les missions de la démo au client A (le lien se fera dans le formulaire de mission à l'étape M1.5)
const anyDb = db as any;
anyDb.contracts = anyDb.contracts.map((x: any) => ({ ...x, client_id: A.id }));
const done = db.getPosts().filter(p => p.status === 'completed').length;
ok(done > 20, `démo : ${done} missions validées à rattacher`);

for (const lang of ['fr', 'en'] as const) {
  const html = view(lang);
  ok(!bad(html), `${lang} : aucun NaN, « undefined » ni « null » affichés`);
  ok(html.includes('Atelier Rivage') && html.includes('Maison Lumi') && html.includes('Z&#xE9;ro mission') || html.includes('Zéro mission'), `${lang} : les 3 clients sont listés`);
  ok(html.includes(lang === 'en' ? 'New client' : 'Nouveau client') && html.includes(lang === 'en' ? 'Strategic' : 'Stratégique') && html.includes(lang === 'en' ? 'Inactive' : 'Inactif'), `${lang} : bouton Nouveau client et pastilles de statut dans la bonne langue`);
  ok(html.includes('min-h-[44px]'), `${lang} : cibles tactiles de 44 px`);
  ok(html.includes(lang === 'en' ? 'Sort: needs attention first' : 'Tri : à surveiller d&#x27;abord'), `${lang} : tri dans la bonne langue`);
  ok(html.indexOf('Atelier Rivage') < html.indexOf('Maison Lumi'), `${lang} : le client qui a des missions passe avant les prospects`);
}
{
  const html = view('fr', A.id);
  ok(!bad(html), 'fiche ouverte : aucun NaN ni « undefined »');
  ok(html.includes('hery@rivage.mg') && html.includes('href="tel:0340000000"') && html.includes('Lot 5, Tana') && html.includes('Client de démonstration'), 'fiche : contact, téléphone (lien tel:), e-mail, adresse et note');
  ok(html.includes('<b>15 jours</b>') && html.includes('9 000 Ar') && html.includes('WEB'), 'fiche : échéance propre (15 jours), prix par défaut et exception par type');
  ok(/Missions valid[ée]es/.test(html.replace(/&#x[0-9A-F]+;/gi, 'é')) && html.includes('Reste à encaisser') && html.includes('Facturé (total)'), 'fiche : missions, facturé, reçu et reste à encaisser');
  ok(html.includes('Modifier') && html.includes('Archiver') && html.includes('aria-label="Supprimer"'), 'fiche : Modifier, Archiver, Supprimer');
  const B = db.getClients().find(x => x.name === 'Maison Lumière')!;
  const hb = view('fr', B.id);
  ok(hb.includes('<b>30 jours</b>') && hb.includes('réglage de l&#x27;entreprise') && hb.includes('celui des Réglages'), 'client sans réglage propre : délai et prix de l\'entreprise indiqués comme tels');
  ok(hb.includes('Aucune mission valid') && hb.includes('Prospect'), 'client sans mission : « Prospect » et message clair');
}

// modification : un champ facultatif vidé disparaît vraiment
ok(db.updateClient(A.id, { name: 'Atelier Rivage', payment_terms_days: '', price_default: '', price_by_type: [], contact_name: '' }).success, 'modification acceptée');
const A2 = db.getClients().find(x => x.id === A.id)!;
ok(!('payment_terms_days' in A2) && !('price_default_ar' in A2) && !('price_by_type' in A2) && A2.contact_name === '' && A2.created_at === A.created_at && A2.created_by === A.created_by, 'modification : échéance, prix et exceptions vidés disparaissent ; date et auteur de création gardés');
ok(db.updateClient(A.id, { name: 'Maison Lumière' }).error === 'duplicate' && db.updateClient(A.id, { name: 'Atelier Rivage' }).success, 'renommer en un nom déjà pris : refusé ; garder son propre nom : accepté');
ok(db.updateClient('inconnu', { name: 'X' }).error === 'missing', 'fiche inconnue : « missing »');

// archivage
ok(db.setClientActive(A.id, false).success && db.getClients().find(x => x.id === A.id)!.active === false, 'archivage');
{
  const html = view('fr');
  ok(!html.includes('Atelier Rivage') && html.includes('Archivés (1)'), 'un client archivé n\'est plus dans la liste, un filtre « Archivés » apparaît');
}
ok(db.setClientActive(A.id, true).success && view('fr').includes('Atelier Rivage'), 'réactivation');

// suppression
ok(db.deleteClient(A.id).error === 'in_use' && db.getClients().some(x => x.id === A.id), 'client avec des missions : suppression refusée (in_use), on l\'archive');
const C = db.getClients().find(x => x.name === 'Zéro mission')!;
ok(db.deleteClient(C.id).success && !db.getClients().some(x => x.id === C.id), 'client sans mission : supprimé');
ok(db.deleteClient(C.id).error === 'missing', 'supprimer deux fois : « missing »');

// ---------- opérateur : rien ----------
db.enterDemo('employee');
ok(db.getClients().length === 0, 'opérateur : aucune fiche client en mémoire');
ok(db.addClient({ name: 'Pirate' }).error === 'admin' && db.updateClient('x', { name: 'Pirate' }).error === 'admin' && db.setClientActive('x', false).error === 'admin' && db.deleteClient('x').error === 'admin', 'opérateur : toutes les écritures refusées (« admin »)');
ok(db.getContracts().every(x => !('client_id' in x)) && db.getPosts().every(p => !('client_id' in p)), 'opérateur : aucune mission ni session ne porte de client_id');
ok(!JSON.stringify(db.getSettings()).includes('Atelier Rivage'), 'opérateur : aucune trace des clients dans les réglages');
ok(calls === 0, 'aucun appel réseau pendant tout l\'essai');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
