// Calendrier : un jour avec seulement des lignes de la feuille du jour (saisies par un chef/l'admin) n'affiche ni Connexion, ni Missions, ni statut « Hors ligne ».
import { readFileSync } from 'node:fs';
const cal = readFileSync('src/views/CalendarView.tsx', 'utf8');
const ps = readFileSync('src/utils/presenceStatus.ts', 'utf8');
let ok = 0, bad = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { bad++; console.log('ÉCHEC :', n); } };
t('sheetOnly défini (pas de 1re connexion, pas de mission, au moins une ligne)', /const sheetOnly = !d\.firstSeen && d\.missions\.length === 0 && d\.workLines\.length > 0/.test(cal));
t('pastille En ligne/Hors ligne cachée', /day === today && !sheetOnly && <OnlinePill iso=\{presenceOf\(r\.id\)\}/.test(cal));
t('cadre Connexion caché', /\{!sheetOnly && <div className=\{box\}>\s*<div className=\{h\}>Connexion<\/div>/.test(cal));
t('cadre Missions du jour caché', /\{!sheetOnly && <div className=\{box\}>\s*<div className=\{h\}>Missions du jour<\/div>/.test(cal));
t('ligne live cachée', /day === today && u && !sheetOnly && <div className="mt-1 text-xs"><LiveLine/.test(cal));
t('bloc feuille du jour toujours affiché', /d\.workLines\.length > 0 && \(\s*<div className=\{box\} data-testid=\{`day-worklines-/.test(cal));
t('date de présence avant l\'an 2000 ignorée', /lastRaw > 946684800000/.test(ps));
console.log(`${ok}/${ok + bad} contrôles réussis`);
process.exit(bad ? 1 : 0);
