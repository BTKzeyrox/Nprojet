// M18.3 : le site n'a plus de mode démo (aucun bouton, aucun lien, aucun bandeau, entrée du store fermée en production).
import { readFileSync, existsSync } from 'node:fs';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ÉCHEC :', m); } };
const src = (p: string) => readFileSync(p, 'utf8');
const login = src('src/views/LoginView.tsx');
ok(!/enterDemo|startDemo|demoChoice|\?demo=|get\('demo'\)/.test(login), 'LoginView ne doit plus offrir de démo');
ok(!/Voir la démo/.test(login), 'LoginView : plus de bouton « Voir la démo »');
ok(!existsSync('src/components/DemoBanner.tsx'), 'DemoBanner supprimé');
ok(!/DemoBanner/.test(src('src/App.tsx')), 'App : plus de DemoBanner');
const settings = src('src/views/admin/SettingsView.tsx');
ok(!/removeDemoData|Données de démonstration/.test(settings), 'Réglages : plus de suppression de données démo');
ok(!/removeDemoData/.test(src('src/db/store.ts')), 'store : removeDemoData supprimé');
const store = src('src/db/store.ts');
ok(/import\.meta as any\)\.env\?\.PROD\) throw/.test(store), 'enterDemo refuse en production');
for (const f of ['src/components/OfflineCard.tsx', 'src/components/BackupsSection.tsx', 'src/components/RestoreSection.tsx', 'src/components/ImportDialog.tsx', 'src/components/AiSettingsSection.tsx', 'src/components/TwoStepCard.tsx', 'src/components/MySheets.tsx', 'src/utils/push.ts', 'src/utils/healthDb.ts', 'src/views/admin/EmployeesManagement.tsx', 'src/views/admin/SettingsView.tsx']) {
  ok(!/isDemo\(|Mode démo|mode démo|demo-password|demoSheets/.test(src(f)), `${f} : plus de branche démo`);
}
if (fails) { console.log(`${fails} échec(s)`); process.exit(1); }
console.log('check-no-demo : tout est bon');
