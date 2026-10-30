// « Va exactement au bon endroit du Stockage » : une alerte ou une notification dit QUEL stockage, QUEL filtre et QUEL produit.
// La page Stockage lit cette demande à son ouverture (ou tout de suite si elle est déjà ouverte), puis le produit clignote 1,5 s.
export type StorageFilter = 'all' | 'low' | 'empty';
export interface StorageIntent { space?: string; filter?: StorageFilter; product?: string }
export const STORAGE_INTENT_EVENT = 'df-storage-intent';
export const STORAGE_FLASH_MS = 1500; // durée du clignotement du produit atteint

let pending: StorageIntent | null = null;
export const setStorageIntent = (i: StorageIntent) => { pending = i; if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORAGE_INTENT_EVENT)); };
export const takeStorageIntent = (): StorageIntent | null => { const i = pending; pending = null; return i; };
/** L'adresse (data-nav) de la ligne d'un produit dans la liste du Stockage. */
export const productNavId = (productId: string): string => `stock-p-${productId}`;
