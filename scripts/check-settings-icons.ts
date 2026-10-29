// Réglages : chaque carte a une petite icône devant son titre (même style partout).
import { readFileSync } from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const files = ['src/views/admin/SettingsView.tsx', 'src/components/NotificationsCard.tsx', 'src/components/OfflineCard.tsx', 'src/components/TwoStepCard.tsx', 'src/components/TourGuide.tsx', 'src/components/AiSettingsSection.tsx',
  'src/components/BackupsSection.tsx', 'src/components/RestoreSection.tsx', 'src/components/WatchSettingsSection.tsx', 'src/components/PerformanceSettings.tsx', 'src/components/RecurringMissionsSection.tsx',
  'src/components/MissionTemplatesSection.tsx', 'src/components/CompanyConditions.tsx', 'src/components/SignupSettings.tsx', 'src/components/AuditSection.tsx'];
let total = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const heads = [...src.matchAll(/<h3 className="font-tactical font-bold text-white([^"]*)">([\s\S]{0,160}?)<\/h3>|<h3 className="font-tactical font-bold text-white([^"]*)">\s*\n([\s\S]{0,200}?)<\/h3>/g)];
  const bare = heads.filter(h => !/flex items-center gap-2/.test(h[1] ?? h[3] ?? ''));
  total += heads.length;
  ok(heads.length > 0 && bare.length === 0, `${f} : ${heads.length} titre(s), tous avec icône`);
  ok(heads.every(h => /<[A-Z][A-Za-z0-9]* className="w-4 h-4/.test(h[2] ?? h[4] ?? '')), `${f} : l'icône est bien dans le titre`);
}
ok(total >= 25, `au moins 25 titres de cartes contrôlés (${total})`);
const sv = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
ok(/<Palette className/.test(sv) && /<Volume2 className/.test(sv), 'Apparence et langue : palette ; Son : haut-parleur');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
