// Visite guidée (module 16, M16.2) : règles pures, sans écran, sans serveur. Les textes viennent de la carte du site (siteKnowledge.ts) :
// une seule source, donc la visite ne peut pas dire autre chose que l'assistant et le guide. Contrôlé par `npm run check:tour`.
import { findPage, type Bi } from './siteKnowledge';
import { TOUR_CONTENT, TOUR_WELCOME_TIPS } from './tourContent';

/** Monter ce numéro refait apparaître la visite pour tout le monde (après un gros changement du site). */
export const TOUR_VERSION = 2;
export type TourRole = 'admin' | 'employee' | 'accountant' | 'team_lead';

/** Pages montrées, par rôle : seulement celles que ce rôle a vraiment dans son menu. */
export const TOUR_PAGES: Record<TourRole, string[]> = {
  admin: ['dashboard', 'validations', 'clients', 'invoices', 'stats', 'employees', 'health', 'settings'],
  employee: ['feed', 'grid', 'active-post', 'hr', 'chat', 'calendar', 'settings'],
  accountant: ['invoices', 'clients', 'purchasing', 'chat', 'settings'],
  team_lead: ['validations', 'chat', 'settings'],
};

const WELCOME: Record<TourRole, Bi> = {
  admin: { fr: "Bienvenue sur Gestion Pro. Cette visite de quelques écrans montre où se trouve chaque chose. Tu peux la passer et la revoir dans Réglages.", en: 'Welcome to Gestion Pro. This short tour shows where everything is. You can skip it and replay it in Settings.' },
  employee: { fr: "Bienvenue sur Gestion Pro. Cette visite de quelques écrans montre où prendre une mission, envoyer tes preuves et voir ta paie. Tu peux la passer et la revoir dans Réglages.", en: 'Welcome to Gestion Pro. This short tour shows where to take a mission, send your proofs and see your pay. You can skip it and replay it in Settings.' },
  accountant: { fr: "Bienvenue sur Gestion Pro. Cette visite de quelques écrans montre tes pages : factures, clients, achats. Tu peux la passer et la revoir dans Réglages.", en: 'Welcome to Gestion Pro. This short tour shows your pages: invoices, clients, purchases. You can skip it and replay it in Settings.' },
  team_lead: { fr: "Bienvenue sur Gestion Pro. Cette visite de quelques écrans montre comment valider le travail de ton équipe. Tu peux la passer et la revoir dans Réglages.", en: "Welcome to Gestion Pro. This short tour shows how to validate your team's work. You can skip it and replay it in Settings." },
};
const WELCOME_TITLE: Bi = { fr: 'Bienvenue', en: 'Welcome' };

export interface TourStep {
  /** Identifiant de la page du menu à ouvrir (null = écran de bienvenue). */
  page: string | null;
  title: Bi;
  text: Bi;
  /** Première étape du mode d'emploi de la page : « par où commencer ». */
  tip: Bi | null;
  /** Astuces du rôle pour cette page (peut être vide). */
  tips: Bi[];
}

const isRole = (r: unknown): r is TourRole => r === 'admin' || r === 'employee' || r === 'accountant' || r === 'team_lead';

/** Les étapes de la visite : bienvenue, puis une étape par page. Un rôle inconnu est traité comme un opérateur (le moins de droits). */
export function tourSteps(role: unknown): TourStep[] {
  const r: TourRole = isRole(role) ? role : 'employee';
  const steps: TourStep[] = [{ page: null, title: WELCOME_TITLE, text: WELCOME[r], tip: null, tips: TOUR_WELCOME_TIPS[r] || [] }];
  for (const id of TOUR_PAGES[r]) {
    const p = findPage(id);
    if (!p) continue; // une page retirée du menu ne casse jamais la visite
    const own = TOUR_CONTENT[r][id]; // texte écrit pour CE rôle ; sinon la carte du site
    steps.push({ page: id, title: p.title, text: own ? own.text : p.purpose, tip: own ? null : p.howto[0], tips: own ? own.tips : [] });
  }
  return steps;
}

// ---- « Déjà vue » : gardé sur CET appareil, par personne et par version de la visite ----
export interface TourStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
export const tourKey = (userId: string): string => `gp_tour_v${TOUR_VERSION}_${String(userId).slice(0, 80)}`;

export function tourSeen(store: TourStore | undefined | null, userId: string): boolean {
  try { return !!store && store.getItem(tourKey(userId)) === '1'; } catch { return false; }
}
export function markTourSeen(store: TourStore | undefined | null, userId: string): void {
  try { store?.setItem(tourKey(userId), '1'); } catch { /* appareil plein ou navigation privée : la visite reviendra, ce n'est pas grave */ }
}
/** Montrer la visite automatiquement : seulement pour une personne connectée qui ne l'a jamais vue sur cet appareil. */
export const shouldShowTour = (store: TourStore | undefined | null, userId: string | undefined | null): boolean => !!userId && !tourSeen(store, userId);
