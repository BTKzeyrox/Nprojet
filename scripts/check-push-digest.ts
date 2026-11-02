// Contrôle des notifications externes groupées et du nouveau son (demande de BTK, 2026-11-01). Lancer : npm run check:push-digest
import { readFileSync } from 'node:fs';
import { digestPlan, DIGEST_TAG } from '../src/utils/pushDigest';
import { CHIME_NOTES, chimeCount, MAX_CHIMES } from '../src/utils/notifSound';

let fails = 0, total = 0;
const eq = (got: unknown, want: unknown, name: string) => { total++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(!!c, true, name);

const sw = readFileSync('public/sw.js', 'utf8');
const blk = sw.match(/\/\/ ===== BEGIN DIGEST[^\n]*\n([\s\S]*?)\/\/ ===== END DIGEST =====/);
if (!blk) throw new Error('bloc DIGEST introuvable dans public/sw.js');
const swPlan = new Function(blk[1] + '\nreturn digestPlan;')() as typeof digestPlan;
const M = { title: 'Mission à valider', body: 'Opérateur 1 attend ta validation.' };

for (const [name, plan] of [['site', digestPlan], ['service worker', swPlan]] as const) {
  const one = plan(1, M, false, '/?go=validations');
  eq([one.title, one.body, one.silent, one.url], ['Mission à valider', 'Opérateur 1 attend ta validation.', false, '/?go=validations'], `${name} : 1 notification = son + message + lien exact`);
  const two = plan(2, M, false, '/?go=validations');
  eq([two.title, two.body, two.silent, two.url], ['Gestion Pro', 'Vous avez 2 notifications', true, '/'], `${name} : 2 notifications = « Vous avez 2 notifications », sans nouveau son, ouvre l'appli`);
  eq(plan(7, M, false, '/x').body, 'Vous avez 7 notifications', `${name} : 7 notifications`);
  eq(plan(3, M, true, '/x').body, 'You have 3 notifications', `${name} : anglais`);
  eq(plan(1, {}, false, '/').title, 'Gestion Pro', `${name} : sans titre → Gestion Pro`);
  eq([plan(0, M, false, '/').count, plan(NaN as any, M, false, '/').count, plan(-4, M, false, '/').count], [1, 1, 1], `${name} : nombre absurde → 1`);
  eq(plan(1, M, false, '//evil.example').url, '/', `${name} : lien vers un autre site refusé`);
  eq(plan(1, M, false, 'https://evil.example').url, '/', `${name} : adresse complète refusée`);
  eq(plan(4, M, false, '/a').tag, DIGEST_TAG, `${name} : même repère → UNE seule notification qui se met à jour`);
  // Un seul son : seule la première est sonore
  const sounds = [1, 2, 3, 4, 5].map(n => plan(n, M, false, '/a').silent);
  eq(sounds, [false, true, true, true, true], `${name} : un seul son sur 5 notifications`);
}
// Le site et le service worker disent la même chose
for (const n of [1, 2, 3, 10]) for (const en of [false, true]) eq(swPlan(n, M, en, '/?go=chat'), digestPlan(n, M, en, '/?go=chat'), `copie identique pour ${n} notification(s), ${en ? 'EN' : 'FR'}`);

// Service worker : appli ouverte = pas de bandeau ; sinon notification groupée
ok(/getNotifications\(\{ tag: DIGEST_TAG \}\)/.test(sw), 'sw : compte les notifications déjà là');
ok(!/visibilityState/.test(sw) && !/gp-fg/.test(sw), 'sw : la notification externe s\'affiche TOUJOURS (appli ouverte ou fermée)');
ok(/silent: p\.silent, tag: p\.tag, renotify: false/.test(sw), 'sw : mise à jour sans bruit (silent + renotify faux)');
ok(/e\.waitUntil\(handlePush\(d\)/.test(sw), 'sw : le travail se fait dans waitUntil');
ok(/notificationclick/.test(sw) && /e\.notification\.close\(\)/.test(sw), 'sw : toucher la notification la ferme (le compte repart de zéro)');
const app = readFileSync('src/App.tsx', 'utf8');
ok(/closeDigestNotifications\(\)/.test(app) && /visibilitychange/.test(app), 'appli : ouverte → les notifications externes en attente sont retirées');

// Nouveau son
const snd = readFileSync('src/utils/notifSound.ts', 'utf8');
eq(CHIME_NOTES.length, 3, 'nouveau son : 3 notes');
ok(!/\[880, 1175\]/.test(snd) && !/Bip court \(2 notes\)/.test(snd), 'ancien bip à 2 notes (880 / 1175 Hz) retiré');
ok(CHIME_NOTES.every((f, i, a) => i === 0 || f > a[i - 1]), 'nouveau son : notes montantes');
eq([chimeCount(1), chimeCount(2), chimeCount(3), chimeCount(9), chimeCount(0), chimeCount(-2), chimeCount(NaN)], [1, 2, 3, MAX_CHIMES, 0, 0, 0], 'son : un par nouvelle notification, jamais plus de 3 d\'affilée');
const top = readFileSync('src/components/TopBar.tsx', 'utf8');
ok(/beepIfEnabled\(fresh\)/.test(top), 'barre du haut : le son est joué pour CHAQUE nouvelle notification');

console.log(fails ? `${fails} ÉCHEC(S) sur ${total}` : `${total}/${total} contrôles réussis`);
process.exit(fails ? 1 : 0);
