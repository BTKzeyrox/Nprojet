// Feuille du jour (module 26, M26.5e) : la page est branchée partout, cachée tant que le module n'est pas ouvert, et ses textes sont complets. Lancer : npm run check:work-sheet-page
import { readFileSync } from 'node:fs';
import { WORK_SETTINGS_LIVE } from '../src/utils/workTypes';
import { menuFor } from '../src/utils/menuGroups';
import { viewAllowedFor, TEAM_LEAD_VIEWS } from '../src/utils/roles';
import { SITE_MAP } from '../src/utils/siteKnowledge';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const app = readFileSync('src/App.tsx', 'utf8'), side = readFileSync('src/components/Sidebar.tsx', 'utf8'), view = readFileSync('src/views/WorksheetView.tsx', 'utf8');
const tabs = (role: string) => menuFor(role).flatMap(g => g.tabs.map(t => t.view));

ok(/WORK_SETTINGS_LIVE/.test(readFileSync('src/utils/workTypes.ts', 'utf8')), 'l\'interrupteur du module existe');
ok(tabs('admin').includes('worksheet') === WORK_SETTINGS_LIVE && tabs('team_lead').includes('worksheet') === WORK_SETTINGS_LIVE, `menu : la Feuille du jour est ${WORK_SETTINGS_LIVE ? 'visible' : 'cachée'} pour le responsable et le Chef d'équipe selon l'interrupteur`);
ok(!tabs('employee').includes('worksheet') && !tabs('accountant').includes('worksheet'), 'jamais dans le menu de l\'opérateur ni du Comptable');
ok(viewAllowedFor('team_lead', 'worksheet') && !viewAllowedFor('accountant', 'worksheet') && (TEAM_LEAD_VIEWS as readonly string[]).includes('worksheet'), 'droits : le Chef d\'équipe peut ouvrir la page, le Comptable non');
ok((app.match(/activeView === 'worksheet' && WORK_SETTINGS_LIVE/g) || []).length === 2, 'App : la page est branchée pour le Chef d\'équipe ET pour le responsable, derrière l\'interrupteur');
ok(/id: 'worksheet'/.test(side) && /WORK_SETTINGS_LIVE && \(isAdmin \|\| currentUser\.role === 'team_lead'\)/.test(side), 'menu latéral : entrée réservée au responsable et au Chef d\'équipe, derrière l\'interrupteur');
ok(!!SITE_MAP.find(p => p.id === 'worksheet') === WORK_SETTINGS_LIVE, 'carte du site : la fiche n\'existe que module ouvert');
const card = SITE_MAP.find(p => p.id === 'worksheet');
ok(!card || (card.howto.length === 3 && card.rules.length >= 3 && [card.title, card.purpose, ...card.howto, ...card.rules].every(b => b.fr.length > 5 && b.en.length > 5 && !/[àâçéèêëîïôùûœ]/i.test(b.en))), 'fiche complète en français et en anglais (sans accent dans l\'anglais)');
ok(/addWorkEntries/.test(view) && /data-worksheet-save/.test(view) && /data-worksheet-date/.test(view) && /max=\{today\}/.test(view), 'la page enregistre par le magasin et limite la date à aujourd\'hui');
ok(/localStorage/.test(view) && /try \{/.test(view), 'brouillon gardé sur l\'appareil avec protection si le stockage manque');
ok(/role === 'admin' \|\| t\.entry\.includes/.test(view) && /weCanEnterFor/.test(view), 'la liste des opérateurs et des types suit les droits (mêmes règles que le serveur)');
// M26.6 : paie propre à chaque employé
const emp = readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8'), srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/WORK_SETTINGS_LIVE && editingUser && editingUser\.role === 'employee'/.test(emp) && /data-employee-pay/.test(emp), 'fiche employé : le bloc « Mode de paie » n\'existe que module ouvert et pour un opérateur');
ok(/!payRateOk\(editPayRate\)\) return/.test(emp), 'un tarif impossible bloque l\'enregistrement');
ok(/pay_mode: isPayMode\(editPayMode\) \? editPayMode : undefined/.test(emp), 'mode vide = comme l\'entreprise (le champ est retiré)');
ok(/reason: 'pay_mode'/.test(srv) && /reason: 'pay_rate'/.test(srv) && /pr > 100000000/.test(srv), 'serveur : mode inconnu et tarif hors 0 à 100 000 000 refusés à l\'enregistrement');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
