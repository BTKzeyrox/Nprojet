// Contrôle de M1.5 (missions liées aux clients), sans réseau : règles pures, store en démo, accord avec le serveur, rendu FR et EN, branchement des formulaires.
// Lancer : npm run check:missions-link
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { ClientPicker } = await import('../src/components/ClientPicker');
const { MissionsToLink } = await import('../src/views/admin/MissionsToLink');
const { ClientsPage } = await import('../src/views/admin/ClientsPage');
const C = await import('../src/utils/clients');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object/.test(h);
const text = (h: string) => h.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\u00a0/g, ' ');
const html = (el: React.ReactElement, lang: 'fr' | 'en' = 'fr') => { mem.delta_lang = lang; return text(renderToString(<AppProvider>{el}</AppProvider>)); };
const read = (p: string) => fs.readFileSync(join(process.cwd(), p), 'utf8');
const wait = () => new Promise(r => setTimeout(r, 3)); // les identifiants de missions sont faits avec l'heure : on évite deux créations dans la même milliseconde

// ================= 1) Règles pures =================
const cl = (id: string, name: string, active?: boolean) => ({ id, name, ...(active === false ? { active: false } : {}) }) as any;
const ct = (id: string, name: string, extra: any = {}) => ({ id, client_name: name, ...extra }) as any;
const clients = [cl('c1', 'Société Aina'), cl('c2', 'Cabinet Rado'), cl('c3', 'Dup'), cl('c4', 'dup!'), cl('c5', 'Ancien Client', false)];
const contracts = [
  ct('m1', 'Société Aina'), ct('m2', ' société  aina '), ct('m3', 'Cabinet Rado'), ct('m4', ''), ct('m5', 'Poste sans compte', { no_account: true }),
  ct('m6', 'Société Aina', { client_id: 'c1' }), ct('m7', 'DUP'), ct('m8', 'Ancien client'), ct('m9', 'Inconnu SARL'), ct('m10', 'Inconnu sarl'), ct('m11', 'Inconnu SARL'),
];
const groups = C.missionsToLink(contracts, clients);
const by = (k: string) => groups.find(x => x.key === k)!;
ok(groups.length === 5 && groups.map(x => x.text).join('|') === 'Inconnu SARL|Société Aina|Ancien client|Cabinet Rado|DUP', 'regroupement par nom : 5 lignes, la plus grosse d\'abord (3, 2, puis 1, 1, 1 par ordre alphabétique)');
ok(by('inconnu sarl').count === 3 && by('inconnu sarl').contract_ids.join() === 'm9,m10,m11', 'même nom (majuscules différentes) = une seule ligne avec ses 3 missions');
ok(by('societe aina').count === 2 && by('societe aina').contract_ids.join() === 'm1,m2' && by('societe aina').suggestion.client_id === 'c1', 'nom avec accents et espaces en trop : proposé au bon client (la mission déjà liée n\'est pas comptée)');
ok(by('dup').suggestion.client_id === null && by('dup').suggestion.ambiguous, 'deux clients de même nom : pas de choix automatique (ambigu)');
ok(by('ancien client').suggestion.client_id === null && !by('ancien client').suggestion.ambiguous, 'un client archivé n\'est jamais proposé');
ok(by('inconnu sarl').suggestion.client_id === null, 'aucun client de ce nom : pas de proposition');
ok(!groups.some(x => x.contract_ids.includes('m4') || x.contract_ids.includes('m5') || x.contract_ids.includes('m6')), 'poste sans nom, poste sans compte et mission déjà liée : absents de l\'outil');
ok(C.missionsToLink([], clients).length === 0 && C.missionsToLink(contracts, []).every(x => x.suggestion.client_id === null) && C.missionsToLink([ct('z', '   ')], clients).length === 0, 'listes vides ou nom blanc : aucune ligne, sans erreur');

const ch = C.clientChoices([cl('a', 'Zoé'), cl('b', 'Émile'), cl('c', 'Archive', false), cl('d', 'Alice')], null);
ok(ch.map(x => x.name).join() === 'Alice,Émile,Zoé', 'liste de choix : clients actifs par ordre alphabétique sans tenir compte des accents (É avant Z)');
ok(C.clientChoices([cl('c', 'Archive', false)], 'c').length === 1 && C.clientChoices([cl('c', 'Archive', false)], 'c')[0].archived, 'liste de choix : le client déjà choisi reste, même archivé, marqué « archivé »');

const base = { clients: [cl('a', 'Actif'), cl('z', 'Archivé', false)] };
ok((C.checkMissionClient({ ...base, required: true, clientId: '' }) as any).error === 'required' && (C.checkMissionClient({ ...base, required: true, clientId: undefined }) as any).error === 'required', 'client obligatoire et vide : refusé (« required »)');
ok((C.checkMissionClient({ ...base, required: false, clientId: '' }) as any).client_id === null, 'client facultatif et vide : accepté, sans client');
ok((C.checkMissionClient({ ...base, required: true, clientId: 'nope' }) as any).error === 'missing', 'client inconnu : refusé (« missing »)');
ok((C.checkMissionClient({ ...base, required: true, clientId: 'z' }) as any).error === 'archived', 'client archivé : refusé (« archived »)');
ok((C.checkMissionClient({ ...base, required: true, clientId: 'z', current: 'z' }) as any).client_id === 'z', 'client archivé déjà sur la mission : on peut le garder');
ok((C.checkMissionClient({ ...base, required: true, clientId: 'a' }) as any).client_id === 'a', 'client actif : accepté');
ok(C.missionRequiresClient(undefined) && C.missionRequiresClient({}) && C.missionRequiresClient({ options: {} }) && C.missionRequiresClient({ options: { mission_requires_client: true } }) && !C.missionRequiresClient({ options: { mission_requires_client: false } }), 'réglage « Une mission a toujours un client » : Oui par défaut, Non seulement si on l\'a décoché');
ok((['required', 'missing', 'archived'] as const).every(k => C.MISSION_CLIENT_MESSAGE[k].fr.length > 10 && C.MISSION_CLIENT_MESSAGE[k].en.length > 10 && C.MISSION_CLIENT_MESSAGE[k].fr !== C.MISSION_CLIENT_MESSAGE[k].en), 'messages d\'erreur écrits en français et en anglais');

// ================= 2) Store (démo admin) =================
db.enterDemo('admin');
const aina = db.addClient({ name: 'Société Aina' }).id as string;
const rado = db.addClient({ name: 'Cabinet Rado' }).id as string;
const arch = db.addClient({ name: 'Vieux Client' }).id as string; db.setClientActive(arch, false);
const mk = (name: string, extra: any = {}) => db.addContract({ client_name: name, initial_score: 0, objective: 0, ...extra });
const find = (name: string) => db.getContracts().find(c => c.client_name === name)!;

ok(mk('Avec client A', { client_id: aina }).success && find('Avec client A').client_id === aina, 'nouvelle mission avec un client : le lien est enregistré');
await wait();
ok(mk('Sans client A').success && find('Sans client A').client_id === undefined, 'nouvelle mission sans client (rien d\'exigé) : acceptée, sans lien');
await wait();
const r1 = mk('Exige A', { requireClient: true });
ok(!r1.success && /Choisis le client/.test(r1.error || '') && !db.getContracts().some(c => c.client_name === 'Exige A'), 'client exigé et absent : refusé avec un message clair, aucune mission créée');
const r2 = mk('Inconnu A', { client_id: 'cli-nope' });
ok(!r2.success && /n'existe plus/.test(r2.error || '') && !db.getContracts().some(c => c.client_name === 'Inconnu A'), 'client inconnu : refusé, aucune mission créée');
const r3 = mk('Archivé A', { client_id: arch });
ok(!r3.success && /archivé/.test(r3.error || '') && !db.getContracts().some(c => c.client_name === 'Archivé A'), 'client archivé : refusé, aucune mission créée');
await wait();
ok(mk('Exige OK', { requireClient: true, client_id: rado }).success && find('Exige OK').client_id === rado, 'client exigé et choisi : accepté');
await wait();

// Rattachement par nom
for (const nm of ['Legacy Ibis', 'legacy  ibís', 'LEGACY IBIS', 'Legacy Autre']) { mk(nm); await wait(); }
const poste = db.getContracts().find(c => c.no_account)!; // poste sans compte (de la démo) : jamais rattaché
const legacyBefore = C.missionsToLink(db.getContracts(), db.getClients());
const ibis = legacyBefore.find(x => x.key === 'legacy ibis')!;
ok(!!ibis && ibis.count === 3 && ibis.suggestion.client_id === null, 'l\'outil voit 3 anciennes missions « Legacy Ibis » (accents et majuscules ignorés), sans client du même nom');
const ibisId = db.addClient({ name: 'Legacy Ibis' }).id as string;
ok(C.missionsToLink(db.getContracts(), db.getClients()).find(x => x.key === 'legacy ibis')!.suggestion.client_id === ibisId, 'après la création du client, l\'outil le propose');
const at = db.attachMissionsByName('legacy ibís', ibisId);
ok(at.success && at.linked === 3 && ['Legacy Ibis', 'legacy  ibís', 'LEGACY IBIS'].every(nm => find(nm).client_id === ibisId) && find('Legacy Autre').client_id === undefined, 'rattacher une ligne = ses 3 missions, pas les autres');
const at2 = db.attachMissionsByName('Legacy Ibis', ibisId);
ok(!at2.success && /Aucune mission/.test(at2.error || ''), 'rattacher deux fois : « Aucune mission à rattacher », rien de changé');
ok(!db.attachMissionsByName('Legacy Autre', arch).success && !db.attachMissionsByName('Legacy Autre', 'nope').success && find('Legacy Autre').client_id === undefined, 'rattacher à un client archivé ou inconnu : refusé');
ok(!db.attachMissionsByName('', ibisId).success, 'nom vide : refusé');
ok(poste === undefined || (!db.attachMissionsByName(poste.client_name || 'zz', ibisId).success && poste.client_id === undefined), 'un poste sans compte n\'est jamais rattaché');
ok(find('Avec client A').client_id === aina, 'une mission déjà liée n\'est jamais déplacée par un rattachement');

// Changement de client : l'histoire reste figée
const sessionsOf = (c: { id: string }) => db.getPosts().filter(p => C.matchContract(p, db.getContracts()) === db.getContracts().find(x => x.id === c.id));
const withPosts = db.getContracts().find(c => sessionsOf(c).length >= 2 && !c.client_id && !c.no_account)!;
const myPosts = () => sessionsOf(withPosts);
const others = () => db.getPosts().filter(p => !myPosts().includes(p));
const nbMine = myPosts().length, othersLinked = others().filter(p => p.client_id).length;
const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' });
const nbDone = myPosts().filter(p => p.status === 'completed' && p.date <= todayStr).length;
ok(nbMine >= 2 && myPosts().every(p => !p.client_id), `mission de la démo avec ${nbMine} sessions, aucune liée au départ`);
const l1 = db.setContractClient(withPosts.id, aina);
ok(l1.success && l1.stamped === nbMine && myPosts().every(p => p.client_id === aina) && others().filter(p => p.client_id).length === othersLinked && db.getContracts().find(c => c.id === withPosts.id)!.client_id === aina, 'lier une mission : ses sessions prennent le client, pas celles des autres missions');
const l2 = db.setContractClient(withPosts.id, rado);
ok(l2.success && l2.stamped === 0 && myPosts().every(p => p.client_id === aina) && db.getContracts().find(c => c.id === withPosts.id)!.client_id === rado, 'changer de client : les anciennes sessions RESTENT à l\'ancien client (histoire figée), la mission suit le nouveau');
const newSess = { ...myPosts()[0], id: 'sess-new', status: 'completed', date: '2026-10-19' } as any; delete newSess.client_id;
const fresh = C.clientMissionsFromPosts([newSess], db.getContracts(), db.getClients(), {});
ok(fresh.length === 1 && fresh[0].client_id === rado, 'une nouvelle session (sans client) suit le client actuel de la mission (Rado), pas l\'ancien');
const l3 = db.setContractClient(withPosts.id, null);
ok(l3.success && db.getContracts().find(c => c.id === withPosts.id)!.client_id === undefined && !('client_id' in db.getContracts().find(c => c.id === withPosts.id)!) && myPosts().every(p => p.client_id === aina), 'enlever le client : le lien disparaît vraiment (champ supprimé), les sessions gardent leur client');
ok(db.setContractClient(withPosts.id, null).success && db.setContractClient(withPosts.id, null).stamped === 0, 'enlever un client qui n\'y est pas : sans effet');
ok(!db.setContractClient('nope', aina).success && !db.setContractClient(withPosts.id, 'nope').success && !db.setContractClient(withPosts.id, arch).success, 'mission inconnue, client inconnu ou archivé : refusé');
ok(db.setContractClient(withPosts.id, aina).success, 'on peut relier de nouveau');
// Suppression d'un client lié : refusée
ok(db.deleteClient(aina).error === 'in_use', 'un client lié à une mission ne se supprime pas (on l\'archive)');
// Effet sur les statistiques du client
const sums = C.summarizeClients(db.getClients(), C.clientMissionsFromPosts(db.getPosts(), db.getContracts(), db.getClients(), {}), todayStr);
ok(nbDone >= 1 && (sums.get(aina)?.missions_total || 0) >= nbDone && sums.get(aina)!.statuses.join() !== 'prospect', `les ${nbDone} missions validées de cette mission comptent chez le client (il n'est plus « Prospect »)`);

// Opérateur : rien
db.enterDemo('employee');
ok(!db.setContractClient('x', 'y').success && /responsable/.test(db.setContractClient('x', 'y').error || '') && !db.attachMissionsByName('a', 'b').success && db.getClients().length === 0, 'opérateur : lier, rattacher et voir les clients refusés');

// ================= 3) Accord avec le serveur =================
const srv = read('supabase/functions/df-api/index.ts');
const blk = (name: string) => { const m = new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`).exec(srv); ok(!!m, `bloc « ${name} » trouvé dans le serveur`); return transformSync(m![1], { loader: 'ts' }).code; };
const serverMod = new Function(`${blk('CASH').replace(/function cleanCash[\s\S]*$/, '')}\n${blk('CLIENTS')}\nreturn { cleanClient, cleanClientRef };`)() as { cleanClient: (r: any, e: any, me: string, now: string) => any; cleanClientRef: (v: unknown) => any };
db.enterDemo('admin');
const q = db.addClient({ name: 'Création rapide', phone: '034 00 000 00' });
const qRec = db.getClients().find(c => c.id === q.id)!;
ok(serverMod.cleanClient(qRec, undefined, 'admin', '2026-10-20T10:00:00Z').ok, 'un client créé par « Nouveau client » (nom + téléphone) est accepté par le serveur');
ok(serverMod.cleanClientRef(q.id).ok && (serverMod.cleanClientRef(q.id) as any).id === q.id && (serverMod.cleanClientRef('') as any).id === null && !serverMod.cleanClientRef({ x: 1 }).ok && !serverMod.cleanClientRef('x'.repeat(81)).ok, 'le serveur accepte l\'identifiant du client, lit « vide » comme « sans client », refuse un objet ou un texte trop long');
ok(/if \(admin && \(col === 'contracts' \|\| col === 'posts'\)\)/.test(srv) && /from\(T\.clients\)\.select\('id'\)\.eq\('id', ref\.id\)/.test(srv), 'serveur : le client d\'une mission ou d\'une session doit exister (contrôlé à chaque synchro)');
const tObj = /const T = \{([\s\S]*?)\} as const/.exec(srv)?.[1] || '';
ok(tObj.indexOf('clients:') >= 0 && tObj.indexOf('clients:') < tObj.indexOf('posts:') && tObj.indexOf('clients:') < tObj.indexOf('contracts:'), 'serveur : les fiches clients sont enregistrées avant les missions et les sessions (une création rapide + un lien dans la même synchro passent)');

// ================= 4) Rendu FR et EN =================
const pick = (lang: 'fr' | 'en', value = '', extra: any = {}) => html(<ClientPicker value={value} onChange={() => {}} {...extra} />, lang);
db.enterDemo('admin');
const c1 = db.addClient({ name: 'Zoé Client' }).id as string, c2 = db.addClient({ name: 'Émile Client' }).id as string, c3 = db.addClient({ name: 'Ancien' }).id as string; db.setClientActive(c3, false);
const p0 = pick('fr');
ok(!bad(p0) && p0.includes('— Choisir un client —') && p0.includes('Nouveau client') && p0.includes('(facultatif)') && p0.indexOf('Émile Client') < p0.indexOf('Zoé Client') && !p0.includes('Ancien'), 'sélecteur : liste triée, client archivé caché, bouton « Nouveau client », « (facultatif) » si non exigé');
ok(pick('fr', '', { required: true }).includes('text-rose-400"> *</span>') && pick('fr', '', { error: 'Choisis le client de cette mission.' }).includes('role="alert"') && pick('fr', '', { error: 'Choisis le client de cette mission.' }).includes('Choisis le client de cette mission.'), 'sélecteur : étoile rouge si exigé, message d\'erreur lisible (role=alert)');
ok(pick('fr', c3).includes('Ancien · archivé') && pick('fr', c1).includes(`value="${c1}" selected`), 'sélecteur : le client déjà choisi reste affiché (même archivé) et sélectionné');
const pe = pick('en');
ok(!bad(pe) && pe.includes('— Choose a client —') && pe.includes('New client') && pe.includes('(optional)') && !/Choisir|Nouveau client|facultatif/.test(pe), 'sélecteur en anglais : aucun mot français');
for (let i = 0; i < 9; i++) db.addClient({ name: `Client ${i}` });
ok(pick('fr').includes('type="search"') && pick('en').includes('Search a client'), 'sélecteur : plus de 8 clients = champ de recherche (FR et EN)');
db.enterDemo('employee');
ok(pick('fr') === '' || !pick('fr').includes('<select'), 'sélecteur : un opérateur ne voit rien');

// Outil « Rattacher les anciennes missions »
db.enterDemo('admin');
const zed = db.addClient({ name: 'Cabinet Zed' }).id as string; const archived = db.addClient({ name: 'Maison Vieille' }).id as string; db.setClientActive(archived, false);
for (const nm of ['cabinet zed', 'Cabinet ZED', 'Nom Inconnu SA', 'Maison Vieille', 'Atelier Alpha', 'Atelier Beta']) { mk(nm); await wait(); } // la démo n'a plus qu'une mission sans fiche : on en ajoute assez pour dépasser 5 lignes
db.addClient({ name: 'Doublon' }); // un seul : pas ambigu ; l'ambigu est testé en pur plus haut
const pageHtml = html(<MissionsToLink />);
ok((pageHtml.match(/<li[ >]/g) || []).length === 5 && /Tout voir \(\d+\)/.test(pageHtml) && html(<MissionsToLink />, 'en').includes('Show all ('), 'outil : 5 lignes à la fois et un bouton « Tout voir (N) » (FR et EN) quand il y en a plus');
const demoUnlinked = db.addClient({ name: 'Client de la démo' }).id as string;
for (const c of db.getContracts()) if (!c.client_id && !c.no_account && c.client_name && !/zed|Nom Inconnu|Maison Vieille/i.test(c.client_name)) db.setContractClient(c.id, demoUnlinked); // il ne reste que les lignes du test
const tl = html(<MissionsToLink />);
ok(!bad(tl) && tl.includes('Missions à rattacher (') && tl.includes('Confirme une ligne à la fois'), 'outil : titre avec le nombre de lignes et consigne « une ligne à la fois »');
ok(tl.includes('Rattacher à « Cabinet Zed »') && tl.includes('même nom que « Cabinet Zed »') && tl.includes('2 missions'), 'outil : le client de même nom est proposé (2 missions regroupées)');
ok(tl.includes('Créer le client « Nom Inconnu SA » et rattacher') && tl.includes('aucun client de ce nom'), 'outil : sans client de ce nom, on propose de le créer');
ok(!tl.includes('Rattacher à « Maison Vieille »') && tl.includes('Créer le client « Maison Vieille »'), 'outil : un client archivé n\'est pas proposé');
ok(!/Tout rattacher|Rattacher tout|Link all/i.test(tl) && (tl.match(/>Rattacher</g) || []).length >= 3, 'outil : un bouton « Rattacher » par ligne, aucun bouton « tout rattacher »');
const tle = html(<MissionsToLink />, 'en');
ok(!bad(tle) && tle.includes('Missions to link (') && tle.includes('Link to “Cabinet Zed”') && tle.includes('same name as') && tle.includes('Create client “Nom Inconnu SA” and link') && !/Rattacher|Confirme|Créer le client/.test(tle), 'outil en anglais : aucun mot français');
ok(html(<ClientsPage />).includes('Missions à rattacher ('), 'la page Clients affiche l\'outil');
db.attachMissionsByName('cabinet zed', zed);
ok(!html(<MissionsToLink />).includes('Rattacher à « Cabinet Zed »'), 'après confirmation, la ligne disparaît');
for (const c of db.getContracts()) if (!c.client_id && !c.no_account && c.client_name) db.setContractClient(c.id, zed);
ok(html(<MissionsToLink />) === '', 'plus aucune mission sans client : l\'outil disparaît');
db.enterDemo('employee');
ok(html(<MissionsToLink />) === '' && !html(<ClientsPage />).includes('Missions à rattacher ('), 'opérateur : l\'outil ne montre rien (pas de fiche, pas de ligne)');

// ================= 5) Branchement des formulaires (lecture du code) =================
const grid = read('src/components/PostsGrid20.tsx'), dash = read('src/views/admin/AdminDashboard.tsx');
ok(/MISSION_CLIENT_MESSAGE\[cv\.error\]\[lang === 'en' \? 'en' : 'fr'\]/.test(grid) && /MISSION_CLIENT_MESSAGE\[cv\.error\]\[appLang === 'en' \? 'en' : 'fr'\]/.test(dash), 'formulaires : message d\'erreur du client en français ou en anglais selon la langue');
ok((grid.match(/<ClientPicker/g) || []).length === 1 && /requireClient: needClient/.test(grid) && /client_id: cv\.client_id \|\| undefined/.test(grid) && /missionRequiresClient\(readCompany\(db\.getSettings\(\)\.company\)\)/.test(grid), 'formulaire « Nouvelle mission » : sélecteur, réglage « toujours un client » lu, client envoyé au store');
ok(grid.indexOf('<ClientPicker') < grid.indexOf('>Titre</label>') && /if \(id && name && !addName\.trim\(\)\) setAddName\(name\)/.test(grid), 'formulaire « Nouvelle mission » : le client est choisi avant le titre et préremplit un titre vide');
ok((dash.match(/<ClientPicker/g) || []).length === 1 && /db\.setContractClient\(selectedAdminContract\.id, cv\.client_id\)/.test(dash) && /required: missionRequiresClient\(readCompany\(db\.getSettings\(\)\.company\)\) && hadClient/.test(dash), 'fenêtre de modification : sélecteur, lien enregistré après la mission, un client déjà choisi ne s\'enlève pas');
ok(read('src/views/admin/ClientsPage.tsx').includes('<MissionsToLink />'), 'page Clients : outil de rattachement branché');
ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
