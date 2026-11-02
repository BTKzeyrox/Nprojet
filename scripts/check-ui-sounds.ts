// Contrôle : sons de l'appli (envoyer, J'adore, publication envoyée) + notification externe de secours. Lancer : npm run check:ui-sounds
import { readFileSync } from 'node:fs';
import { UI_SOUNDS } from '../src/utils/notifSound';
let f = 0, t = 0;
const ok = (c: boolean, n: string) => { t++; if (!c) { f++; console.log('ECHEC ' + n); } };
const chat = readFileSync('src/components/ChatView.tsx', 'utf8'), feed = readFileSync('src/views/FeedView.tsx', 'utf8'), sw = readFileSync('public/sw.js', 'utf8'), snd = readFileSync('src/utils/notifSound.ts', 'utf8');
ok(['send', 'like', 'published'].every(k => (UI_SOUNDS as any)[k].notes.length >= 2), 'trois sons différents définis');
ok(new Set(Object.values(UI_SOUNDS).map(s => JSON.stringify(s.notes))).size === 3, 'les trois sons ne sont pas identiques');
ok(Object.values(UI_SOUNDS).every(s => s.amp > 0 && s.amp <= 0.2), 'volume doux (jamais fort)');
ok(/if \(!getSoundPrefs\(\)\.on\) return false/.test(snd), 'le réglage « son » coupe aussi ces sons');
ok(/playUiSound\('send'\);\s*db\.sendMessage/.test(chat), 'messagerie : son à l\'envoi (après le contrôle anti double-appui)');
ok(/if \(!loved\) playUiSound\('like'\)/.test(feed), 'J\'adore : son seulement quand on aime (pas quand on retire)');
ok(/playUiSound\('published'\);\s*setTitle/.test(feed), 'publication envoyée : son après succès seulement');
ok(/handlePush\(d\)\.catch\(\(\) => self\.registration\.showNotification/.test(sw), 'notification externe : repli si le traitement plante');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
