// Démo simplifiée : en mode démo, on CACHE ce qui est inutile ou simulé (notifications téléphone, IA externe, sauvegardes, restauration, remise à zéro,
// journal d'audit, mots de passe, inscriptions et mots de passe oubliés avec leurs décisions). Les données de démo restent. L'accès réel n'est pas touché.
// Lancer : npm run check:demo-simple
import React from 'react';
import fs from 'node:fs';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.addEventListener = () => {}; g.removeEventListener = () => {}; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { SettingsView } = await import('../src/views/admin/SettingsView');
const { HistoryPage } = await import('../src/views/admin/HistoryPage');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => fs.readFileSync(process.cwd() + '/' + p, 'utf8');
const clean = (h: string) => h.replace(/<!-- -->/g, '').replace(/[\u00a0\u202f]/g, ' ');
const page = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return clean(renderToString(<AppProvider><SettingsView /></AppProvider>)); };

db.enterDemo('admin');
const hasSignupData = (db as any).signups.length > 0 && (db as any).resets.length > 0;
ok(hasSignupData, 'les données de démo (inscriptions, mots de passe oubliés) existent toujours dans la mémoire de la démo');
ok(db.getSignupRequests().length === 0 && db.getPasswordResets().length === 0, 'démo : aucune inscription ni mot de passe oublié à décider');

for (const lang of ['fr', 'en'] as const) {
  const html = page(lang);
  ok(!html.includes(lang === 'en' ? 'External AI for the assistant' : 'IA externe pour l\'assistant') && !html.includes(lang === 'en' ? 'External AI' : 'IA externe'), `${lang} démo : la section IA externe est cachée`);
  ok(!/>Notifications</.test(html), `${lang} démo : la carte Notifications du téléphone est cachée`);
}
const hist = clean(renderToString(<AppProvider><HistoryPage /></AppProvider>));
ok(!hist.includes('Demande d’inscription') && !hist.includes('Mot de passe oublié'), 'démo : l\'historique ne montre ni inscription ni mot de passe oublié');

// « à l'envers » : hors démo, les mêmes sections DOIVENT apparaître (sinon ce contrôle ne prouve rien)
(db as any).demo = false;
const real = page('fr');
ok(real.includes('IA externe') && />Notifications</.test(real), 'à l\'envers : hors démo, IA externe et Notifications sont bien affichées');
ok(db.getSignupRequests().length > 0 && db.getPasswordResets().length > 0, 'à l\'envers : hors démo, les demandes sont bien visibles');
(db as any).demo = true;

// Sections de l'onglet Données (non visible sans clic) et mots de passe des employés : lecture du code
const settings = read('src/views/admin/SettingsView.tsx');
ok(/tab === 'data' && !db\.isDemo\(\) && <BackupsSection \/>/.test(settings) && /tab === 'data' && !db\.isDemo\(\) && <AuditSection/.test(settings) && /!db\.isDemo\(\) && <RestoreSection \/>/.test(settings), 'démo : sauvegardes, journal d\'audit et restauration / remise à zéro cachés (Réglages > Données)');
const emp = read('src/views/admin/EmployeesManagement.tsx');
ok((emp.match(/!db\.isDemo\(\) && <div>/g) || []).length === 2 && /demoMode \? 'demo-password' : newPassword/.test(emp), 'démo : les deux champs de mot de passe des employés sont cachés (la création marche avec un mot de passe inventé)');
const login = read('src/views/LoginView.tsx');
ok(/startDemo/.test(login), 'la connexion réelle (LoginView) garde son mot de passe oublié et son inscription : le contrôle ne les a pas touchés');
ok(calls === 0, 'aucun appel réseau');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
