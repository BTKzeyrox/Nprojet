// Essai du rapport automatique côté site, en mode démo (aucun réseau) : réglage, liste, ouverture, copie figée une seule fois, droits.
// Lancer : npm run check:auto-report-ui
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AutoReportCard } = await import('../src/views/admin/AutoReportCard');
const { AppProvider } = await import('../src/context/AppContext');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object/.test(html);

db.enterDemo('admin');
// Réglage
ok(db.getAutoReport().frequency === 'off', 'réglage de départ : arrêté');
ok(db.saveAutoReport({ frequency: 'weekly', weekday: 3, month_day: 99, time: '17:30' }).success, 'le responsable enregistre le réglage');
ok(JSON.stringify(db.getAutoReport()) === JSON.stringify({ frequency: 'weekly', weekday: 3, month_day: 1, time: '17:30' }), 'réglage relu : valeur fausse (jour 99) remplacée par la valeur de départ');
ok(db.saveAutoReport({ frequency: 'bidon' }).success && db.getAutoReport().frequency === 'off', 'fréquence inconnue : arrêté');
db.saveAutoReport({ frequency: 'monthly', month_day: 5, time: '09:00' });

// Écran
for (const lang of ['fr', 'en']) {
  mem['delta_lang'] = lang;
  const html = renderToString(<AppProvider><AutoReportCard lang={lang as 'fr' | 'en'} /></AppProvider>);
  ok(html.length > 800 && !bad(html), `${lang} : la carte s'affiche sans erreur (${html.length} caractères)`);
  ok(html.includes(lang === 'en' ? 'Automatic report' : 'Rapport automatique'), `${lang} : titre dans la bonne langue`);
  ok(html.includes(lang === 'en' ? 'On day 5 of each month at 09:00' : 'Le 5 de chaque mois à 09:00'), `${lang} : phrase du réglage`);
}

// Liste, ouverture, copie figée
const list = await db.listReports();
ok(list.ok && list.rows.length === 2, 'démo : deux rapports en attente (semaine et mois finis)');
ok(list.rows.every(r => r.status === 'pending' && !('html' in r)), 'la liste n\'a pas le texte');
ok(list.rows.some(r => r.kind === 'week' && r.id.startsWith('w-')) && list.rows.some(r => r.kind === 'month' && r.id.startsWith('m-')), 'une semaine et un mois');
const w = list.rows.find(r => r.kind === 'week')!;
const o1 = await db.openReport(w.id);
ok(o1.ok && o1.record?.status === 'pending' && !o1.record.html, 'ouvrir une fiche en attente : pas encore de copie');
const f1 = await db.freezeReportCopy(w.id, '<p>Première copie</p>');
ok(f1.ok && f1.record?.status === 'ready' && f1.record.html === '<p>Première copie</p>' && f1.already === false, 'première ouverture : copie figée');
const f2 = await db.freezeReportCopy(w.id, '<p>Autre texte</p>');
ok(f2.ok && f2.already === true && f2.record?.html === '<p>Première copie</p>', 'deuxième envoi : la copie figée ne change JAMAIS');
const o2 = await db.openReport(w.id);
ok(o2.ok && o2.record?.status === 'ready' && o2.record.html === '<p>Première copie</p>' && !!o2.record.frozen_at, 'réouverture : la même copie, avec sa date');
ok(!(await db.freezeReportCopy(list.rows.find(r => r.kind === 'month')!.id, '   ')).ok, 'texte vide refusé');
ok(!(await db.freezeReportCopy('w-2026-10-20', '<p>x</p>')).ok, 'identifiant faux refusé (pas un lundi)');
ok(!(await db.freezeReportCopy('m-2020-01', '<p>x</p>')).ok, 'fiche qui n\'existe pas : refusée');
const l2 = await db.listReports();
ok(l2.ok && l2.rows.filter(r => r.status === 'ready').length === 1, 'liste : une prête, une en attente');

// Droits
db.enterDemo('employee');
ok(!db.saveAutoReport({ frequency: 'weekly' }).success, 'un opérateur ne peut pas changer le réglage');
ok(!(await db.listReports()).ok, 'un opérateur ne peut pas lister les rapports');
ok(!(await db.openReport(w.id)).ok, 'un opérateur ne peut pas ouvrir un rapport');
ok(!(await db.freezeReportCopy(w.id, '<p>x</p>')).ok, 'un opérateur ne peut pas figer une copie');
ok(renderToString(<AppProvider><AutoReportCard lang="fr" /></AppProvider>) === '', 'un opérateur ne voit rien');
ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
