// Messagerie : le sondage est une carte SANS bulle, avec contour et ombre, de taille fixe (BTK 2026-11-09). Contrôle du code (la mesure avant / après clic est faite en navigateur, voir TODO).
import { readFileSync } from 'node:fs';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('ÉCHEC :', m); } else console.log('ok :', m); };
const view = readFileSync('src/components/ChatView.tsx', 'utf8'), card = readFileSync('src/components/ChatPoll.tsx', 'utf8'), blk = readFileSync('src/components/PollBlock.tsx', 'utf8');
ok(/\(msg\.poll && !msg\.reply_to\)\) return \{ WebkitTouchCallout: 'none' \}/.test(view), 'sondage : pas de couleur de bulle (comme une photo envoyée seule)');
ok(/!gone && \(\(!msg\.message && !msg\.reply_to && msg\.attachment_url\) \|\| \(msg\.poll && !msg\.reply_to\)\)\s*\?/.test(view), 'sondage : pas de marge ni de fond de bulle');
ok(/data-chat-poll=\{msg\.id\} className=\{`[^`]*w-72 max-w-full rounded-2xl border p-3/.test(card) && /shadow-\[0_4px_16px/.test(card) && /shadow-\[0_4px_18px/.test(card), 'carte : largeur fixe (18 rem, jamais plus large que l\'écran), contour, ombre en clair et en sombre');
ok(/busy=\{false\} fixed users=/.test(card), 'carte : mode « taille fixe » du sondage');
ok(/fixed\?: boolean/.test(blk) && /fixed \? 'space-y-2'/.test(blk), 'mode fixe : pas de second cadre dans la carte');
ok(/canVote && !fixed && <span>/.test(blk) && /flex-nowrap[^`]*min-h-\[32px\]/.test(blk), 'mode fixe : pas de texte d\'aide qui change, pied sur une seule ligne de hauteur réservée');
ok(/\(fixed \? 'Tu as lu' :/.test(blk) && /fixed \? <span className="sr-only">la plus choisie<\/span> :/.test(blk) && /invisible/.test(blk) && /fixed && !\(multi/.test(blk), 'mode fixe : textes courts, « Voir qui a voté » garde sa place même à 0 vote (rien ne saute)');
ok(/isAdmin && \(fixed \|\| \(multi \? readers > 0 : total > 0\)\)/.test(blk), 'mode fixe : le lien est toujours là pour l\'auteur');
console.log(`\n${bad ? bad + ' ÉCHEC(S)' : 'tout est bon'}`);
process.exit(bad ? 1 : 0);
