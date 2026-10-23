// Décision sur une session (M7.1 d) : valider ou refuser. Règles pures, sans écran ni serveur.
// Le serveur (bloc DECIDE de df-api) a la même copie ; `npm run check:team-lead` compare les deux.
// Pourquoi côté serveur : valider fige la paie de l'opérateur et le prix client, que le Chef d'équipe ne doit pas voir. Le calcul se fait donc chez le serveur, jamais dans son navigateur.
export interface PostDecision { ok: boolean; error?: string; kind?: 'start_ok' | 'end_ok' | 'refused'; post?: any; contract?: any; employee?: any; payAr?: number }

const validPrice = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n >= 0;
const num = (v: unknown): number => { const n = Number(v); return isFinite(n) ? n : 0; };

/** Prix client d'une mission : son prix propre, sinon celui de son type, sinon le prix par défaut (Réglages). 0 est un vrai prix. */
export function decisionClientPrice(contract: any, settings: any): number {
  if (contract && validPrice(contract.client_price_ar)) return Math.round(contract.client_price_ar);
  const byType = (settings && settings.client_prices_by_type) || {};
  const t = contract && contract.post_type;
  if (t && validPrice(byType[t])) return Math.round(byType[t]);
  return settings && validPrice(settings.client_price_default_ar) ? Math.round(settings.client_price_default_ar) : 0;
}

/** Ce qui change quand on valide ou refuse une session. Ne modifie jamais ce qu'on lui donne : renvoie des copies. */
export function planPostDecision(post: any, contract: any, settings: any, employee: any, approve: boolean, reason: unknown, nowIso: string): PostDecision {
  if (!post || typeof post !== 'object') return { ok: false, error: 'missing' };
  if (post.status !== 'pending_start' && post.status !== 'pending_end') return { ok: false, error: 'not_pending' };
  if (!approve) {
    const why = String(reason ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
    if (!why) return { ok: false, error: 'reason' };
    return { ok: true, kind: 'refused', post: { ...post, status: 'rejected', rejection_reason: why, updated_at: nowIso } };
  }
  if (post.status === 'pending_start') return { ok: true, kind: 'start_ok', post: { ...post, status: 'active', updated_at: nowIso } };
  const finalScore = num(post.final_score ?? post.current_score);
  const gained = Math.max(0, finalScore - num(post.initial_score));
  const pay = Math.max(0, Math.round(num(settings && settings.price_per_mission)));
  return {
    ok: true, kind: 'end_ok', payAr: pay,
    post: { ...post, status: 'completed', calculated_ar: pay, client_price_ar: decisionClientPrice(contract, settings), updated_at: nowIso },
    contract: contract ? { ...contract, current_score: finalScore } : undefined,
    employee: employee ? { ...employee, total_score_boosted: num(employee.total_score_boosted) + gained, total_earnings_ar: num(employee.total_earnings_ar) + pay } : undefined,
  };
}
