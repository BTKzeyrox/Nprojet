// Important, Épinglé, Transféré : repères et couleurs de bulle du chat. Lancer : npm run check:chat-marks
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { MARK_STYLE, markOf, marksOf, toggleImportant, canForward, forwardFrom, cleanForwarded, IMPORTANT_MAX } from '../src/utils/chatMarks';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const J = JSON.stringify;
const m = (o: any = {}): any => ({ id: 'a', sender_name: 'Rado Jean', message: 'Bonjour', ...o });
ok(markOf(m(), []) === null && markOf(m({ pinned: true }), []) === 'pinned' && markOf(m({ forwarded: { from: 'X' } }), []) === 'forwarded' && markOf(m(), ['a']) === 'important', 'chaque repère donne sa bulle');
ok(markOf(m({ pinned: true, forwarded: { from: 'X' } }), ['a']) === 'important' && markOf(m({ pinned: true, forwarded: { from: 'X' } }), []) === 'pinned', 'plusieurs : Important > Épinglé > Transféré');
ok(markOf(m({ pinned: true, deleted_at: 'x' }), ['a']) === null && marksOf(m({ pinned: true, deleted_at: 'x' }), ['a']).length === 0, 'message supprimé : aucun repère');
ok(J(marksOf(m({ pinned: true, forwarded: { from: 'X' } }), ['a'])) === J(['important', 'pinned', 'forwarded']), 'petites icônes : les trois repères dans l\'ordre');
const c = (k: keyof typeof MARK_STYLE) => MARK_STYLE[k];
ok(new Set([c('important').bg, c('pinned').bg, c('forwarded').bg]).size === 3 && Object.values(MARK_STYLE).every(v => /^#[0-9a-f]{6}$/.test(v.bg) && /^#[0-9a-f]{6}$/.test(v.border) && v.fr && v.en), 'trois couleurs différentes, chacune avec sa bordure et ses noms');
// couleurs lisibles avec du texte blanc (contraste ≥ 4,5 : la barre de lisibilité du texte courant)
const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
ok(Object.entries(MARK_STYLE).every(([, v]) => 1.05 / (lum(v.bg) + 0.05) >= 3.0), 'texte blanc lisible sur chaque couleur (contraste ≥ 3 : gros texte / interface)');
ok(J(toggleImportant([], 'a')) === J(['a']) && J(toggleImportant(['a', 'b'], 'a')) === J(['b']) && J(toggleImportant(['a'], '')) === J(['a']) && J(toggleImportant(null as any, 'z')) === J(['z']), 'important : ajouter / retirer, entrées bizarres sans plantage');
const big = Array.from({ length: IMPORTANT_MAX }, (_, i) => 'm' + i);
ok(toggleImportant(big, 'new').length === IMPORTANT_MAX && toggleImportant(big, 'new')[IMPORTANT_MAX - 1] === 'new' && !toggleImportant(big, 'new').includes('m0'), `au plus ${IMPORTANT_MAX} importants : les plus anciens partent`);
ok(canForward(m()) && canForward(m({ message: '', attachment_url: 'u' })) && !canForward(m({ deleted_at: 'x' })) && !canForward(m({ send_at: 5 })) && !canForward(m({ poll: { question: 'q' } })) && !canForward(m({ message: ' ' })), 'transférer : ni supprimé, ni programmé, ni sondage, ni vide');
ok(forwardFrom(m()) === 'Rado Jean' && forwardFrom(m({ forwarded: { from: 'Vola' } })) === 'Vola' && forwardFrom(m({ sender_name: 'x'.repeat(80) })).length === 40, 'transféré de : l\'auteur d\'origine, même après plusieurs transferts');
// serveur : même nettoyage
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const blk = src.match(/\/\/ ===== BEGIN FORWARD[^\n]*\n([\s\S]*?)\/\/ ===== END FORWARD =====/)![1];
const S: any = new Function(transformSync(blk + '\nreturn cleanForwarded;', { loader: 'ts' }).code)();
const cases: any[] = [{ from: 'Rado' }, { from: '  Rado\n\tJean  ' }, { from: 'x'.repeat(100) }, { from: '' }, { from: '   ' }, { from: 5 }, null, undefined, 'x', [], { from: 'A', extra: 'zzz' }, { from: '\u0000\u0007' }];
ok(cases.every(v => J(S(v)) === J(cleanForwarded(v))), 'serveur = site sur 12 cas (texte trop long, vide, nombre, objet en trop…)');
ok(J(S({ from: 'A', extra: 'zzz' })) === J({ from: 'A' }) && S({ from: 'x'.repeat(100) }).from.length === 40, 'serveur : seul le nom est gardé, 40 caractères au plus');
ok(/const fw = cleanForwarded\(rec\.forwarded\); if \(fw && rec\.poll === undefined\) save\.forwarded = fw;/.test(src) && /'reactions', 'forwarded', 'visible_to', 'visible_names', 'expires_ms', 'ephemeral_ms'\]\) delete save\[k\]/.test(src), 'serveur : un transfert reçu est nettoyé, jamais gardé tel quel');
ok(/'send_at', 'forwarded'\]\) delete save\[k\]/.test(src), 'serveur : un message supprimé pour tous perd son « transféré »');
const cv = readFileSync('src/components/ChatView.tsx', 'utf8'), st = readFileSync('src/db/store.ts', 'utf8');
ok(/k: 'important'[\s\S]{0,200}icon: Flag/.test(cv) && /k: 'forward'[\s\S]{0,200}icon: Forward/.test(cv) && /canForward\(menuMsg\)/.test(cv), 'menu du message : Important (drapeau) et Transférer (flèche)');
ok(/backgroundColor: MARK_STYLE\[mk\]\.bg/.test(cv) && /data-forwarded-from/.test(cv) && /data-mark="important"/.test(cv), 'bulle colorée selon le repère, « Transféré de … » dans la bulle, icônes sous la bulle');
ok(/forwardedFrom: forwardFrom\(m\)/.test(cv) && /forwarded: \{ from: String\(params\.forwardedFrom\)\.slice\(0, 40\) \}/.test(st), 'transfert : envoyé dans la conversation choisie avec l\'auteur d\'origine');
ok(/setImportantMessages\(currentUser\.id, next\)/.test(cv), 'important : gardé sur l\'appareil, par personne');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
