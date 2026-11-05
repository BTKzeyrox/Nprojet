// Rappels et tâches (M25) : copie locale des éléments de la personne, rechargée du serveur, avec abonnement pour les écrans.
// Utilisé par : RemindersCard.tsx (liste « À faire »), la cloche et l'assistant (rappels manqués). Le serveur reste la référence.
import { db } from '../db/store';
import type { RemItem } from './reminderRules';
import { setRemProvider } from './remRegistry';

export interface RemCfg { templates: { id: string; name: string; color: string; base: string; fires: any[]; fields: string[] }[]; morning: string; hide_title: boolean; quiet_from: string; quiet_to: string; mail?: boolean }
const DEFAULT_CFG: RemCfg = { templates: [], morning: '08:00', hide_title: false, quiet_from: '', quiet_to: '' };
let items: RemItem[] = [];
let cfg: RemCfg = DEFAULT_CFG;
let loaded = false;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

setRemProvider(() => items);
export const remSubscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const remItems = (): RemItem[] => items;
export const remCfg = (): RemCfg => cfg;
export const remLoaded = (): boolean => loaded;

/** Recharge depuis le serveur (une seule demande à la fois). Sans réseau : on garde ce qu'on a. */
export function remReload(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const r = await db.remFetch();
      if (r) { items = r.items as RemItem[]; cfg = { ...DEFAULT_CFG, ...(r.cfg || {}) }; loaded = true; emit(); }
    } finally { loading = null; }
  })();
  return loading;
}
export async function remSave(item: Partial<RemItem> & Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const r = await db.remSave(item);
  if (r.ok && r.item) { items = [...items.filter(x => x.id !== r.item.id), r.item as RemItem]; emit(); }
  return { ok: r.ok, error: r.error };
}
export async function remDelete(id: string): Promise<boolean> {
  const ok = await db.remDelete(id);
  if (ok) { items = items.filter(x => x.id !== id); emit(); }
  return ok;
}
export async function remSnooze(id: string, choice: '10m' | '1h' | 'tomorrow'): Promise<boolean> {
  const u = await db.remSnooze(id, choice);
  if (u) { items = items.map(x => (x.id === id ? { ...x, snooze_until: u } : x)); emit(); }
  return !!u;
}
export async function remSaveCfg(next: Partial<RemCfg>): Promise<boolean> {
  const r = await db.remCfgSave({ ...cfg, ...next });
  if (r) { cfg = { ...DEFAULT_CFG, ...r }; emit(); }
  return !!r;
}
