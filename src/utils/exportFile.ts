// Export complet et reprise (module 16, M16.5) : règles pures. Le fichier est exactement celui du bouton « Télécharger » des sauvegardes
// (un objet { df_users: [...lignes], df_clients: [...], ... }). Importer un fichier ne change AUCUNE donnée : il s'ajoute à la liste des
// sauvegardes ; l'utiliser passe ensuite par « Restaurer » (Gmail vérifié, mot RESTAURER, 2 confirmations, code par mail, sauvegarde de sécurité).
// Le serveur (bloc BACKUPFILE de df-api) a la même copie ; `npm run check:export` la compare.

export const EXPORT_LIMITS = { fileBytes: 25 * 1024 * 1024, tables: 80, rowsPerTable: 200_000, rowsTotal: 500_000 };
/** Tables qui ne reviennent jamais d'un fichier (état du moment, pas des données). */
export const EXPORT_NEVER = ['df_backups', 'df_restore', 'df_presence', 'df_errors'];
export interface BackupFileCheck { ok: boolean; error?: string; tables: { name: string; rows: number }[]; totalRows: number }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Le contenu lu dans le fichier ressemble-t-il à une sauvegarde de Gestion Pro ? Ne regarde pas dans les lignes (la base les contrôle à la restauration, tout ou rien). */
export function checkBackupFile(raw: unknown): BackupFileCheck {
  const bad = (error: string): BackupFileCheck => ({ ok: false, error, tables: [], totalRows: 0 });
  if (!isObj(raw)) return bad('not_object');
  const names = Object.keys(raw);
  if (!names.length || names.length > EXPORT_LIMITS.tables) return bad('tables_count');
  const tables: { name: string; rows: number }[] = [];
  let total = 0;
  for (const name of names) {
    if (!/^df_[a-z][a-z0-9_]{0,40}$/.test(name)) return bad('table_name');
    if (EXPORT_NEVER.includes(name)) return bad('table_forbidden');
    const rows = raw[name];
    if (!Array.isArray(rows)) return bad('table_not_list');
    if (rows.length > EXPORT_LIMITS.rowsPerTable) return bad('too_many_rows');
    for (const r of rows) if (!isObj(r)) return bad('row_not_object');
    total += rows.length;
    if (total > EXPORT_LIMITS.rowsTotal) return bad('too_many_rows');
    tables.push({ name, rows: rows.length });
  }
  const users = raw['df_users'];
  if (!Array.isArray(users) || users.length < 1) return bad('no_users');
  return { ok: true, tables, totalRows: total };
}

export const EXPORT_ERROR_TEXT: Record<string, string> = {
  not_json: "Ce fichier n'est pas une sauvegarde (il ne se lit pas).",
  too_big: 'Fichier trop gros (25 Mo au plus).',
  not_object: "Ce fichier n'est pas une sauvegarde de Gestion Pro.",
  tables_count: "Ce fichier n'est pas une sauvegarde de Gestion Pro.",
  table_name: "Ce fichier contient une table inconnue : ce n'est pas une sauvegarde de Gestion Pro.",
  table_forbidden: "Ce fichier contient une table qui ne se reprend jamais. Ce n'est pas un export valable.",
  table_not_list: "Ce fichier est abîmé (une table n'est pas une liste).",
  row_not_object: 'Ce fichier est abîmé (une ligne est illisible).',
  too_many_rows: 'Ce fichier est trop gros (trop de lignes).',
  no_users: "Ce fichier n'a aucun compte : ce n'est pas une sauvegarde complète.",
};

/** Nom du fichier téléchargé : gestion-pro-export-2026-10-25-1430.json (heure donnée par l'appelant, pas de lecture de l'horloge ici). */
export function exportFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `gestion-pro-export-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
