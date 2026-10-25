// Contrôle de la visite guidée (module 16, M16.2) : étapes par rôle, pages permises, textes FR/EN, « déjà vue » par personne, carte Réglages. Sans réseau.
// Lancer : npm run check:tour
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.addEventListener = () => {}; g.removeEventListener = () => {}; g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { SettingsView } = await import('../src/views/admin/SettingsView');
const { tourSteps, TOUR_PAGES, TOUR_VERSION, tourKey, tourSeen, markTourSeen, shouldShowTour } = await import('../src/utils/tour');
const { findPage } = await import('../src/utils/siteKnowledge');
const { viewAllowedFor } = await import('../src/utils/roles');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const FR_WORDS = /\b(le|la|les|des|une|pour|avec|dans|est|sont|ton|tes|tu)\b/i;

const roles = ['admin', 'employee', 'accountant', 'team_lead'] as const;
for (const r of roles) {
  const s = tourSteps(r);
  ok(s.length === TOUR_PAGES[r].length + 1 && s[0].page === null, `${r} : une étape de bienvenue puis une étape par page (${s.length})`);
  ok(TOUR_PAGES[r].every(id => !!findPage(id)), `${r} : chaque page de la visite a sa fiche dans la carte du site`);
  ok(TOUR_PAGES[r].every(id => viewAllowedFor(r, id)), `${r} : la visite ne montre que des pages que ce rôle peut ouvrir`);
  ok(s.every(x => x.title.fr && x.title.en && x.text.fr && x.text.en), `${r} : chaque étape a un titre et un texte en français et en anglais`);
  ok(s.slice(1).every(x => x.tip && x.tip.fr && x.tip.en), `${r} : chaque page a son « pour commencer »`);
  ok(s.every(x => !FR_WORDS.test(x.text.en) && !FR_WORDS.test(x.title.en) && !(x.tip && FR_WORDS.test(x.tip.en))), `${r} : l'anglais ne contient pas de mots français`);
  ok(s.every(x => x.text.fr.length <= 300 && x.text.en.length <= 300), `${r} : textes courts (300 signes au plus)`);
}
ok(JSON.stringify(tourSteps('pirate')) === JSON.stringify(tourSteps('employee')) && JSON.stringify(tourSteps(undefined)) === JSON.stringify(tourSteps('employee')), 'rôle inconnu ou absent : visite d\'opérateur (le moins de droits)');
const money = /(Facturation|Paie|Statistiques|Direction)/;
ok(tourSteps('employee').every(x => !money.test(x.title.fr) || x.page === 'hr'), 'opérateur : aucune page d\'argent de l\'entreprise dans la visite');
ok(tourSteps('team_lead').every(x => !x.page || ['validations', 'chat', 'settings'].includes(x.page)), 'chef d\'équipe : seulement validations, messages, réglages');

// ---- « déjà vue » ----
const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
ok(shouldShowTour(store, 'u1') === true, 'jamais vue : on la montre');
markTourSeen(store, 'u1');
ok(tourSeen(store, 'u1') && shouldShowTour(store, 'u1') === false, 'vue : on ne la remontre plus');
ok(shouldShowTour(store, 'u2') === true, 'une autre personne sur le même appareil la voit quand même');
ok(shouldShowTour(store, '') === false && shouldShowTour(store, undefined) === false && shouldShowTour(null, 'u3') === true, 'pas de personne = pas de visite ; sans stockage : on la montre (sans planter)');
ok(tourKey('u1').includes(`v${TOUR_VERSION}`), 'la clé contient la version de la visite (monter le numéro la refait apparaître)');
const broken = { getItem() { throw new Error('plein'); }, setItem() { throw new Error('plein'); } };
ok(shouldShowTour(broken, 'u1') === true && (() => { try { markTourSeen(broken, 'u1'); return true; } catch { return false; } })(), 'stockage en panne (navigation privée) : aucune erreur');
ok(tourKey('x'.repeat(500)).length < 120, 'identifiant démesuré : clé raccourcie');

// ---- carte « Aide » dans les Réglages ----
const view = (lang: 'fr' | 'en', personal: boolean) => { mem.delta_lang = lang; return renderToString(<AppProvider><SettingsView personalOnly={personal} /></AppProvider>).replace(/<!-- -->/g, ''); };
db.enterDemo('admin');
ok(view('fr', false).includes('Revoir la visite guidée') && view('en', false).includes('Replay the guided tour'), 'Réglages (responsable) : bouton pour revoir la visite, FR et EN');
db.enterDemo('employee');
ok(view('fr', true).includes('Revoir la visite guidée') && view('en', true).includes('Replay the guided tour'), 'Réglages personnels (opérateur, Comptable, Chef d\'équipe) : bouton pour revoir la visite, FR et EN');
ok(view('fr', true).includes('min-h-[44px]'), 'cible tactile de 44 px');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
