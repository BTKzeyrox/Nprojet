// Anglais et vocabulaire du modèle d'entreprise (module 26, M26.10). Lancer : npm run check:work-words
import { readFileSync } from 'node:fs';
import { BUSINESS_MODELS, workWord, PRESENCE_LABEL } from '../src/utils/workTypes';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
ok(BUSINESS_MODELS.every(m => m.work.fr.trim() && m.work.en.trim() && m.name.en.trim() && m.about.en.trim()), 'chaque modèle a son mot et ses textes en français et en anglais');
ok(BUSINESS_MODELS.every(m => m.types.every(t => t.name.fr.trim() && t.name.en.trim() && (!t.unit || (t.unit.fr.trim() && t.unit.en.trim())))), 'chaque type de travail a un nom (et une unité) dans les deux langues');
ok(Object.values(PRESENCE_LABEL).every(l => l.fr && l.en), 'chaque présence a son nom en français et en anglais');
const w = (id: unknown, l: 'fr' | 'en') => workWord(id, l);
ok(w('delivery', 'fr') === 'course' && w('delivery', 'en') === 'run' && w('cleaning', 'fr') === 'intervention' && w('workshop', 'fr') === 'production' && w('security', 'fr') === 'mission', 'course, intervention, production, mission selon le modèle');
ok(w('inconnu', 'fr') === 'mission' && w(undefined, 'en') === 'mission' && w(null, 'fr') === 'mission' && w(5, 'fr') === 'mission', 'modèle absent ou inconnu : « mission » (comme avant)');
const ws = readFileSync('src/views/WorksheetView.tsx', 'utf8'), emp = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8');
ok(/const en = app\.lang === 'en'/.test(ws) && !/>Appliquer<|>Tous présents<|>Enregistrer la feuille|>Imprimer la feuille papier</.test(ws), 'Feuille du jour : plus de texte français « en dur » sur les boutons');
ok(/REASON_EN/.test(ws) && /SHEET_ERR_EN/.test(ws), 'Feuille du jour : raisons de refus aussi en anglais');
ok(/en \? 'en' : 'fr'/.test(ws) && /data-worksheet-word/.test(ws), 'feuille papier dans la langue de l\'écran ; mot du modèle affiché');
ok(/Tracked by entry only/.test(emp), 'case « suivi par saisie » aussi en anglais');
const sm = readFileSync('src/utils/siteKnowledge.ts', 'utf8') + readFileSync('src/utils/guideScripts.ts', 'utf8');
ok(/worksheet/.test(sm), 'carte du site et guide connaissent la Feuille du jour');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
