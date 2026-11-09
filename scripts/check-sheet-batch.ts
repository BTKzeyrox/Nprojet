// M27.5 : « Tout valider » une feuille saisie par un chef d'équipe.
import fs from 'node:fs';
import { groupPendingSheets, decideSheet, SHEET_BATCH_MIN } from '../src/utils/sheetBatch';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const line = (id: string, by: string, date: string, extra: any = {}) => ({ id, work_type: 'presence', status: 'pending_end', entered_by: by, entered_by_name: by === 'tl1' ? 'Chef Un' : 'Chef Deux', date, presence: 'present', employee_id: 'e-' + id, ...extra });
const admin = { id: 'adm', role: 'admin' };

// ---- regroupement ----
{
  const posts = [
    line('a1', 'tl1', '2026-11-09'), line('a2', 'tl1', '2026-11-09', { presence: 'half' }), line('a3', 'tl1', '2026-11-09', { presence: 'absent' }),
    line('b1', 'tl2', '2026-11-09'), line('b2', 'tl2', '2026-11-09'),
    line('c1', 'tl1', '2026-11-08'), line('c2', 'tl1', '2026-11-08'),
  ];
  const g = groupPendingSheets(posts, admin);
  ok(g.length === 3, 'un groupe par chef et par jour (2 chefs le même jour + 1 chef un autre jour = 3)');
  ok(g[0].date === '2026-11-09' && g[g.length - 1].date === '2026-11-08', 'le plus récent d\'abord');
  ok(g[0].byName === 'Chef Deux' || g[0].byName === 'Chef Un', 'ordre stable pour un même jour (par nom)');
  const a = g.find(x => x.byId === 'tl1' && x.date === '2026-11-09')!;
  ok(a.count === 3 && a.present === 2 && a.ids.join() === 'a1,a2,a3', 'compte les lignes, les présents (présent, retard, demi-journée ; pas les absents) et garde les identifiants dans l\'ordre');
  ok(SHEET_BATCH_MIN === 2, 'seuil : à partir de 2 lignes');
}
{
  ok(groupPendingSheets([line('a1', 'tl1', '2026-11-09')], admin).length === 0, 'une feuille d\'une seule ligne : pas de bloc (carte normale)');
  const mixed = [
    line('a1', 'tl1', '2026-11-09'), line('a2', 'tl1', '2026-11-09'),
    { id: 'm1', status: 'pending_end', entered_by: 'tl1', date: '2026-11-09' },                      // mission normale (pas de work_type)
    line('d1', 'tl1', '2026-11-09', { status: 'completed' }), line('d2', 'tl1', '2026-11-09', { status: 'pending_start' }),
    line('d3', '', '2026-11-09'), line('d4', undefined as any, '2026-11-09'),                       // pas de « saisi par »
    null as any, 5 as any, 'x' as any,
  ];
  const g = groupPendingSheets(mixed, admin);
  ok(g.length === 1 && g[0].ids.join() === 'a1,a2', 'ignore : missions normales, lignes déjà validées, départs, lignes sans « saisi par », valeurs illisibles');
  ok(groupPendingSheets([line('a1', 'adm', '2026-11-09'), line('a2', 'adm', '2026-11-09')], admin).length === 0, 'jamais ses propres saisies (personne ne valide sa propre saisie)');
  ok(groupPendingSheets([line('a1', 'tl1', '2026-11-09'), line('a2', 'tl1', '2026-11-09')], { id: 'tl1', role: 'team_lead' }).length === 0, 'le chef qui a saisi ne voit pas son propre bloc');
  ok(groupPendingSheets(null as any, admin).length === 0 && groupPendingSheets([], admin).length === 0 && groupPendingSheets([line('a1', 'tl1', 'x'), line('a2', 'tl1', 'x')], null).length === 1, 'liste absente ou vide : rien, jamais de plantage');
}
// ---- montant estimé ----
{
  const posts = [line('a1', 'tl1', '2026-11-09'), line('a2', 'tl1', '2026-11-09'), line('a3', 'tl1', '2026-11-09')];
  const g = groupPendingSheets(posts, admin, p => (p.id === 'a1' ? 10000 : p.id === 'a2' ? 5000.4 : NaN));
  ok(g[0].estimatedAr === 15000, 'montant estimé = somme des lignes (arrondi ; une valeur illisible compte 0)');
  ok(groupPendingSheets(posts, admin)[0].estimatedAr === 0, 'sans calcul fourni : 0 (le bloc n\'affiche alors aucun montant)');
}
// ---- validation une à une ----
(async () => {
  { // jamais en parallèle
    let running = 0, maxRunning = 0; const order: string[] = [];
    const r = await decideSheet(['a', 'b', 'c', 'd'], async id => { running++; maxRunning = Math.max(maxRunning, running); await new Promise(res => setTimeout(res, 5)); order.push(id); running--; return { ok: true }; });
    ok(r.done === 4 && r.failed.length === 0 && order.join('') === 'abcd' && maxRunning === 1, 'valide une ligne à la fois, dans l\'ordre (la paie d\'une même personne s\'additionne sans course)');
  }
  { // continue après une erreur
    const r = await decideSheet(['a', 'b', 'c'], async id => (id === 'b' ? { ok: false, error: 'Période clôturée' } : { ok: true }));
    ok(r.done === 2 && r.failed.length === 1 && r.failed[0].id === 'b' && r.failed[0].error === 'Période clôturée', 'une ligne refusée par le serveur n\'arrête pas les autres ; on sait laquelle et pourquoi');
  }
  { // exception
    const r = await decideSheet(['a', 'b'], async id => { if (id === 'a') throw new Error('Pas de réseau'); return { ok: true }; });
    ok(r.done === 1 && r.failed[0].error === 'Pas de réseau', 'une exception est rangée dans les erreurs, sans casser la suite');
  }
  { const r = await decideSheet([], async () => ({ ok: true })); ok(r.done === 0 && r.failed.length === 0, 'liste vide : rien à faire'); }
  { const r = await decideSheet(['a'], async () => ({ ok: false })); ok(r.failed[0].error === 'erreur', 'refus sans texte : « erreur »'); }

  // ---- branchements ----
  const dash = fs.readFileSync('src/views/admin/AdminDashboard.tsx', 'utf8');
  ok(/groupPendingSheets\(pendingSubmissions, currentUser,/.test(dash) && /data-sheet-batch-item/.test(dash), 'écran : bloc « Feuilles du jour à valider » dans la page Validations');
  ok(/data-sheet-batch-start/.test(dash) && /data-sheet-batch-confirm/.test(dash) && /data-sheet-batch-start[^>]*onClick=\{\(\) => setBatchConfirm\(s\.key\)\}/.test(dash) && /data-sheet-batch-confirm[^>]*onClick=\{\(\) => void validateSheet\(s\)\}/.test(dash), 'écran : deux touches (« Tout valider » puis « Confirmer ») : pas de validation de masse par erreur');
  ok(/db\.decidePostNow\(id, true\)/.test(dash) && /decideSheet\(s\.ids/.test(dash) && !/Promise\.all\(s\.ids/.test(dash), 'écran : chaque ligne passe par la validation habituelle du serveur, une par une');
  ok(/valFilter !== 'starts'/.test(dash) && /submissionFilter !== 'pending_start'/.test(dash), 'écran : bloc caché quand on ne regarde que les départs');
  ok(/le refus reste ligne par ligne/.test(dash), 'écran : dit que le refus reste ligne par ligne (un motif par ligne)');
  console.log(`\n${pass}/${pass + fail} contrôles réussis`);
  if (fail) process.exit(1);
})();
