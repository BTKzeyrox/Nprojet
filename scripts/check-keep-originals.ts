// Photos : toujours compressées dans le chat (plus de case « Compresser ») ; réglage admin « garder l'original », éteint au départ, jamais donné aux employés. Lancer : npm run check:keep-originals
import { readFileSync } from 'node:fs';
import { COMPANY_DEFAULTS, readCompany, cleanCompany, companyForEmployee } from '../src/utils/companyRules';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
ok(COMPANY_DEFAULTS.options.keep_originals === false && readCompany(undefined).options.keep_originals === false, 'éteint au départ (rien ne change, aucun coût)');
const on = cleanCompany({ options: { keep_originals: true } }, COMPANY_DEFAULTS);
ok(on.errors.length === 0 && on.value.options.keep_originals === true, 'l\'admin peut l\'allumer');
ok(cleanCompany({ options: { keep_originals: 'oui' } }, COMPANY_DEFAULTS).errors.length > 0, 'une valeur qui n\'est pas oui/non est refusée');
ok(!('keep_originals' in (companyForEmployee(on.value).options || {})), 'un employé ne reçoit jamais ce réglage');
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/keep_originals: \{ t: "bool" \}/.test(srv) && /keep_originals: false/.test(srv), 'le serveur connaît le réglage (sinon il l\'effacerait)');
ok(/key: 'keep_originals'/.test(readFileSync('src/components/CompanyConditions.tsx', 'utf8')), 'interrupteur présent dans Réglages > Conditions (page de l\'admin)');
const chat = readFileSync('src/components/ChatView.tsx', 'utf8');
ok(!/Compresser \{pendingFiles/.test(chat) && !/setCompress/.test(chat) && /isImage \? await compressProofImage\(file, 1600, 300 \* 1024\)/.test(chat), 'chat : plus de case « Compresser », les photos sont toujours compressées');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.'); process.exit(fails ? 1 : 0);
