// Profil dans l'en-tête : pastille pour tous les rôles, formulaire avec statut, mot de passe et vue opérateur (responsable).
import { existsSync, readFileSync } from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const r = (f: string) => readFileSync(f, 'utf8');
const top = r('src/components/TopBar.tsx'), app = r('src/App.tsx'), side = r('src/components/Sidebar.tsx');
const modal = r('src/components/CVViewerModal.tsx'), set = r('src/views/admin/SettingsView.tsx'), av = r('src/utils/availability.ts');
ok(/data-profile-pill/.test(top) && /onClick=\{onOpenProfile\}/.test(top), 'en-tête : pastille profil cliquable');
ok(!/isAdmin\s*&&[^\n]*data-profile-pill/.test(top), 'pastille non réservée à l\'admin (tous les rôles)');
ok(/onOpenProfile=\{\(\) => setCvModalUser\(currentUser\)\}/.test(app), 'App : la pastille ouvre le profil de la vraie personne connectée');
ok(/onViewAs=/.test(app), 'App : « Voir comme » donné au formulaire de profil');
ok(!/Vue opérateur|Retour responsable/.test(side) && !/df-sb-profile/.test(side), 'menu de gauche : plus de bloc profil ni de bouton Vue opérateur');
ok(/data-view-as/.test(modal) && /Voir comme/.test(modal) && /'admin', 'employee', 'accountant', 'team_lead'/.test(modal), 'formulaire : « Voir comme » Responsable / Opérateur / Comptable / Chef d\'équipe');
ok(/role: viewAs/.test(app) && /canSwitchMode=\{realIsAdmin\}/.test(app), 'App : l\'affichage suit le choix, réservé au vrai responsable');
ok(!/Masquer le bouton|ModeSwitchSection|modeSwitchHidden/.test(modal + app) && !existsSync('src/utils/modeSwitch.ts'), 'plus de masquage du bouton (carte, procédure et réglage retirés)');
ok(/canSwitchMode && onViewAs/.test(modal), '« Voir comme » seulement pour le responsable');
ok(!/ModeSwitchSection/.test(set), 'Réglages : pas de carte Mode responsable/opérateur');
ok(/StatusPicker/.test(modal) && /PasswordForm/.test(modal) && /db\.setPassword/.test(modal), 'formulaire : statut + mot de passe');
ok(/isSelf &&/.test(modal), 'statut et mot de passe seulement sur son propre profil');
// logique du statut (stockage local simulé)
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
(globalThis as any).window = { dispatchEvent: () => true, addEventListener() {}, removeEventListener() {} };
(globalThis as any).Event = class {};
import('../src/utils/availability').then(m => {
  ok(m.getPresence('u1') === 'available', 'statut par défaut : Disponible');
  m.setPresence('u1', 'busy'); ok(m.getPresence('u1') === 'busy' && m.getPresence('u2') === 'available', 'Occupé gardé pour cette personne seulement');
  m.setPresence('u1', 'away'); ok(m.getPresence('u1') === 'away', 'Absent');
  m.setPresence('u1', 'available'); ok(!mem.has('df_presence_u1'), 'Disponible efface la valeur');
  console.log(`\n${n - fails}/${n} contrôles réussis`);
  if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
});
