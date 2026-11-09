// Assistant : créer un rappel / événement / tâche / liste depuis une phrase (étape C1) : aperçu d'abord, confirmation ensuite, dates comprises, rien d'inventé.
import { readFileSync } from 'node:fs';
import { parseWhen, parseActionIntent, actionPreview, decodeAct, buildItem, encodeAct, ACT_OK_PREFIX, ACT_NO, ACT_MAX_SUBS } from '../src/utils/assistantActions';
import { remClean, remMs } from '../src/utils/reminderRules';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('ÉCHEC :', m); } else console.log('ok :', m); };
// « maintenant » : dimanche 8 novembre 2026, 10 h à Madagascar
const NOW = remMs('2026-11-08', '10:00');
const W = (s: string) => parseWhen(s, NOW);
ok(W('appeler le client demain 9h').date === '2026-11-09' && W('appeler le client demain 9h').time === '09:00' && W('appeler le client demain 9h').rest === 'appeler le client', 'demain 9h : date, heure, titre propre');
ok(W('réunion jeudi à 10 h 30').date === '2026-11-12' && W('réunion jeudi à 10 h 30').time === '10:30' && W('réunion jeudi à 10 h 30').rest === 'réunion', 'jeudi à 10 h 30');
ok(W('payer le loyer le 15 novembre').date === '2026-11-15' && W('payer le loyer le 3 janvier').date === '2027-01-03' && W('x le 3 janvier 2028').date === '2028-01-03', '« le 15 novembre », janvier = année suivante, année donnée respectée');
ok(W('rdv 20/11 à 14:00').date === '2026-11-20' && W('rdv 20/11 à 14:00').time === '14:00' && W('x 5/11').date === '2027-11-05', '20/11 ; une date déjà passée dans l\'année = année suivante');
ok(W('x dans 3 jours').date === '2026-11-11' && W('x dans 2 semaines').date === '2026-11-22' && W('x dans 2 heures').date === '2026-11-08' && W('x dans 2 heures').time === '12:00' && W('x dans 2 heures').rest === 'x', 'dans N jours / semaines / heures (« 3 h » de « 3 heures » n\'est pas pris pour une heure)');
ok(W('x après-demain').date === '2026-11-10' && W('x aujourd\'hui').date === '2026-11-08' && W('x ce soir').time === '18:00' && W('x dimanche').date === '2026-11-15' && W('x le 20').date === '2026-11-20' && W('x le 2').date === '2026-12-02', 'après-demain, aujourd\'hui, ce soir, dimanche = le prochain, « le 20 », « le 2 » = mois suivant');
ok(W('call the client tomorrow at 9am').date === '2026-11-09' && W('call the client tomorrow at 9am').time === '09:00' && W('x on friday 3pm').time === '15:00', 'anglais : tomorrow at 9am, friday 3pm');
ok(W('relancer le client à 9h30').rest === 'relancer le client' && W('hier à 8h appeler Hugo').rest === 'appeler Hugo', 'le « à » devant l\'heure part avec elle');
ok(W('juste un texte').date === '' && W('juste un texte').time === '' && W('juste un texte').rest === 'juste un texte', 'sans date ni heure : rien d\'inventé');

const P = (q: string) => parseActionIntent(q, NOW);
let a = P('Rappelle-moi demain 9h d\'appeler le client');
ok(!!a && a.kind === 'reminder' && a.type === 'call' && a.title === 'Appeler le client' && a.date === '2026-11-09' && a.time === '09:00' && !a.allDay && !a.past && !a.needDate, 'rappelle-moi demain 9h d\'appeler le client → rappel (appel) demain 09:00');
a = P('rappelle-moi de payer la facture vendredi');
ok(!!a && a.type === 'simple' && a.date === '2026-11-13' && a.time === '09:00' && a.guessed.some(x => /heure/.test(x)), 'sans heure : 09:00 par défaut, et c\'est dit dans l\'aperçu');
a = P('rappelle-moi d\'appeler Hugo');
ok(!!a && a.needDate && actionPreview(a).intent === 'action_ask', 'rappel sans date : il demande « Pour quand ? » (pas de date inventée)');
a = P('rappelle-moi à 15h de ranger le stock');
ok(!!a && a.date === '2026-11-08' && a.time === '15:00', 'une heure sans jour, encore à venir : aujourd\'hui');
a = P('rappelle-moi à 8h de ranger le stock');
ok(!!a && a.date === '2026-11-09', 'une heure sans jour, déjà passée : demain');
a = P('Ajoute au calendrier : réunion avec Hugo jeudi 10h');
ok(!!a && a.kind === 'event' && a.type === 'appointment' && a.title === 'Réunion avec Hugo' && a.date === '2026-11-12' && a.time === '10:00' && !a.allDay, 'ajoute au calendrier : réunion … jeudi 10h → rendez-vous');
a = P('ajoute un événement fête de fin d\'année le 20 décembre');
ok(!!a && a.type === 'event' && a.date === '2026-12-20' && a.allDay && a.title.startsWith('Événement'), 'événement sans heure : toute la journée');
a = P('crée une échéance dépôt des comptes le 30 novembre');
ok(!!a && a.type === 'deadline' && a.date === '2026-11-30', 'échéance → type échéance');
a = P('ajoute une tâche : commander le papier');
ok(!!a && a.kind === 'task' && a.type === 'task' && a.title === 'Commander le papier' && a.date === '2026-11-08' && a.allDay && a.guessed.some(x => /aujourd/.test(x)), 'tâche sans date : aujourd\'hui (dit dans l\'aperçu)');
a = P('tâche : relancer le client Soleil lundi');
ok(!!a && a.type === 'task' && a.date === '2026-11-09' && a.title === 'Relancer le client Soleil', 'tâche : … lundi');
a = P('crée une liste de courses : riz, sucre; huile\n- savon');
ok(!!a && a.kind === 'checklist' && a.type === 'checklist' && a.title === 'Liste de courses' && a.subs.join('|') === 'riz|sucre|huile|savon', 'liste de tâches : titre + cases séparées par virgule / point-virgule / ligne');
a = P('rappelle-moi hier à 8h d\'appeler');
ok(!!a && a.past && actionPreview(a).intent === 'action_past', 'date passée : refusée, pas de création');
ok(P('résumé du jour') === null && P('mes rappels') === null && P('quelle est la tâche de Hugo ?') === null && P('rappelle-moi ce que tu as retenu') === null && P('mémorise : réunion jeudi') === null && P('') === null, 'les autres phrases ne sont pas prises pour une création');
ok(P('x'.repeat(700)) === null, 'phrase trop longue : ignorée');

// aperçu → confirmation → élément valable pour le serveur
a = P('Ajoute au calendrier : réunion avec Hugo jeudi 10h')!;
const pv = actionPreview(a);
ok(pv.intent === 'action_preview' && pv.actions.length === 2 && pv.actions[0].go.view.startsWith(ACT_OK_PREFIX) && pv.actions[1].go.view === ACT_NO && /Rien n'est créé tant que tu n'as pas confirmé/.test(pv.lines.map(l => l.fr).join(' ')), 'aperçu : boutons Confirmer / Annuler et « rien n\'est créé » avant la confirmation');
const back = decodeAct(pv.actions[0].go.view);
ok(!!back && back.title === a.title && back.date === a.date && back.time === a.time && back.type === a.type, 'le bouton Confirmer porte la demande (lue de nouveau, sans mémoire cachée)');
ok(decodeAct(ACT_OK_PREFIX + encodeURIComponent('{"t":"payment","k":"event","n":"x","d":"2026-11-12","h":"10:00"}')) === null && decodeAct(ACT_OK_PREFIX + 'pas du json') === null && decodeAct(ACT_OK_PREFIX + encodeURIComponent('{"t":"task","k":"task","n":"x","d":"2026-13-45","h":"10:00"}')) === null && decodeAct('autre') === null, 'bouton abîmé / type interdit / date fausse : refusé');
const item = buildItem(back!);
const clean = remClean(item, 'admin', 'u1', NOW);
ok(!!clean && clean.type === 'appointment' && clean.title === 'Réunion avec Hugo' && clean.date === '2026-11-12' && clean.time === '10:00' && !clean.shared && clean.fires.length > 0, 'élément accepté par la validation du serveur (remClean) : à toi seul, avec les rappels conseillés');
const L = buildItem(P('crée une liste de tâches : a, b')!);
const cl = remClean(L, 'admin', 'u1', NOW);
ok(!!cl && cl.type === 'checklist' && cl.subtasks.length === 2 && cl.subtasks[0].text === 'a' && !cl.subtasks[0].done, 'liste : cases enregistrées, non cochées');
ok(ACT_MAX_SUBS === 30 && (parseActionIntent('crée une liste : ' + Array.from({ length: 50 }, (_, i) => 'x' + i).join(','), NOW)?.subs.length === 30), '30 cases au plus (comme le serveur)');
ok(encodeAct(a).length < 900, 'bouton Confirmer : petit');

// branchement
const chat = readFileSync('src/components/AssistantChat.tsx', 'utf8');
ok(/parseActionIntent\(q, Date\.now\(\)\)/.test(chat) && /actionPreview\(act\)/.test(chat) && /decodeAct\(g\.view\)/.test(chat) && /saveReminder\(buildItem/.test(chat) && /g\.view === ACT_NO/.test(chat), 'assistant : phrase → aperçu ; Confirmer → db.remSave ; Annuler → rien');
ok(/parseMemoryIntent\(q\)[\s\S]{0,1800}parseActionIntent\(q, Date\.now\(\)\)/.test(chat), 'la mémoire passe avant les créations');
{ const L = parseActionIntent('crée une liste de courses : 2 kg de riz, 1. sucre, - huile', Date.UTC(2026, 10, 9, 5)); ok(!!L && JSON.stringify(L.subs) === '["2 kg de riz","sucre","huile"]', 'liste : un chiffre au début d\'un élément est gardé (« 2 kg de riz »), seules les puces et « 1. » sont retirées'); }
console.log(`\n${bad ? bad + ' ÉCHEC(S)' : 'tout est bon'}`);
process.exit(bad ? 1 : 0);
