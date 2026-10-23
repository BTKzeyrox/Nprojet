// Contrôle des règles du dossier salarié (module 5, M5.1), sans réseau ni écran.
// Lancer : npm run check:hr
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { checkHrFile, seniorityMonths, seniorityText, endOfTermIn, currentRate, daysBetween } from '../src/utils/hrFile';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const good = {
  position: 'Agent de saisie', hire_date: '2025-03-10', contract_type: 'fixed', contract_end: '2026-12-31', trial_end: '2025-06-10',
  emergency: { name: 'Rakoto Jean', phone: '034 12 345 67', relation: 'Père' },
  documents: [{ id: 'd1', name: 'Contrat signé', url: 'https://example.com/contrat.pdf', added_at: '2025-03-10T08:00:00Z' }],
  rate_history: [{ id: 'r2', date: '2026-01-01', from_ar: 1000, to_ar: 1200, reason: 'Fin de période' }, { id: 'r1', date: '2025-03-10', to_ar: 1000 }],
};
const r = checkHrFile(good) as any;
ok(r.ok && r.hr.position === 'Agent de saisie' && r.hr.contract_type === 'fixed', 'dossier valide accepté');
ok(r.ok && r.hr.rate_history[0].id === 'r1' && r.hr.rate_history[1].id === 'r2', 'historique des tarifs trié par date');
ok(r.ok && r.hr.documents[0].added_at === '2025-03-10T08:00:00.000Z', 'date d\'ajout normalisée');
ok((checkHrFile(undefined) as any).hr === null && (checkHrFile(null) as any).hr === null && (checkHrFile('') as any).hr === null, 'vide ou absent = pas de dossier');
ok((checkHrFile({}) as any).hr === null && (checkHrFile({ position: '   ' }) as any).hr === null, 'dossier sans aucun champ rempli = pas de dossier');
ok((checkHrFile({ position: 'Chef', zzz: 'inconnu', is_admin: true }) as any).hr.zzz === undefined, 'champ inconnu ignoré');
ok((checkHrFile({ position: '<b>X</b>' }) as any).hr.position === 'bX/b', 'chevrons retirés des textes');
ok((checkHrFile({ position: 'x'.repeat(200) }) as any).hr.position.length === 80, 'texte coupé à 80');
const bad = (p: any, reason: string, name: string) => { const x = checkHrFile({ ...good, ...p }) as any; ok(!x.ok && x.reason === reason, name); };
bad({ hire_date: '2025-02-30' }, 'hire_date', 'date impossible refusée (30 février)');
bad({ hire_date: '10/03/2025' }, 'hire_date', 'date mal écrite refusée');
bad({ hire_date: '1980-01-01' }, 'hire_date', 'date avant 1990 refusée');
bad({ hire_date: 20250310 }, 'hire_date', 'date qui est un nombre refusée');
bad({ contract_type: 'esclave' }, 'contract_type', 'type de contrat inconnu refusé');
bad({ contract_type: ['fixed'] }, 'contract_type', 'type de contrat tableau refusé');
bad({ contract_end: '2025-01-01' }, 'contract_end', 'fin de contrat avant l\'embauche refusée');
bad({ trial_end: '2024-01-01' }, 'trial_end', 'fin d\'essai avant l\'embauche refusée');
bad({ emergency: 'papa' }, 'emergency', 'contact d\'urgence texte refusé');
bad({ emergency: { phone: '034 12 345 67' } }, 'emergency', 'numéro d\'urgence sans nom refusé');
bad({ emergency: { name: 'A', phone: 'abc' } }, 'emergency', 'numéro avec des lettres refusé');
bad({ documents: 'x' }, 'documents', 'documents non tableau refusé');
bad({ documents: Array.from({ length: 11 }, (_, i) => ({ id: 'd' + i, name: 'n', url: 'https://a.mg/x' })) }, 'documents', '11 documents refusés');
bad({ documents: [{ id: 'd1', name: 'x', url: 'http://a.mg/x' }] }, 'documents', 'lien http refusé (https seulement)');
bad({ documents: [{ id: 'd1', name: 'x', url: 'javascript:alert(1)' }] }, 'documents', 'lien javascript refusé');
bad({ documents: [{ id: 'd1', name: 'x', url: 'https://a.mg/x' }, { id: 'd1', name: 'y', url: 'https://a.mg/y' }] }, 'documents', 'identifiants de documents en double refusés');
bad({ documents: [{ id: 'd1', name: '', url: 'https://a.mg/x' }] }, 'documents', 'document sans nom refusé');
bad({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: -5 }] }, 'rate_history', 'tarif négatif refusé');
bad({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: [5] }] }, 'rate_history', 'tarif tableau refusé');
bad({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: true }] }, 'rate_history', 'tarif booléen refusé');
bad({ rate_history: [{ id: 'r', date: 'hier', to_ar: 5 }] }, 'rate_history', 'date de tarif fausse refusée');
bad({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: 5, from_ar: 'abc' }] }, 'rate_history', 'ancien tarif illisible refusé');
bad({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: 1e15 }] }, 'rate_history', 'tarif énorme refusé');
bad({ rate_history: Array.from({ length: 51 }, (_, i) => ({ id: 'r' + i, date: '2026-01-01', to_ar: 1 })) }, 'rate_history', '51 lignes de tarif refusées');
ok(!(checkHrFile([1, 2]) as any).ok && !(checkHrFile('texte') as any).ok && !(checkHrFile(42) as any).ok, 'dossier qui n\'est pas un objet refusé');
ok((checkHrFile({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: '1500.4' }] }) as any).hr.rate_history[0].to_ar === 1500, 'tarif texte arrondi');
ok((checkHrFile({ rate_history: [{ id: 'r', date: '2026-01-01', to_ar: 0 }] }) as any).ok, 'tarif 0 accepté');

// ancienneté
ok(seniorityMonths('2024-09-23', '2026-10-23') === 25, 'ancienneté 2 ans 1 mois');
ok(seniorityMonths('2026-10-23', '2026-10-23') === 0, 'arrivé aujourd\'hui = 0 mois');
ok(seniorityMonths('2026-09-24', '2026-10-23') === 0, 'jour du mois pas atteint = 0 mois');
ok(seniorityMonths('2026-09-23', '2026-10-23') === 1, 'exactement 1 mois');
ok(seniorityMonths('2024-02-29', '2026-02-28') === 23 && seniorityMonths('2024-02-29', '2026-03-01') === 24, 'embauche le 29 février');
ok(seniorityMonths('2027-01-01', '2026-10-23') === null, 'date d\'embauche future = null');
ok(seniorityMonths(undefined, '2026-10-23') === null && seniorityMonths('faux', '2026-10-23') === null, 'pas de date ou date fausse = null');
ok(seniorityText(25) === '2 ans et 1 mois' && seniorityText(24) === '2 ans' && seniorityText(5) === '5 mois' && seniorityText(0) === "moins d'un mois" && seniorityText(12) === '1 an', 'texte d\'ancienneté français');
ok(seniorityText(25, 'en') === '2 years and 1 month' && seniorityText(0, 'en') === 'less than a month' && seniorityText(13, 'en') === '1 year and 1 month', 'texte d\'ancienneté anglais');
ok(seniorityText(null) === '' && seniorityText(-1) === '' && seniorityText(NaN) === '', 'ancienneté illisible = texte vide');

// fin d'essai / contrat
ok(endOfTermIn(null, '2026-10-23') === null && endOfTermIn({}, '2026-10-23') === null, 'pas de dossier = rien à signaler');
ok(JSON.stringify(endOfTermIn({ trial_end: '2026-10-30', contract_end: '2026-12-01' }, '2026-10-23')) === '{"kind":"trial","days":7,"date":"2026-10-30"}', 'le plus proche gagne');
ok(endOfTermIn({ trial_end: '2026-10-23' }, '2026-10-23')?.days === 0, 'fin d\'essai aujourd\'hui = 0 jour');
ok(endOfTermIn({ trial_end: '2026-10-22' }, '2026-10-23') === null, 'fin d\'essai passée : pas signalée');
ok(endOfTermIn({ trial_end: '2026-10-22', contract_end: '2026-11-02' }, '2026-10-23')?.kind === 'contract', 'essai passé, contrat à venir : le contrat');
ok(daysBetween('2026-02-28', '2026-03-01') === 1 && daysBetween('2028-02-28', '2028-03-01') === 2 && daysBetween('x', '2026-03-01') === null, 'jours entre deux dates (bissextile)');
ok(currentRate({ rate_history: (r as any).hr.rate_history })?.id === 'r2' && currentRate(null) === null && currentRate({}) === null, 'dernier tarif connu');

// --- le serveur : même fonction, même résultat, mêmes protections ---
const read = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const server = read('supabase/functions/df-api/index.ts');
const site = read('src/utils/hrFile.ts');
const region = (t: string) => (/\/\/ BEGIN HRCLEAN\n([\s\S]*?)\/\/ END HRCLEAN\n/.exec(t) || [])[1] || '';
ok(region(site).length > 500 && region(site) === region(server), 'la fonction du serveur est la copie exacte de celle du site');
const hrBlock = /\/\/ ===== BEGIN HR [^\n]*\n([\s\S]*?)\/\/ ===== END HR =====/.exec(server);
ok(!!hrBlock, 'bloc HR trouvé dans le serveur');
const serverClean = new Function(transformSync(hrBlock![1], { loader: 'ts' }).code + '\nreturn cleanHrFile;')() as (r: any) => any;
const samples: any[] = [good, {}, null, undefined, '', [], 'x', 42, { ...good, hire_date: '2025-02-30' }, { ...good, contract_type: 'zz' }, { ...good, emergency: { phone: '034' } },
  { ...good, documents: [{ id: 'a', name: 'n', url: 'http://x.mg' }] }, { ...good, rate_history: [{ id: 'r', date: '2026-01-01', to_ar: -1 }] }, { position: '<i>x</i>' },
  { rate_history: [{ id: 'r', date: '2026-01-01', to_ar: '1500.6', from_ar: '10' }] }, { contract_end: '2030-01-01', hire_date: '2031-01-01' }];
ok(samples.every(x => JSON.stringify(serverClean(x)) === JSON.stringify(checkHrFile(x))), `site et serveur donnent le même résultat sur ${samples.length} dossiers`);
ok(/hr: undefined \}\); \/\/ `hr`/.test(server) && /const stripUser = \(u: any, me: any\) => \(me\.role === 'admin' \|\| u\.id === me\.id \? u :/.test(server), 'le dossier est retiré pour tout compte autre que l\'admin et le salarié concerné');
ok(/if \(admin && col === 'users'\) \{[\s\S]{0,400}cleanHrFile\(sentHr\)/.test(server), 'chaque écriture de l\'admin sur un compte revérifie le dossier');
ok(server.includes('const sentHr = (rec as any).hr === undefined ? existing?.hr : (rec as any).hr;'), "un site qui n'envoie pas le dossier ne l'efface pas");
ok(/for \(const k of \['is_online', 'pending_advance_ar'\]\) if \(k in rec\) toSave\[k\] = rec\[k\];/.test(server), 'un opérateur ne peut écrire que ses 2 champs : jamais son dossier');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
