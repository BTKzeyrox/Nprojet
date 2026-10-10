// Filtre à appliquer sur la page Validations quand on arrive depuis une notification
export type ValFilter = 'all' | 'starts' | 'ends' | 'advances' | 'signups' | 'resets' | 'profiles';
export const VAL_INTENT_EVENT = 'df-val-intent';
let pending: ValFilter | null = null;

export const setValFilterIntent = (f: ValFilter) => {
  pending = f;
  window.dispatchEvent(new Event(VAL_INTENT_EVENT));
};
export const takeValFilterIntent = (): ValFilter | null => {
  const p = pending;
  pending = null;
  return p;
};
