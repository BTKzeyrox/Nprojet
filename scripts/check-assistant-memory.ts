// Mémoire de l'assistant (BTK, 2026-11-08) : comprendre « mémorise », enregistrer tel quel, relire, oublier avec confirmation, jamais de faux « C'est noté ».
import { readFileSync } from 'node:fs';
import { parseMemoryIntent, runMemory, searchNotes, notesForAi, cleanNote, MEM_MAX_NOTES, MEM_MAX_CHARS, AI_NOTES_MAX, MEM_FORGET_PREFIX, type MemApi, type MemNote } from '../src/utils/assistantMemory';
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('ÉCHEC :', m); } else console.log('ok :', m); };
const P = parseMemoryIntent;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

ok(eq(P('mémorise : la réunion est jeudi à 10 h'), { kind: 'save', text: 'la réunion est jeudi à 10 h' }), 'mémorise : phrase → enregistrée telle quelle');
ok(eq(P('Mémorise que Hugo est en congé lundi'), { kind: 'save', text: 'Hugo est en congé lundi' }), 'mémorise que … (majuscule, accents)');
ok(eq(P('retiens ceci: code du local = 4 rouges'), { kind: 'save', text: 'code du local = 4 rouges' }), 'retiens ceci : …');
ok(eq(P('note que le client Soleil paie en retard'), { kind: 'save', text: 'le client Soleil paie en retard' }), 'note que …');
ok(eq(P('Souviens-toi que je préfère les rapports le lundi'), { kind: 'save', text: 'je préfère les rapports le lundi' }), 'souviens-toi que …');
ok(eq(P('stp retiens : acheter du papier'), { kind: 'save', text: 'acheter du papier' }), 'politesse devant le verbe');
ok(eq(P('remember that the boss is away'), { kind: 'save', text: 'the boss is away' }), 'remember that … (anglais)');
ok(eq(P('mémorise'), { kind: 'save-ask' }) && eq(P('Mémorise !'.replace('!', '')), { kind: 'save-ask' }), '« mémorise » tout seul : il demande la phrase (cas de BTK)');
ok(P('note de frais du mois') === null && P('quelle est la note de Hugo ?') === null && P('résumé du jour') === null && P('enregistre le paiement') === null, 'une phrase ordinaire ou « note de frais » n\'est pas une mémoire');
ok(eq(P('qu\'est-ce que tu as retenu ?'), { kind: 'list' }) && eq(P('ma mémoire'), { kind: 'list' }) && eq(P('Mes notes'), { kind: 'list' }) && eq(P('what do you remember'), { kind: 'list' }), 'relire : « qu\'est-ce que tu as retenu ? », « ma mémoire », « mes notes »');
ok(eq(P('oublie la 2'), { kind: 'forget-n', n: 2 }) && eq(P('oublie 3'), { kind: 'forget-n', n: 3 }) && eq(P('efface la note 1'), { kind: 'forget-n', n: 1 }) && eq(P('forget 4'), { kind: 'forget-n', n: 4 }), 'oublier par numéro');
ok(eq(P('oublie : code du local'), { kind: 'forget-text', text: 'code du local' }) && eq(P('oublie que Hugo est en congé'), { kind: 'forget-text', text: 'hugo est en conge' }), 'oublier par texte');
ok(P('supprime la mission 12') === null && P('efface le client Soleil') === null, '« supprime / efface » ordinaire ne touche pas la mémoire');
ok(eq(P('modifie la 2 : réunion vendredi'), { kind: 'edit', n: 2, text: 'réunion vendredi' }) && eq(P('modifie 1 : a'), { kind: 'edit', n: 1, text: 'a' }), 'modifier une note par numéro');

ok(cleanNote('   ') === null && cleanNote('  a   b ') === 'a b' && (cleanNote('x'.repeat(900)) || '').length === MEM_MAX_CHARS, 'nettoyage : vide refusé, espaces nettoyés, 500 caractères au plus');

// faux serveur
const mk = (init: MemNote[] = [], opt: { down?: boolean; failSave?: boolean } = {}) => {
  const st = { notes: [...init], saved: 0, removed: [] as string[] };
  const api: MemApi = {
    fetch: async () => (opt.down ? null : [...st.notes].sort((a, b) => a.at - b.at)),
    save: async n => { if (opt.failSave) return { ok: false, error: 'boum' }; st.saved++; const old = n.id ? st.notes.find(x => x.id === n.id) : undefined; const note = { id: old?.id || `n${st.notes.length + 1}`, text: n.text, at: old?.at || st.notes.length + 1 }; st.notes = [...st.notes.filter(x => x.id !== note.id), note]; return { ok: true, note }; },
    remove: async id => { st.removed.push(id); st.notes = st.notes.filter(x => x.id !== id); return true; },
  };
  return { st, api };
};
const txt = (r: { title: { fr: string }; lines: { fr: string }[] }) => [r.title.fr, ...r.lines.map(l => l.fr)].join(' | ');
(async () => {
  let m = mk();
  let r = await runMemory({ kind: 'save', text: 'Réunion jeudi 10 h' }, m.api);
  ok(r.intent === 'memory_saved' && r.title.fr === 'C\'est noté' && m.st.notes.length === 1 && m.st.notes[0].text === 'Réunion jeudi 10 h', 'enregistre la phrase telle quelle puis répond « C\'est noté »');
  r = await runMemory({ kind: 'save', text: 'réunion JEUDI 10 h' }, m.api);
  ok(r.title.fr === 'Déjà noté' && m.st.notes.length === 1, 'même note deux fois = « Déjà noté », pas de doublon');
  const down = mk([], { down: true });
  r = await runMemory({ kind: 'save', text: 'x y' }, down.api);
  ok(r.intent === 'memory_error' && down.st.saved === 0 && !/C'est noté/.test(txt(r)), 'serveur injoignable : jamais de faux « C\'est noté »');
  const fail = mk([], { failSave: true });
  r = await runMemory({ kind: 'save', text: 'x y' }, fail.api);
  ok(r.intent === 'memory_error' && !/C'est noté/.test(txt(r)), 'enregistrement refusé : message d\'erreur, pas de « C\'est noté »');
  const full = mk(Array.from({ length: MEM_MAX_NOTES }, (_, i) => ({ id: `f${i}`, text: `note ${i}`, at: i })));
  r = await runMemory({ kind: 'save', text: 'une de plus' }, full.api);
  ok(r.intent === 'memory_error' && full.st.saved === 0, `mémoire pleine (${MEM_MAX_NOTES}) : refus clair, rien n'est écrasé`);
  r = await runMemory({ kind: 'save-ask' }, m.api);
  ok(r.intent === 'memory_ask', '« mémorise » seul : demande la phrase');

  m = mk([{ id: 'a', text: 'Réunion jeudi 10 h', at: 1 }, { id: 'b', text: 'Code du local : 4 rouges', at: 2 }, { id: 'c', text: 'Hugo en congé lundi', at: 3 }]);
  r = await runMemory({ kind: 'list' }, m.api);
  ok(r.lines.length === 3 && r.lines[0].fr.startsWith('1. ') && r.lines[2].fr === '3. Hugo en congé lundi' && r.actions.some(a => a.go.view === MEM_FORGET_PREFIX + 'b'), 'liste numérotée avec boutons Modifier / Oublier');
  r = await runMemory({ kind: 'list' }, mk().api);
  ok(r.intent === 'memory_list' && /vide/.test(r.title.fr), 'mémoire vide : le dit et explique quoi écrire');
  r = await runMemory({ kind: 'forget-n', n: 2 }, m.api);
  ok(r.intent === 'memory_confirm' && m.st.notes.length === 3 && m.st.removed.length === 0 && r.actions[0].go.view === MEM_FORGET_PREFIX + 'b', 'oublier : DEMANDE CONFIRMATION, rien n\'est supprimé avant');
  r = await runMemory({ kind: 'forget-n', n: 9 }, m.api);
  ok(r.intent === 'memory_error' && m.st.removed.length === 0, 'numéro inconnu : rien supprimé');
  r = await runMemory({ kind: 'forget-text', text: 'code local' }, m.api);
  ok(r.intent === 'memory_confirm' && /Code du local/.test(txt(r)) && m.st.removed.length === 0, 'oublier par texte : retrouve la note et demande confirmation');
  r = await runMemory({ kind: 'forget-text', text: 'zzzz inconnu' }, m.api);
  ok(r.intent === 'memory_error' && m.st.removed.length === 0, 'oublier un texte inconnu : rien supprimé');
  r = await runMemory({ kind: 'edit', n: 1, text: 'Réunion vendredi 9 h' }, m.api);
  ok(r.intent === 'memory_saved' && m.st.notes.find(x => x.id === 'a')?.text === 'Réunion vendredi 9 h' && m.st.notes.length === 3, 'modifier la note 1 : même note, nouveau texte');

  const notes: MemNote[] = [{ id: 'a', text: 'Réunion jeudi 10 h avec le client Soleil', at: 1 }, { id: 'b', text: 'Code du local : 4 rouges', at: 2 }];
  ok(searchNotes('quand est la réunion ?', notes).map(n => n.id).join() === 'a' && searchNotes('quel est le code ?', notes).map(n => n.id).join() === 'b' && searchNotes('combien de factures', notes).length === 0, 'recherche par mots-clés : trouve la bonne note, rien si rien ne ressemble');
  const long: MemNote[] = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, text: 'mot '.repeat(60) + i, at: i }));
  ok(notesForAi(long, 'fr').length <= AI_NOTES_MAX && notesForAi([], 'fr') === '', `notes envoyées à l'IA : ${AI_NOTES_MAX} caractères au plus, vide si aucune`);

  // branchement
  const chat = readFileSync('src/components/AssistantChat.tsx', 'utf8'), store = readFileSync('src/db/store.ts', 'utf8'), srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8'), set = readFileSync('src/components/AiSettingsSection.tsx', 'utf8'), ai = readFileSync('src/utils/aiAssist.ts', 'utf8');
  ok(/parseMemoryIntent\(q\)/.test(chat) && /pendingMem\.current/.test(chat) && /runMemory\(mi, memApi\)/.test(chat) && /!mi && reply\.intent === 'unknown'/.test(chat), 'assistant : la mémoire passe avant les règles ; « mémorise » seul garde la phrase du message suivant');
  ok(/MEM_FORGET_PREFIX\)\) \{ void db\.memDelete/.test(chat) && /MEM_EDIT_PREFIX\)\)/.test(chat), 'assistant : boutons Oublier (après confirmation) et Modifier branchés');
  ok(/aiMemOptIn\(userId\)/.test(chat) && /aiMemOptIn/.test(set) && /df_ai_mem_optin_/.test(ai) && /data-ai-memory-optin/.test(set), 'notes envoyées à l\'IA : seulement si la case de Réglages est cochée (coupée par défaut)');
  ok(/memFetch\(\)/.test(store) && /'assistant-memory-save'/.test(store) && /'assistant-memory-delete'/.test(store) && /if \(this\.demo\) return \[\.\.\.this\.demoMem\]/.test(store), 'store : lire / enregistrer / supprimer, démo dans le navigateur');
  ok(/action === "assistant-memory" && req\.method === "GET"/.test(srv) && /action === "assistant-memory-save"/.test(srv) && /action === "assistant-memory-delete"/.test(srv), 'serveur (df-api) : 3 routes dans le dépôt');
  const role = (srv.match(/async function mem(List|Save|Delete)Route[\s\S]{0,260}?me\.role !== 'admin'/g) || []).length;
  ok(role === 3, 'serveur : les 3 routes sont réservées au responsable');
  ok(/MEM_MAX_NOTES = 100;/.test(srv) && /MEM_MAX_CHARS = 500;/.test(srv) && MEM_MAX_NOTES === 100 && MEM_MAX_CHARS === 500, 'serveur et site : mêmes limites (100 notes, 500 caractères)');
  ok(/`mem:\$\{uid\}`/.test(srv) && !/from\(REMINDERS\)\.select\('data'\)\.eq\('data->>kind', 'mem'\)/.test(srv) && /eq\('data->>kind', 'item'\)/.test(srv), 'serveur : ligne `mem:<compte>` à part des rappels (les rappels ne lisent que kind = item)');
  console.log(`\n${bad ? bad + ' ÉCHEC(S)' : 'tout est bon'}`);
  process.exit(bad ? 1 : 0);
})();
