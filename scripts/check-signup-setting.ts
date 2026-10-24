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
console.log(`${ok}/${ok + bad}`);
process.exit(bad ? 1 : 0);
