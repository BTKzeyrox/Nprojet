// Rappel « feuille du jour pas saisie » (M27.4). Lancer : npm run check:sheet-reminder
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { sheetReminderPlan } from '../src/utils/sheetReminder';
import { notifyText } from '../src/utils/pushEvents';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const blk = src.match(/\/\/ ===== BEGIN SHEETREMINDER[^\n]*\n([\s\S]*?)\/\/ ===== END SHEETREMINDER =====/)![1];
const S: any = new Function(transformSync(blk.replace(/\bexport /g, '') + '\nreturn sheetReminderPlan;', { loader: 'ts' }).code)();
const J = JSON.stringify;

// 2026-11-10 est un mardi. 18:30 à Madagascar = 15:30 UTC.
const at = (date: string, hh: number, mm = 0) => Date.parse(`${date}T00:00:00Z`) + (hh * 60 + mm) * 60000 - 3 * 3600000;
const users = [
  { id: 'a', role: 'admin' }, { id: 'l1', role: 'team_lead', team: 'Nuit' }, { id: 'l2', role: 'team_lead', team: 'Jour' }, { id: 'l0', role: 'team_lead' },
  { id: 'e1', role: 'employee', team: 'Nuit' }, { id: 'e2', role: 'employee', team: 'nuit ' }, { id: 'e3', role: 'employee', team: 'Jour' }, { id: 'e4', role: 'employee', status: 'blocked', team: 'Jour' }, { id: 'e5', role: 'employee' },
];
const L = (id: string, status = 'completed') => ({ id, status });
const D = '2026-11-10';
const base = [L('we-2026-11-09-e1-pack'), L(`we-${D}-e3-pack`, 'pending_end')];
const p = (lines: any[], settings: any = {}, now = at(D, 18, 30)) => S(users, lines, settings, now);

let r = p(base);
ok(r.date === D && J(r.notices) === J([{ to: 'a', count: 3 }, { to: 'l1', count: 2 }]), 'e1, e2, e5 sans ligne : le responsable en voit 3, le chef Nuit 2 (e1, e2 : équipe écrite en majuscules/espaces ignorée), le chef Jour 0 (e3 saisi, e4 bloqué), le chef sans équipe rien');
ok(J(sheetReminderPlan(users as any, base, {}, at(D, 18, 30))) === J(r), 'site = serveur');
ok(p([...base, L(`we-${D}-e1-pack`), L(`we-${D}-e2-pack`), L(`we-${D}-e5-pack`)]).notices.length === 0, 'tout est saisi : rien');
ok(p([...base, L(`we-${D}-e1-pack`, 'rejected')]).notices[0].count === 3, 'une ligne refusée ne compte pas comme saisie');
ok(p([L('we-2026-10-20-e1-pack')]).notices.length === 0, 'dernière ligne il y a 21 jours : la feuille n\'est pas utilisée, rien');
ok(p([L('we-2026-10-28-e1-pack')]).notices.length > 0, 'dernière ligne il y a 13 jours : utilisée');
ok(p([]).notices.length === 0, 'aucune ligne jamais : rien');
ok(p(base, { company: { work: { sheet_reminder: 'off' } } }).notices.length === 0, 'réglage « Non » : rien');
ok(p(base, { company: { work: { sheet_reminder: 'on' } } }).notices.length === 2, 'réglage « Oui » : envoyé');
ok(p(base, {}, at(D, 17, 59)).notices.length === 0 && p(base, {}, at(D, 18, 0)).notices.length === 2, 'défaut 18 h : pas à 17:59, oui à 18:00');
ok(p(base, {}, at(D, 20, 59)).notices.length === 2 && p(base, {}, at(D, 21, 0)).notices.length === 0, 'fenêtre de 3 heures : jusqu\'à 20:59');
ok(p(base, { company: { work: { sheet_reminder_hour: '16' } } }, at(D, 16, 5)).notices.length === 2 && p(base, { company: { work: { sheet_reminder_hour: '16' } } }, at(D, 18, 5)).notices.length === 2 && p(base, { company: { work: { sheet_reminder_hour: '16' } } }, at(D, 19, 0)).notices.length === 0, 'heure réglée 16 h');
ok(p(base, { company: { work: { sheet_reminder_hour: 'xx' } } }, at(D, 18, 5)).notices.length === 2 && p(base, { company: { work: { sheet_reminder_hour: '3' } } }, at(D, 3, 5)).notices.length === 0, 'heure illisible : retour à 18 h');
// fuseau : 21:30 UTC le 10 = 00:30 le 11 à Madagascar (autre jour), 15:30 UTC = 18:30
ok(S(users, base, {}, Date.parse(`${D}T15:30:00Z`)).date === D && S(users, base, {}, Date.parse(`${D}T21:30:00Z`)).notices.length === 0, 'heure de Madagascar (UTC+3), pas celle du serveur');
// repos : dimanche 2026-11-15
const lines15 = [L('we-2026-11-14-e1-pack')];
ok(S(users, lines15, {}, at('2026-11-15', 18, 30)).notices.length === 0, 'dimanche (repos par défaut) : rien');
ok(S(users, lines15, { work_days: [0, 1, 2, 3, 4, 5, 6] }, at('2026-11-15', 18, 30)).notices.length > 0, 'dimanche travaillé dans Réglages : envoyé');
ok(p(base, { work_days: [1, 3] }).notices.length === 0 && p(base, { work_days: [2] }).notices.length === 2, 'jours de travail réglés : mardi seulement');
ok(p(base, { work_days: [] }).notices.length === 2 && p(base, { work_days: 'x' }).notices.length === 2, 'liste de jours illisible : lundi à samedi');
// comptes bloqués : jamais prévenus
const u2 = [{ id: 'a', role: 'admin', status: 'blocked' }, ...users.slice(1)];
ok(S(u2, base, {}, at(D, 18, 30)).notices.every((n: any) => n.to !== 'a'), 'responsable bloqué : jamais prévenu');
ok(S([], base, {}, at(D, 18, 30)).notices.length === 0 && S(users, base, null, at(D, 18, 30)).notices.length === 2, 'liste vide ou réglages absents : sans plantage');
// texte : jamais de contenu des lignes ; nombre borné
const t = notifyText('sheet_missing', { count: 4 });
ok(t.fr.title === 'Feuille du jour' && t.fr.body === '4 sans ligne' && t.en.body === '4 without a line', 'texte du rappel');
ok(notifyText('sheet_missing', { count: -3 }).fr.body === '0 sans ligne' && notifyText('sheet_missing', { count: 1e9 }).fr.body === '999 sans ligne' && notifyText('sheet_missing', {}).fr.body === '0 sans ligne', 'nombre borné de 0 à 999');
// serveur : branché
ok(/sheetReminderPlan\(users, lines, settings, nowMs\)/.test(src) && /sheet-\$\{plan\.date\}-\$\{n\.to\}/.test(src) && /const sheetSent = await sheetReminderRun\(nowMs\)/.test(src), 'serveur : branché sur la tâche planifiée, une seule fois par jour et par personne');
ok(/'worksheet'/.test(readFileSync('src/utils/deepLink.ts', 'utf8')), 'le chef d\'équipe peut ouvrir la Feuille du jour depuis la notification');
const cc = readFileSync('src/components/CompanyConditions.tsx', 'utf8');
ok(/key: 'sheet_reminder', kind: 'select'/.test(cc) && /key: 'sheet_reminder_hour', kind: 'select'/.test(cc), 'réglages visibles dans Réglages > Conditions');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
