// Réglages : la remise à zéro du site n'apparaît que dans l'onglet Données (et non dans chaque onglet).
import { readFileSync } from 'node:fs';
const s = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
const uses = [...s.matchAll(/<RestoreSection \/>/g)].length;
const gated = /\{tab === 'data' && <RestoreSection \/>\}/.test(s);
const ok1 = uses === 1 && gated;
console.log(ok1 ? 'OK    remise à zéro : une seule fois, seulement dans l\'onglet Données' : 'ECHEC remise à zéro affichée dans plusieurs onglets');
if (!ok1) process.exit(1);
