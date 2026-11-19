// Magasin de données : « Mes tableaux » et feuilles de mission.
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import type { Sheet } from '../../utils/sheets';
import { buildMissionSheet, needsMissionSheet } from '../../utils/missionSheet';
import { getMissionMode } from '../../utils/workMode';
import { PostSession } from '../../types';
import { SORTERS } from '../storeShared';

export const sheetsMethods = defineMethods({

  // « Mes tableaux » (module 12). Le serveur revérifie tout (bloc SHEETS) ; ici on range seulement les tableaux de la personne connectée.
  getSheets(): Sheet[] { return [...this.sheets]; },
  /** M18.6 : prépare le tableau de la session (un seul : identifiant imposé). Seulement pour l'opérateur lui-même ; le serveur revérifie que la session est la sienne. */
  prepareMissionSheet(post: PostSession, force = false): Sheet | null {
    const me = this.currentUser;
    if (!me || !needsMissionSheet(post, me.id, me.role, this.sheets.map(x => x.id))) return null;
    if (!force && getMissionMode(me.id, post.id) === 'excel') return null; // M19 : la personne travaille sur un Excel externe : le site ne prépare rien (elle peut changer d'avis)
    let lang: 'fr' | 'en' = 'fr';
    try { if (globalThis.localStorage?.getItem('delta_lang') === 'en') lang = 'en'; } catch { /* langue par défaut */ }
    const contract = post.post_number != null ? this.contracts.find(c => c.post_number === post.post_number) : undefined;
    const sheet = buildMissionSheet({ postId: post.id, postNumber: post.post_number, date: post.date, type: contract?.post_type, lang, now: post.created_at });
    if (sheet) { this.putMySheets([sheet, ...this.sheets.filter(x => x.owner_id === me.id)]); return this.sheets.find(x => x.id === sheet.id) || null; }
    return null;
  },
  /** M19 : prépare MAINTENANT le tableau d'une de mes sessions (« Travailler sur le site » ou « Remettre mon fichier »). Rien si elle a déjà son tableau ou n'est pas à moi. */
  prepareMissionSheetNow(postId: string): Sheet | null {
    const post = this.posts.find(p => p.id === postId);
    return post ? this.prepareMissionSheet(post, true) : null;
  },
  /** M19 : mes sessions qui n'ont PAS encore de tableau (parce que je travaille sur un Excel externe). */
  getMissionsWithoutSheet(): PostSession[] {
    const me = this.currentUser;
    if (!me || me.role !== 'employee') return [];
    const ids = this.sheets.map(x => x.id);
    return this.posts.filter(p => needsMissionSheet(p, me.id, me.role, ids));
  },
  /** Remplace les tableaux de la personne connectée par cette liste (les autres, vus par l'admin, ne bougent pas). Le lien avec le serveur se fait tout seul. */
  putMySheets(list: Sheet[]): void {
    const me = this.currentUser;
    if (!me || me.role !== 'employee') return;
    const mine = list.map(x => ({ ...x, owner_id: me.id, owner_name: me.name }));
    const ids = new Set(mine.map(x => x.id));
    this.sheets = [...mine, ...this.sheets.filter(x => x.owner_id !== me.id && !ids.has(x.id))];
    this.sheets.sort(SORTERS.sheets as any);
    this.notify();
  },
});

export type SheetsMethods = typeof sheetsMethods;
