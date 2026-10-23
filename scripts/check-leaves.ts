// Contrôle des règles des congés (module 5, M5.2), sans réseau ni écran.
// Lancer : npm run check:leaves
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { checkLeave, workingDays, leaveOn, leaveBalance, paidUsed, leaveReasonText, type Leave } from '../src/utils/leaves';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const NOW = '2026-10-23T08:00:00.000Z', TODAY = '2026-10-23'; // vendredi
const ctx = (p: any = {}) => ({ today: TODAY, allowance: 0, perWeek: 6, others: [] as any[], ...p });
const emp = { id: 'u1', name: 'Marie', admin: false }, adm = { id: 'admin', name: 'Resp', admin: true };
const req = (p: any = {}) => ({ id: 'l1', employee_id: 'u1', type: 'paid', start_date: '2026-11-02', end_date: '2026-11-06', status: 'pending', reason: 'Famille', ...p }); // lundi à vendredi

// jours ouvrés
ok(workingDays('2026-11-02', '2026-11-08', 6) === 6, 'lundi à dimanche = 6 jours (dimanche = repos)');
ok(workingDays('2026-11-02', '2026-11-08', 5) === 5, '5 jours par semaine : samedi aussi = repos');
ok(workingDays('2026-11-02', '2026-11-08', 7) === 7, '7 jours par semaine : aucun repos');
ok(workingDays('2026-11-02', '2026-11-08', 0) === 6 && workingDays('2026-11-02', '2026-11-08', NaN) === 6 && workingDays('2026-11-02', '2026-11-08', 3) === 6, 'réglage vide ou faux = 6 par défaut');
ok(workingDays('2026-11-08', '2026-11-08', 6) === 0, 'un dimanche seul = 0 jour');
ok(workingDays('2026-12-28', '2027-01-03', 6, 2026) === 4 && workingDays('2026-12-28', '2027-01-03', 6, 2027) === 2, 'un congé à cheval sur 2 années est coupé par année');
ok(workingDays('2028-02-27', '2028-03-01', 7) === 4, 'année bissextile (29 février)');

// création par le salarié
const c1 = checkLeave(req(), undefined, emp, NOW, ctx()) as any;
ok(c1.ok && c1.save.days === 5 && c1.save.status === 'pending' && c1.save.employee_name === 'Marie' && c1.save.created_by === 'u1', 'demande valide : jours calculés par le serveur, nom posé par le serveur');
ok((checkLeave(req({ days: 99, employee_name: 'Pirate', decided_by: 'x', decision_reason: 'ok' }), undefined, emp, NOW, ctx()) as any).save.days === 5, 'jours, nom et décision envoyés par le navigateur ignorés');
const R = (p: any, reason: string, name: string, who = emp, cx = ctx(), ex: any = undefined) => { const r = checkLeave(req(p), ex, who, NOW, cx) as any; ok(!r.ok && r.reason === reason, name); };
R({ employee_id: 'u2' }, 'employee', 'un salarié ne crée pas la demande d\'un autre');
R({ status: 'approved' }, 'status', 'un salarié ne crée pas une demande déjà acceptée');
R({ status: 'zzz' }, 'status', 'état inconnu refusé');
R({ type: 'vacances' }, 'type', 'type inconnu refusé');
R({ start_date: '2026-11-09', end_date: '2026-11-02' }, 'dates', 'fin avant le début refusée');
R({ start_date: '2026-02-30' }, 'dates', 'date impossible refusée');
R({ start_date: '2026-11-02', end_date: '2027-03-01' }, 'span', 'plus de 90 jours refusé');
R({ start_date: '2026-09-20', end_date: '2026-09-21' }, 'past', 'début de plus de 30 jours en arrière refusé');
R({ start_date: '2028-01-01', end_date: '2028-01-02' }, 'future', 'début à plus d\'un an refusé');
R({ start_date: '2026-11-08', end_date: '2026-11-08' }, 'no_working_day', 'un dimanche seul refusé');
R({ id: '' }, 'id', 'identifiant vide refusé');
ok(!(checkLeave(null, undefined, emp, NOW, ctx()) as any).ok && !(checkLeave([], undefined, emp, NOW, ctx()) as any).ok, 'demande vide ou tableau refusée');
ok((checkLeave(req({ start_date: '2026-10-10', end_date: '2026-10-12', type: 'sick' }), undefined, emp, NOW, ctx()) as any).ok, 'maladie déclarée 13 jours après : acceptée (30 jours permis)');
ok((checkLeave(req({ reason: '<b>x</b>' }), undefined, emp, NOW, ctx()) as any).save.reason === 'bx/b', 'chevrons retirés du motif');
ok((checkLeave(req({ reason: 'x'.repeat(500) }), undefined, emp, NOW, ctx()) as any).save.reason.length === 300, 'motif coupé à 300');
ok(!('reason' in (checkLeave(req({ reason: '   ' }), undefined, emp, NOW, ctx()) as any).save), 'motif vide : champ non écrit');

// chevauchement
const other = (p: any) => ({ id: 'o1', employee_id: 'u1', type: 'paid', start_date: '2026-11-05', end_date: '2026-11-10', status: 'approved', ...p });
R({}, 'overlap', 'chevauchement avec un congé accepté refusé', emp, ctx({ others: [other({})] }));
R({}, 'overlap', 'chevauchement avec une demande en attente refusé', emp, ctx({ others: [other({ status: 'pending' })] }));
ok((checkLeave(req(), undefined, emp, NOW, ctx({ others: [other({ status: 'rejected' }), other({ id: 'o2', status: 'cancelled' })] })) as any).ok, 'un congé refusé ou annulé ne bloque pas');
ok((checkLeave(req(), undefined, emp, NOW, ctx({ others: [other({ start_date: '2026-11-06', end_date: '2026-11-06' })] })) as any).ok === false, 'un seul jour en commun suffit pour refuser');
ok((checkLeave(req({ end_date: '2026-11-04' }), undefined, emp, NOW, ctx({ others: [other({})] })) as any).ok, 'dates qui se touchent sans se chevaucher : acceptées');

// solde de congé payé
const bal = (allowance: number, others: any[], p: any = {}) => checkLeave(req(p), undefined, emp, NOW, ctx({ allowance, others })) as any;
ok(bal(30, []).ok && bal(0, []).ok, 'solde suffisant ou pas de solde réglé : accepté');
ok(!bal(4, []).ok && bal(4, []).reason === 'balance', '5 jours demandés pour 4 de solde : refusé');
ok(bal(5, []).ok, 'exactement le solde : accepté');
ok(bal(10, [other({ start_date: '2026-03-02', end_date: '2026-03-06' })], {}).ok, 'solde 10, 5 déjà pris + 5 demandés : accepté');
ok(!bal(9, [other({ start_date: '2026-03-02', end_date: '2026-03-06' })], {}).ok, 'solde 9, 5 pris + 5 demandés : refusé');
ok(bal(9, [other({ start_date: '2026-03-02', end_date: '2026-03-06', type: 'sick' })], {}).ok, 'la maladie ne consomme pas le solde payé');
ok(bal(4, [], { type: 'unpaid' }).ok && bal(4, [], { type: 'sick' }).ok, 'sans solde et maladie : jamais limités par le solde');
ok(bal(9, [other({ start_date: '2026-03-02', end_date: '2026-03-06', status: 'pending' })], {}).reason === 'balance', 'une demande en attente consomme le solde');
ok(bal(9, [other({ start_date: '2025-03-03', end_date: '2025-03-07' })], {}).ok, 'les congés de l\'année passée ne comptent pas');
ok(paidUsed([other({ start_date: '2026-03-02', end_date: '2026-03-06' })], 2026, 6, 'zz') === 5 && paidUsed([other({})], 2026, 6, 'o1') === 0, 'jours déjà pris (la demande elle-même exclue)');

// décisions de l'admin
const pend = { ...(c1.save) };
const dec = (status: string, who: any, reason: string | undefined, ex: any = pend, cx = ctx()) => checkLeave({ ...ex, status, decision_reason: reason }, ex, who, NOW, cx) as any;
ok(dec('approved', adm, undefined).ok && dec('approved', adm, undefined).save.decided_by === 'admin', 'l\'admin accepte (sans motif)');
ok(dec('approved', emp, undefined).reason === 'transition', 'un salarié ne peut pas accepter sa propre demande');
ok(dec('rejected', adm, undefined).reason === 'decision_reason' && dec('rejected', adm, 'ab').reason === 'decision_reason', 'refus sans motif (ou de 2 caractères) refusé');
ok(dec('rejected', adm, 'Période chargée').ok && dec('rejected', adm, 'Période chargée').save.decision_reason === 'Période chargée', 'refus avec motif accepté et motif gardé');
ok(dec('rejected', emp, 'je refuse').reason === 'transition', 'un salarié ne peut pas refuser');
ok(dec('approved', adm, undefined, pend, ctx({ others: [other({})] })).reason === 'overlap', 'accepter une demande qui chevauche un congé accepté : refusé');
ok(dec('approved', adm, undefined, pend, ctx({ others: [other({ status: 'pending' })] })).ok, 'un autre congé seulement en attente ne bloque pas l\'acceptation');
ok(dec('approved', adm, undefined, pend, ctx({ allowance: 4 })).reason === 'balance', 'accepter au-delà du solde : refusé');
const appr = dec('approved', adm, undefined).save;
ok(dec('cancelled', emp, undefined, pend).ok && dec('cancelled', emp, undefined, pend).save.status === 'cancelled', 'le salarié annule sa demande en attente');
ok(dec('cancelled', emp, undefined, appr).ok, 'le salarié annule un congé accepté pas encore commencé');
const started = { ...appr, start_date: '2026-10-21', end_date: '2026-10-25' };
ok(dec('cancelled', emp, undefined, started).reason === 'transition', 'le salarié ne peut plus annuler un congé commencé');
ok(dec('cancelled', adm, undefined, started).reason === 'decision_reason' && dec('cancelled', adm, 'Retour anticipé', started).ok, 'l\'admin annule un congé commencé avec un motif');
const rej = dec('rejected', adm, 'Non').save;
ok(dec('approved', adm, undefined, rej).reason === 'transition' && dec('cancelled', adm, 'x ok', rej).reason === 'transition', 'un congé refusé ne change plus');
const canc = dec('cancelled', emp, undefined, pend).save;
ok(dec('approved', adm, undefined, canc).reason === 'transition' && dec('pending', emp, undefined, canc).reason === 'transition', 'un congé annulé ne change plus');
ok(dec('pending', adm, undefined, appr).reason === 'transition', 'on ne revient jamais en « en attente »');
ok((checkLeave({ ...pend, status: 'pending', start_date: '2030-01-01', type: 'sick', days: 99, employee_id: 'u9' }, pend, emp, NOW, ctx()) as any).save === pend, 'sans changement d\'état : rien ne change (dates, type, jours ignorés)');
ok((checkLeave({ ...pend, status: 'cancelled' }, pend, { id: 'u2', name: 'Autre', admin: false }, NOW, ctx()) as any).reason === 'forbidden', 'un autre salarié ne touche pas à ma demande');
const adminCreates = checkLeave(req({ employee_id: 'u7', employee_name: 'Jean', status: 'approved', type: 'sick' }), undefined, adm, NOW, ctx()) as any;
ok(adminCreates.ok && adminCreates.save.employee_id === 'u7' && adminCreates.save.status === 'approved' && adminCreates.save.decided_by === 'admin', 'l\'admin enregistre un congé déjà accepté pour un salarié');
ok((checkLeave(req({ employee_id: '', status: 'approved' }), undefined, adm, NOW, ctx()) as any).reason === 'employee', 'l\'admin doit désigner un salarié');
ok((checkLeave(req({ status: 'rejected' }), undefined, adm, NOW, ctx()) as any).reason === 'status', 'on ne crée pas une demande déjà refusée');

// calendrier et solde
const L: Leave[] = [
  { ...(appr as any) , id: 'a', start_date: '2026-11-02', end_date: '2026-11-04' },
  { ...(appr as any), id: 'b', employee_id: 'u1', status: 'pending', start_date: '2026-11-10', end_date: '2026-11-11' },
  { ...(appr as any), id: 'c', employee_id: 'u2', start_date: '2026-11-02', end_date: '2026-11-04' },
  { ...(appr as any), id: 'd', status: 'rejected', start_date: '2026-11-20', end_date: '2026-11-21' },
];
ok(leaveOn(L, 'u1', '2026-11-03') === 'paid' && leaveOn(L, 'u1', '2026-11-05') === null && leaveOn(L, 'u1', '2026-11-02') === 'paid' && leaveOn(L, 'u1', '2026-11-04') === 'paid', 'congé accepté : début et fin compris');
ok(leaveOn(L, 'u1', '2026-11-10') === null && leaveOn(L, 'u1', '2026-11-20') === null, 'en attente ou refusé : le jour compte comme normal');
ok(leaveOn(L, 'u3', '2026-11-03') === null && leaveOn(undefined, 'u1', '2026-11-03') === null, 'autre salarié ou pas de liste : rien');
const b = leaveBalance(L, 'u1', 2026, 10, 6);
ok(b.allowance === 10 && b.used === 3 && b.pending === 2 && b.left === 5, 'solde : 10 − 3 pris − 2 en attente = 5');
ok(leaveBalance(L, 'u1', 2026, 0, 6).left === null && leaveBalance(L, 'u1', 2026, NaN, 6).left === null, 'pas de solde réglé = pas de reste');
ok(leaveBalance(L, 'u1', 2026, 2, 6).left === 0, 'le reste ne devient jamais négatif');
ok(leaveBalance(L, 'u1', 2025, 10, 6).used === 0, 'autre année : rien');
ok(leaveReasonText('balance').includes('congé payé') && leaveReasonText('overlap', 'en').includes('overlap') && leaveReasonText('zzz') === 'Demande refusée.', 'messages d\'erreur FR/EN');

// --- le serveur : même fonction, même résultat, mêmes protections ---
const read = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('supabase/functions/df-api/index.ts');
const site = read('src/utils/leaves.ts');
const region = (t: string) => (/\/\/ BEGIN LEAVECLEAN\n([\s\S]*?)\/\/ END LEAVECLEAN\n/.exec(t) || [])[1] || '';
ok(region(site).length > 1500 && region(site) === region(server), 'la fonction du serveur est la copie exacte de celle du site');
const blk = /\/\/ ===== BEGIN LEAVES [^\n]*\n([\s\S]*?)\/\/ ===== END LEAVES =====/.exec(server);
ok(!!blk, 'bloc LEAVES trouvé dans le serveur');
const serverLeave = new Function(transformSync(blk![1], { loader: 'ts' }).code + '\nreturn cleanLeave;')() as typeof checkLeave;
const cases: [any, any, any, any][] = [
  [req(), undefined, emp, ctx()], [req({ type: 'x' }), undefined, emp, ctx()], [req({ start_date: '2026-11-09', end_date: '2026-11-02' }), undefined, emp, ctx()],
  [req(), undefined, emp, ctx({ allowance: 4 })], [req(), undefined, emp, ctx({ others: [other({})] })], [req({ status: 'approved' }), undefined, emp, ctx()],
  [req({ employee_id: 'u7', status: 'approved', type: 'sick' }), undefined, adm, ctx()], [{ ...pend, status: 'approved' }, pend, adm, ctx()], [{ ...pend, status: 'approved' }, pend, emp, ctx()],
  [{ ...pend, status: 'rejected' }, pend, adm, ctx()], [{ ...pend, status: 'rejected', decision_reason: 'Période chargée' }, pend, adm, ctx()], [{ ...pend, status: 'cancelled' }, pend, emp, ctx()],
  [{ ...appr, status: 'cancelled' }, appr, emp, ctx()], [{ ...started, status: 'cancelled' }, started, emp, ctx()], [{ ...started, status: 'cancelled', decision_reason: 'Retour' }, started, adm, ctx()],
  [req({ start_date: '2026-12-28', end_date: '2027-01-09' }), undefined, emp, ctx({ allowance: 10 })], [req({ start_date: '2026-12-28', end_date: '2027-01-09' }), undefined, emp, ctx({ allowance: 20 })],
  [null, undefined, emp, ctx()], [req({ id: 5 }), undefined, emp, ctx()],
];
ok(cases.every(([r, e, a, c]) => JSON.stringify(serverLeave(r, e, a, NOW, c)) === JSON.stringify(checkLeave(r, e, a, NOW, c))), `site et serveur donnent le même résultat sur ${cases.length} cas`);
ok(/leaves: "df_leaves"/.test(server), 'la collection leaves existe dans le serveur');
ok(/if \(col === 'leaves'\) return q\.eq\('data->>employee_id', me\.id\);/.test(server), 'lecture : un salarié ne reçoit que SES demandes (l\'admin passe avant le filtre)');
ok(/const scope = \(q: any\) => \{\s*if \(admin\) return q;/.test(server), 'l\'admin n\'est pas filtré, tous les autres le sont');
ok(/if \(col === 'leaves'\) \{[\s\S]{0,900}cleanLeave\(rec, existing, \{ id: me\.id, name: String\(me\.name \|\| ''\), admin \}, now, await leaveCtx\(empId\)\)/.test(server), 'chaque écriture de congé (tous rôles) passe par cleanLeave avec le contexte du serveur');
ok(/const empId = existing \? String\(existing\.employee_id \|\| ''\) : \(admin \? String\(rec\.employee_id \|\| ''\) : me\.id\);/.test(server), 'le salarié crée toujours pour LUI (l\'identifiant vient de la session)');
ok(!/ADMIN_ONLY_WRITE: string\[\] = \[[^\]]*leaves/.test(server), 'les congés ne sont pas dans la liste admin seulement (un salarié doit pouvoir demander)');
ok(/await step\('leaves', async \(\) => \{ await sb\.from\(T\.leaves\)\.delete\(\)\.eq\('data->>employee_id', uid\); \}\);/.test(server), 'supprimer un compte efface ses congés');
ok(!/col === 'leaves'[^\n]*\n[^\n]*ok = true/.test(server), 'aucune ouverture de suppression de congé pour un salarié (le chemin générique refuse)');
const mig = read('supabase/migrations/20261023_create_df_leaves.sql');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_leaves from anon, authenticated/.test(mig) && /drop table public\.df_leaves/.test(mig), 'migration : RLS, aucun accès public, retour en arrière écrit');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
