// Lit le code du magasin de données : db/store.ts + db/storeShared.ts + db/parts/*.ts (le magasin est rangé en plusieurs fichiers).
// Utilisé par : les scripts check-*.ts qui vérifient du texte dans le code du magasin. Lancer depuis la racine du projet.
import fs from 'node:fs';

export function readStoreSource() {
  const dir = 'src/db';
  const files = ['store.ts', 'storeShared.ts', ...fs.readdirSync(`${dir}/parts`).sort().map((f) => `parts/${f}`)];
  return files.map((f) => fs.readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
}
