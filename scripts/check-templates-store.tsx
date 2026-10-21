// Essai des modèles de mission côté site (store + écrans), sans réseau. Lancer : npm run check:templates-store
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { MissionTemplatesSection } = await import('../src/components/MissionTemplatesSection');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><MissionTemplatesSection /></AppProvider>).replace(/<!-- -->/g, ''); };

db.enterDemo('admin');
ok(db.getMissionTemplates().length === 0, 'démo admin : aucun modèle au départ');
ok(view('fr').includes('Aucun modèle') && view('en').includes('No template'), 'liste vide : message clair FR et EN');

// création
ok(db.saveMissionTemplate({ name: '' }).error === 'Donne un nom au modèle.', 'nom vide : refusé avec un message clair');
const a = db.saveMissionTemplate({ name: 'Saisie rapide', title: 'Fiches du lot', post_type: 'Saisie de fiches', description: 'Recopier les fiches', proof_mode: 'photo' });
ok(a.success && !!a.template?.id && db.getMissionTemplates().length === 1, 'création : un modèle, avec un identifiant');
ok(db.saveMissionTemplate({ name: 'saisie RAPIDE' }).error === 'Un modèle porte déjà ce nom.', 'même nom (majuscules) : refusé');
const b = db.saveMissionTemplate({ name: 'Contrôle', proof_mode: 'both' });
ok(b.success && b.template!.id !== a.template!.id, 'deux modèles créés d\'affilée : identifiants différents');

// modification
ok(db.saveMissionTemplate({ id: a.template!.id, name: 'Saisie rapide v2', description: '' }).success, 'modification acceptée');
const a2 = db.getMissionTemplates().find(x => x.id === a.template!.id)!;
ok(a2.name === 'Saisie rapide v2' && !('description' in a2) && !('post_type' in a2), 'un champ vidé disparaît vraiment');
ok(db.saveMissionTemplate({ id: 'inconnu', name: 'X' }).error === 'Modèle introuvable.', 'modifier un modèle inconnu : refusé');

// la mission devient un modèle sans prix ni client
const anyDb = db as any;
const withPrice = anyDb.contracts.find((c: any) => c.client_name) || anyDb.contracts[0];
const { templateFromMission } = await import('../src/utils/missionTemplates');
const fromMission = db.saveMissionTemplate(templateFromMission({ ...withPrice, client_name: 'Titre issu d\'une mission' }, 'Issu d\'une mission'));
const saved = db.getMissionTemplates().find(x => x.name === 'Issu d\'une mission')!;
ok(fromMission.success && !JSON.stringify(saved).match(/client_price|client_id|due_date|score/), 'modèle issu d\'une mission : ni prix, ni client, ni date, ni score');

// écran
for (const lang of ['fr', 'en'] as const) {
  const html = view(lang);
  ok(html.includes('Saisie rapide v2') && html.includes('Contrôle'), `${lang} : les modèles sont listés`);
  ok(html.includes(lang === 'en' ? 'New template' : 'Nouveau modèle') && html.includes('min-h-[44px]'), `${lang} : bouton « Nouveau modèle » et cibles de 44 px`);
  ok(!bad(html), `${lang} : aucun NaN ni « undefined »`);
}
ok(view('fr').includes('Photo et note obligatoires') && view('en').includes('Photo and note required'), 'justificatif dit dans la bonne langue');

// suppression
ok(db.removeMissionTemplate(b.template!.id).success && db.getMissionTemplates().every(x => x.id !== b.template!.id), 'suppression');
ok(db.removeMissionTemplate(b.template!.id).error === 'Modèle introuvable.', 'supprimer deux fois : « introuvable »');

// les réglages enregistrent bien les modèles ; vieux réglages sans modèles : pas de plantage
ok(Array.isArray(db.getSettings().mission_templates) && db.getSettings().mission_templates!.length === 2, 'les modèles sont dans les réglages');
anyDb.settings = [{ ...anyDb.settings[0], mission_templates: 'abc' }];
ok(db.getMissionTemplates().length === 0 && !bad(view('fr')), 'réglages abîmés (texte à la place de la liste) : liste vide, pas de plantage');
anyDb.settings = [{ ...anyDb.settings[0] }]; delete anyDb.settings[0].mission_templates;
ok(db.getMissionTemplates().length === 0, 'réglages sans modèles : liste vide');

// opérateur
db.enterDemo('employee');
ok(db.saveMissionTemplate({ name: 'Pirate' }).error === 'Réservé au responsable.' && db.removeMissionTemplate('x').error === 'Réservé au responsable.', 'opérateur : création et suppression refusées');
ok(db.getMissionTemplates().length === 0, 'opérateur : aucun modèle');
ok(calls === 0, 'aucun appel réseau pendant tout l\'essai');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
