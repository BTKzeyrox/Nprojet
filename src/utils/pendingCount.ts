import { db } from '../db/store';

// Nombre de choses à valider par l'admin (une seule source pour la cloche, le menu et l'Accueil)
export const countPending = () => {
  const posts = db.getPosts();
  const starts = posts.filter(p => p.status === 'pending_start').length;
  const ends = posts.filter(p => p.status === 'pending_end').length;
  const advances = db.getAdvanceRequests().filter(a => a.status === 'pending').length;
  const signups = db.getSignupRequests().length;
  const resets = db.getPasswordResets().length;
  const profiles = db.getProfileRequests().filter(x => x.status === 'pending').length;
  return { starts, ends, advances, signups, resets, profiles, total: starts + ends + advances + signups + resets + profiles };
};
