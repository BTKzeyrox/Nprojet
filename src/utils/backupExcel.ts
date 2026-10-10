import { db } from '../db/store';

// Sauvegarde Excel : une feuille par thème. Aucun mot de passe n'est exporté.
export async function downloadBackupExcel(): Promise<void> {
  const XLSX = await import('xlsx');
  const users = db.getUsers();
  const sheet = (rows: Record<string, unknown>[]) => XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'Aucune donnée' }]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(users.map(u => ({
    Nom: u.name, Pseudo: u.username, Rôle: u.role, Statut: u.status, Shift: u.shift, Téléphone: u.phone,
    Badge: u.performance_badge, 'Score total': u.total_score_boosted, 'Gains (Ar)': u.total_earnings_ar,
    'Avance en attente (Ar)': u.pending_advance_ar,
  }))), 'Boosters');
  XLSX.utils.book_append_sheet(wb, sheet(db.getPosts().map(p => ({
    Date: p.date, Début: p.start_time, Fin: p.end_time || '', Poste: p.post_number ?? '', Client: p.client_name, Compte: p.account_tag,
    Booster: p.employee_name, Shift: p.shift_type, Statut: p.status, 'Score début': p.initial_score,
    'Score actuel': p.current_score, 'Score final': p.final_score ?? '', Cible: p.target_score,
    'Montant (Ar)': p.calculated_ar ?? '', Notes: p.notes || '', 'Motif de rejet': p.rejection_reason || '',
  }))), 'Sessions');
  XLSX.utils.book_append_sheet(wb, sheet(db.getContracts().map(c => ({
    Poste: c.post_number, Client: c.client_name, Compte: c.account_tag, Type: c.post_type || '', Description: c.description || '',
    Début: c.initial_score, Actuel: c.current_score ?? c.initial_score, Cible: c.target_score,
    Reste: Math.max(0, c.target_score - (c.current_score ?? c.initial_score)), Priorité: c.priority,
  }))), 'Postes');
  XLSX.utils.book_append_sheet(wb, sheet(db.getAdvanceRequests().map(a => ({
    Date: a.request_date, Booster: a.employee_name, 'Montant (Ar)': a.amount_ar, Motif: a.reason, Statut: a.status, Notes: a.admin_notes || '',
  }))), 'Avances');
  XLSX.utils.book_append_sheet(wb, sheet(db.getMessages().map(m => ({
    Date: m.timestamp, De: m.sender_name, Rôle: m.sender_role, Pour: m.recipient_id || '', Message: m.message, Fichier: m.attachment_name || '',
  }))), 'Messages');

  const day = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `sauvegarde-delta-force-${day}.xlsx`);
}
