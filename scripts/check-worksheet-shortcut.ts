// Raccourci « Saisir la feuille du jour » (module 26) sur le Tableau de bord et la page du chef d'équipe. Lancer : npm run check:worksheet-shortcut
import { readFileSync } from 'node:fs';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const sc = readFileSync('src/components/WorksheetShortcut.tsx', 'utf8'), ad = readFileSync('src/views/admin/AdminDashboard.tsx', 'utf8'), tv = readFileSync('src/views/TeamValidations.tsx', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
ok(/if \(!WORK_SETTINGS_LIVE\) return null/.test(sc), 'module fermé : aucun raccourci');
ok(/openView\('worksheet'\)/.test(sc) && /min-h-\[56px\]/.test(sc), 'ouvre la Feuille du jour ; grande cible tactile');
ok(/Fill in the daily sheet/.test(sc) && /Saisir la feuille du jour/.test(sc), 'français et anglais');
ok(/<WorksheetShortcut \/>/.test(ad) && /<WorksheetShortcut \/>/.test(tv), 'présent sur le Tableau de bord et chez le chef d\'équipe');
ok(/addEventListener\(OPEN_VIEW_EVENT/.test(app) && /removeEventListener\(OPEN_VIEW_EVENT/.test(app), 'App écoute l\'événement (et le retire en partant)');
const dbCalls = [...sc.matchAll(/db\.(\w+)/g)].map(m => m[1]);
ok(!/fetch\(|supabase/.test(sc) && dbCalls.every(c => ['subscribe', 'getCurrentUser', 'getUsers', 'getPosts'].includes(c)), 'aucun appel au serveur (seulement la lecture des données déjà sur l\'appareil)');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
