// Contrôle des notifications externes, partie 2a : textes, catégories, interrupteurs et événements. Site = serveur. Sans réseau.
// Lancer : npm run check:push-events
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { cleanPushOff, notifyCat, notifyText, PUSH_CATS, type NotifyKind } from '../src/utils/pushEvents';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const src = read('supabase/functions/df-api/index.ts');
const m = /\/\/ ===== BEGIN NOTIFY[^\n]*\n([\s\S]*?)\/\/ ===== END NOTIFY =====/.exec(src);
ok(!!m, 'bloc « NOTIFY » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { notifyText, notifyCat, cleanPushOff, PUSH_CATS };`)() as any;

const kinds: NotifyKind[] = ['val_start', 'val_end', 'advance_new', 'advance_ok', 'advance_no', 'signup', 'reset', 'profile', 'security', 'message'];
const ctxs = [{ name: 'Rina', client: 'Acme', reason: 'Plafond atteint', group: false }, { name: 'Rina', group: true }, {}, { name: 'x'.repeat(200), client: 'y'.repeat(200), reason: 'z'.repeat(300) }, { name: 'Ligne\nsuivante\u0007', client: 'A\tB' }];
for (const k of kinds) for (const [i, c] of ctxs.entries()) ok(J(notifyText(k, c)) === J(srv.notifyText(k, c)), `site = serveur : ${k} (cas ${i + 1})`);
for (const k of kinds) ok(notifyCat(k) === srv.notifyCat(k), `catégorie site = serveur : ${k}`);
ok(J(PUSH_CATS) === J(srv.PUSH_CATS), 'liste des catégories : site = serveur');
const offs: unknown[] = [undefined, null, 'x', ['messages', 'messages', 'inconnue', 5, null, 'security'], [], ['missions']];
for (const [i, o] of offs.entries()) ok(J(cleanPushOff(o)) === J(srv.cleanPushOff(o)), `interrupteurs site = serveur (cas ${i + 1})`);
ok(J(cleanPushOff(['messages', 'messages', 'inconnue', 5, null, 'security'])) === J(['messages', 'security']), 'interrupteurs : catégories inconnues et doublons jetés');

// Confidentialité : jamais de montant ni de texte de message sur l'écran verrouillé
const all = kinds.flatMap(k => { const t = notifyText(k, { name: 'Rina', client: 'Acme', group: false }); return [t.fr.title, t.fr.body, t.en.title, t.en.body]; });
ok(!all.some(x => /\d\s?(Ar|MGA)|\d{4,}/.test(x)), 'confidentialité : aucun montant dans un push');
ok(notifyText('message', { name: 'Rina' }).fr.body === 'Nouveau message' && notifyText('message', { name: 'Rina' }).en.body === 'New message', 'confidentialité : le texte d\'un message n\'est jamais envoyé');
ok(notifyText('advance_new', { name: 'Rina' }).fr.body === 'Rina', 'confidentialité : une nouvelle avance ne montre pas le montant');
ok(notifyText('advance_no', { reason: '' }).fr.body.includes('refusée') && notifyText('advance_no', { reason: 'Plafond' }).fr.body === 'Motif : Plafond', 'avance refusée : le motif donné à l\'employé est repris');
ok(notifyText('message', { name: 'Rina', group: true }).fr.title === 'Rina · groupe', 'message de groupe : le titre dit « groupe »');
ok(kinds.every(k => { const t = notifyText(k, { name: 'A' }); return t.fr.title && t.en.title && t.fr.body && t.en.body && !/[àâçéèêëîïôùûœ]/i.test(t.en.title + t.en.body); }), 'textes FR et EN présents, anglais sans accent français');

// Événements du serveur (lecture du code)
const has = (re: RegExp, msg: string) => ok(re.test(src), msg);
has(/col === 'posts' && !admin && toSave && \(toSave\.status === 'pending_start' \|\| toSave\.status === 'pending_end'\) && \(!existing \|\| existing\.status !== toSave\.status\)/, 'serveur : début ou fin envoyé par l\'employé → les responsables (une seule fois par changement de statut)');
has(/\{ go: 'validations', filter: toSave\.status === 'pending_start' \? 'starts' : 'ends', nav: `val-post-\$\{rec\.id\}` \}/, 'serveur : lien exact vers la mission à valider (comme la cloche)');
has(/!existing && !admin && toSave\.status === 'pending'\) pushJobs\.push\(pushAdmins\('validations', notifyText\('advance_new'/, 'serveur : nouvelle demande d\'avance → les responsables');
has(/\{ go: 'validations', filter: 'advances', nav: `val-adv-\$\{rec\.id\}` \}/, 'serveur : lien exact vers l\'avance à valider');
has(/existing\.status === 'pending' && \(toSave\.status === 'approved' \|\| toSave\.status === 'rejected'\)/, 'serveur : réponse à une avance → l\'employé (une seule fois)');
has(/\{ go: 'advances', nav: `adv-\$\{rec\.id\}` \}, 'advances'/, 'serveur : l\'employé arrive sur son avance (catégorie « avances »)');
has(/col === 'securityLogs' && !existing && toSave\) pushJobs\.push\(pushAdmins\('security'/, 'serveur : alerte de sécurité → les responsables');
has(/col === 'messages' && !existing && toSave && toSave\.sender_id\) pushJobs\.push\(pushMessage\(toSave\)\)/, 'serveur : message reçu → ses destinataires (une seule fois)');
has(/\{ go: 'chat', thread: group \? 'all' : String\(m\.sender_id\) \}, 'messages'/, 'serveur : le clic ouvre la bonne discussion');
has(/pushAdmins\('validations', notifyText\('signup'[\s\S]{0,200}filter: 'signups', nav: `val-sig-\$\{id\}`/, 'serveur : inscription → les responsables, lien exact');
has(/pushAdmins\('validations', notifyText\('reset'[\s\S]{0,200}filter: 'resets', nav: `val-rst-\$\{id\}`/, 'serveur : mot de passe oublié → les responsables, lien exact');
has(/pushAdmins\('validations', notifyText\('profile'[\s\S]{0,200}filter: 'profiles', nav: `val-prf-\$\{id\}`/, 'serveur : changement de profil → les responsables, lien exact');
has(/filter\(r => !\(cat && Array\.isArray\(r\.data\?\.off\) && r\.data\.off\.includes\(cat\)\)\)/, 'serveur : une catégorie coupée sur un appareil n\'y arrive pas');
has(/action === "push-prefs" && req\.method === "POST"/, 'serveur : route des interrupteurs');
has(/\(row as any\)\.data\?\.user_id !== me\.id\) return res\.status\(404\)/, 'serveur : on ne règle que ses propres appareils');
has(/se réabonner ne remet pas les interrupteurs à zéro/, 'serveur : se réabonner garde les interrupteurs');
ok((src.match(/, 'missions'\)/g) || []).length >= 3, 'serveur : les push de missions existants sont dans la catégorie « missions »');
ok(/pushPrefs\(ep\)/.test(read('src/components/NotificationsCard.tsx')) && /type="checkbox"/.test(read('src/components/NotificationsCard.tsx')), 'écran : un interrupteur par catégorie dans Réglages > Notifications');
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
