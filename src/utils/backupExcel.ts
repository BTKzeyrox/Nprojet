import { db } from '../db/store';

// Sauvegarde Excel : une feuille par thème. Aucun mot de passe n'est exporté.
export async function downloadBackupExcel(): Promise<void> {
  const XLSX = await import('xlsx');
  const users = db.getUsers();
  const sheet = (rows: Record<string, unknown>[]) => XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: 'Aucune donnée' }]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(users.map(u => ({
    Nom: u.name, Pseudo: u.username, Rôle: u.role, Statut: u.status, Shift: u.shift, Téléphone: u.phone,
    Badge: u.performance_badge, 'Volume total': u.total_score_boosted, 'Gains (Ar)': u.total_earnings_ar,
    'Avance en attente (Ar)': u.pending_advance_ar,
  }))), 'Opérateurs');
  XLSX.utils.book_append_sheet(wb, sheet(db.getPosts().map(p => ({
    Date: p.date, Début: p.start_time, Fin: p.end_time || '', Mission: p.post_number ?? '', Titre: p.client_name, Référence: p.account_tag,
    Opérateur: p.employee_name, Shift: p.shift_type, Statut: p.status, 'Volume départ': p.initial_score,
    'Quantité faite': p.current_score, 'Quantité finale': p.final_score ?? '', Cible: p.target_score,
    'Montant (Ar)': p.calculated_ar ?? '', Notes: p.notes || '', 'Motif de rejet': p.rejection_reason || '',
  }))), 'Sessions');
  XLSX.utils.book_append_sheet(wb, sheet(db.getContracts().map(c => ({
    Mission: c.post_number, Titre: c.client_name, Référence: c.account_tag, Type: c.post_type || '', Description: c.description || '',
    Début: c.initial_score, Actuel: c.current_score ?? c.initial_score, Cible: c.target_score,
    Reste: Math.max(0, c.target_score - (c.current_score ?? c.initial_score)), Priorité: c.priority,
  }))), 'Missions');
  XLSX.utils.book_append_sheet(wb, sheet(db.getAdvanceRequests().map(a => ({
    Date: a.request_date, Opérateur: a.employee_name, 'Montant (Ar)': a.amount_ar, Motif: a.reason, Statut: a.status, Notes: a.admin_notes || '',
  }))), 'Avances');
  XLSX.utils.book_append_sheet(wb, sheet(db.getMessages().map(m => ({
    Date: m.timestamp, De: m.sender_name, Rôle: m.sender_role, Pour: m.recipient_id || '', Message: m.message, Fichier: m.attachment_name || '',
  }))), 'Messages');
  XLSX.utils.book_append_sheet(wb, sheet(db.getCash().map(c => ({
    Date: c.date, Sens: c.kind === 'in' ? 'Entrée' : 'Sortie', Catégorie: c.category, 'Montant (Ar)': c.amount_ar,
    Client: c.client_name || '', Note: c.note || '',
  }))), 'Finances'); // vide pour un opérateur : le serveur n'envoie les finances qu'au responsable

  const names = new Map(db.getProducts().map(p => [p.id, p.name]));
  XLSX.utils.book_append_sheet(wb, sheet(db.getProducts().map(p => ({
    Produit: p.name, Catégorie: p.category, Unité: p.unit, "Prix d'achat (Ar)": p.buy_price_ar, 'Prix de vente (Ar)': p.sell_price_ar, "Seuil d'alerte": p.alert_threshold,
  }))), 'Produits');
  XLSX.utils.book_append_sheet(wb, sheet(db.getStockMoves().map(m => ({
    Date: m.date, Produit: names.get(m.product_id) || m.product_id, Type: m.type === 'in' ? 'Entrée' : m.type === 'out' ? 'Sortie' : 'Ajustement', Quantité: m.qty, 'Prix payé par unité (Ar)': m.unit_cost_ar ?? '', Note: m.note || '',
  }))), 'Mouvements de stock'); // vides pour un opérateur : le serveur n'envoie le stock qu'au responsable

  const day = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `sauvegarde-gestion-pro-${day}.xlsx`);
}
