// Aide pour écrire les méthodes de db/parts/*.ts : dans ces méthodes, `this` est le magasin (AppStore).
// Utilisé par : db/parts/*.ts.
import type { AppStore } from '../store';

export function defineMethods<T>(methods: T & ThisType<AppStore>): T {
  return methods;
}
