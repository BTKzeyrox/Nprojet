// Compte ce que l'admin doit valider (débuts, fins, avances, inscriptions, mots de passe, accès, profils) ; lit le store.
// Utilisé par : Sidebar.tsx et AdminDashboard.tsx.
// Pour modifier : c'est la source unique du compteur (cloche, menu, accueil) ; un nouveau type de demande s'ajoute ici et dans le total.
import { db } from '../db/store';

// Nombre de choses à valider par l'admin (une seule source pour la cloche, le menu et l'Accueil)
export const countPending = () => {
  const posts = db.getPosts();
  const starts = posts.filter(p => p.status === 'pending_start').length;
  const ends = posts.filter(p => p.status === 'pending_end').length;
  const advances = db.getAdvanceRequests().filter(a => a.status === 'pending').length;
  const signups = db.getSignupRequests().length;
  const resets = db.getPasswordResets().length;
  const access = db.getAccessRequests().filter(a => a.status === 'pending').length;
  const profiles = db.getProfileRequests().filter(x => x.status === 'pending').length;
  return { starts, ends, advances, signups, resets, access, profiles, total: starts + ends + advances + signups + resets + access + profiles };
};
