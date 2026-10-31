// Réglage « Inscriptions ouvertes / fermées » : le serveur refuse une nouvelle demande seulement si l'admin a mis `signup_open` à false.
import { readFileSync } from 'node:fs';
let ok = 0, bad = 0;
const t = (c: boolean, m: string) => { if (c) ok++; else { bad++; console.log('ÉCHEC :', m); } };
const api = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const fn = api.slice(api.indexOf('async function signup(req'), api.indexOf('async function signupDecision'));
t(/signup_open === false\) return res\.status\(403\)/.test(fn), 'le serveur refuse (403) quand signup_open vaut false');
t(!/signup_open !== true|!signup_open|!stSignup\?\.data\?\.signup_open/.test(fn), 'réglage absent = inscriptions ouvertes (jamais fermées par défaut)');
t(fn.indexOf('signup_open') < fn.indexOf('sleep(400)') , 'la fermeture est testée avant tout le reste (aucune écriture)');
t(!/SIGNUPS\)\.upsert/.test(fn.slice(0, fn.indexOf('signup_open'))), 'aucune écriture avant le test de fermeture');
const ui = readFileSync('src/components/SignupSettings.tsx', 'utf8');
t(/signup_open !== false/.test(ui) && /updateSettings\(\{ signup_open: v \}\)/.test(ui), "l'écran lit « ouvert sauf si false » et écrit signup_open");
t(/Fermer les inscriptions/.test(ui) && /Ouvrir les inscriptions/.test(ui) && /Close sign-ups/.test(ui), 'boutons en français et en anglais');
const login = readFileSync('src/views/LoginView.tsx', 'utf8');
t(/Créer un compte/.test(login), 'le bouton « Créer un compte » reste visible sur la page de connexion');
// ----- Route publique « signup-info » : le formulaire d'inscription cache Jour / Nuit selon le mode des horaires -----
const info = api.slice(api.indexOf('async function signupInfo('), api.indexOf('async function signup(req'));
const route = api.indexOf('action === "signup-info" && req.method === "GET"');
t(route > 0 && route < api.indexOf('const me = await authenticate(req);', api.indexOf('Deno.serve(')), 'signup-info : route en lecture seule (GET), avant la connexion (publique)');
t(/cleanShiftMode\(st\.shift_mode\)/.test(info) && /res\.json\(\{ shift_mode: [^}]*\}\)/.test(info), 'signup-info : ne renvoie que le mode des horaires');
t(!/\.(upsert|insert|update|delete)\(/.test(info) && !/users|credentials|password|signups|SIGNUPS|T\./.test(info.replace(/getSettings/, '')), 'signup-info : aucune écriture, aucune donnée de personne');
const st = readFileSync('src/db/store.ts', 'utf8');
const gi = st.slice(st.indexOf('public async getSignupInfo('), st.indexOf('public getSignupRequests('));
t(/apiRaw\('signup-info'\)/.test(gi) && /catch \{ return \{ shift_mode: 'both' \}; \}/.test(gi) && /r\.ok \? cleanShiftMode\(r\.data\?\.shift_mode\) : 'both'/.test(gi), 'client : sans réponse ou en erreur, le mode reste « les deux » (Jour / Nuit toujours proposé comme avant)');
t(/showShift\(\{ shift_mode: sgMode \}\) && <div data-testid="signup-shift">/.test(login) && /shift: effShift\(sgShift, sgMode\)/.test(login) && /useState<ShiftMode \| null>\(null\)/.test(login), 'formulaire : Jour / Nuit seulement en mode « jour et nuit » (ou mode inconnu) ; la vacation envoyée suit le mode');
import { showShift, effShift, cleanShiftMode } from '../src/utils/shiftMode';
for (const [mode, shown, sent] of [['both', true, 'night'], [null, true, 'night'], ['normal', false, 'day'], ['day', false, 'day'], ['night', false, 'night']] as const) {
  t(showShift({ shift_mode: mode }) === shown, `mode ${mode} : sélecteur ${shown ? 'visible' : 'caché'}`);
  t(effShift('night', mode) === sent, `mode ${mode} : une personne qui avait choisi « nuit » est envoyée en « ${sent} »`);
}
t(['both', 'normal', 'day', 'night'].every(m => cleanShiftMode(m) === m) && cleanShiftMode('n\'importe quoi') === 'both' && cleanShiftMode(undefined) === 'both', 'mode inconnu ou absent : « les deux »');
console.log(`${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
