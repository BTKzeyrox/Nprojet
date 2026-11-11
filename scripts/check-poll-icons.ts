// Sondages : de vraies icônes, plus d'emoji. Lancer : npm run check:poll-icons
import { readFileSync } from 'node:fs';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('ÉCHEC :', m); } else console.log('ok :', m); };
const files = ['src/components/PollBlock.tsx', 'src/components/ChatPoll.tsx', 'src/components/ComposerExtras.tsx'];
const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
for (const f of files) ok(!emoji.test(readFileSync(f, 'utf8')), `${f} : aucun emoji ni symbole ★`);
const chat = readFileSync(files[1], 'utf8'), blk = readFileSync(files[0], 'utf8');
ok(/CalendarDays/.test(chat) && /Eye/.test(chat) && /BarChart3/.test(chat) && /data-poll-kind-icon/.test(chat), 'chat : icône du type de sondage (date, J\'ai lu, sondage)');
ok(/<Star /.test(blk) && /data-date-best/.test(blk), 'date la plus choisie : icône étoile');
console.log(bad ? `${bad} ÉCHEC(S)` : 'tout est bon'); process.exit(bad ? 1 : 0);
