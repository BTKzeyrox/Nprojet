// Un jour est-il dans une période de paie déjà clôturée (ou payée) ? Règle pure, sans écran ni serveur.
// Le serveur (df-api, fonction `dayInClosedPeriod`) a la même copie ; `npm run check:work-closed` compare les deux sur les mêmes cas.
// Utilisé par : check-work-closed.ts (le site s'appuie sur la réponse du serveur : il ne connaît pas les périodes de paie).
// Pour modifier : `periods` = les lignes de la table de paie de type « period » (soit { data: {...} } comme renvoyé par la base, soit l'objet directement) ; jours au format AAAA-MM-JJ.
export const dayInClosedPeriod = (periods: any[], date: string): boolean => (periods || []).some((r: any) => {
  const d = r && typeof r === 'object' ? (r.data ?? r) : null;
  return !!d && (d.status === 'closed' || d.status === 'paid') && String(d.period_start) <= String(date) && String(date) <= String(d.period_end);
});
