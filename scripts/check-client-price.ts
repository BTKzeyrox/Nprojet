// Contrôle du prix client (sans écran, sans serveur).
// Lancer : npx --yes tsx scripts/check-client-price.ts
import { clientPriceForContract, clientPriceForPost, clientPriceForType, parsePriceInput } from '../src/utils/clientPrice';
import type { ClientContract } from '../src/types';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

const S = { client_price_default_ar: 8000, client_prices_by_type: { 'Contrôle qualité': 9000, 'Tâche web': 0 } };
const none = {};

// --- Par type ---
eq(clientPriceForType('Saisie de fiches', S), 8000, 'type sans exception : prix par défaut');
eq(clientPriceForType('Contrôle qualité', S), 9000, 'type avec exception : prix du type');
eq(clientPriceForType('Tâche web', S), 0, 'exception à 0 = mission offerte (0 est un vrai prix)');
eq(clientPriceForType(undefined, S), 8000, 'mission sans type : prix par défaut');
eq(clientPriceForType('', S), 8000, 'type vide : prix par défaut');
eq(clientPriceForType('Contrôle qualité', none), 0, 'rien de réglé : 0');
eq(clientPriceForType('X', { client_price_default_ar: 7999.6 }), 8000, 'arrondi à l\'entier');
eq(clientPriceForType('Contrôle qualité', { client_price_default_ar: 5000, client_prices_by_type: { 'Contrôle qualité': -5 } }), 5000, 'prix de type négatif ignoré');
eq(clientPriceForType('Contrôle qualité', { client_price_default_ar: -1 }), 0, 'prix par défaut négatif ignoré');

// --- Par mission ---
eq(clientPriceForContract({ client_price_ar: 15000, post_type: 'Contrôle qualité' }, S), 15000, 'prix de la mission passe avant le type');
eq(clientPriceForContract({ client_price_ar: 0, post_type: 'Contrôle qualité' }, S), 0, 'prix de mission à 0 : offerte');
eq(clientPriceForContract({ post_type: 'Contrôle qualité' }, S), 9000, 'sans prix propre : prix du type');
eq(clientPriceForContract({ post_type: 'Autre' }, S), 8000, 'sans prix propre ni exception : prix par défaut');
eq(clientPriceForContract(undefined, S), 8000, 'mission introuvable : prix par défaut');
eq(clientPriceForContract({ client_price_ar: NaN as unknown as number, post_type: 'Contrôle qualité' }, S), 9000, 'prix de mission invalide ignoré');

// --- Mission faite (session) ---
const contracts = [
  { post_number: 1, client_name: 'Lot 12', post_type: 'Contrôle qualité' },
  { post_number: 2, client_name: 'Lot 13', post_type: 'Saisie de fiches', client_price_ar: 20000 },
] as ClientContract[];
eq(clientPriceForPost({ client_price_ar: 6500, post_number: 1, client_name: 'Lot 12' }, contracts, S), 6500, 'prix figé à la validation : il garde sa valeur même si les prix changent');
eq(clientPriceForPost({ post_number: 1, client_name: 'Lot 12' }, contracts, S), 9000, 'ancienne mission : recalculée par le type');
eq(clientPriceForPost({ post_number: 2, client_name: 'Lot 13' }, contracts, S), 20000, 'ancienne mission : recalculée par son prix propre');
eq(clientPriceForPost({ post_number: 99, client_name: 'Lot 13' }, contracts, S), 20000, 'retrouvée par le nom si le numéro a changé');
eq(clientPriceForPost({ post_number: 99, client_name: 'Inconnu' }, contracts, S), 8000, 'mission supprimée : prix par défaut');
eq(clientPriceForPost({ client_price_ar: 0, post_number: 1, client_name: 'Lot 12' }, contracts, S), 0, 'prix figé à 0 est conservé');

// --- Saisie ---
eq(parsePriceInput(''), undefined, 'champ vide : pas de prix propre');
eq(parsePriceInput('   '), undefined, 'espaces : pas de prix propre');
eq(parsePriceInput('12000'), 12000, 'nombre');
eq(parsePriceInput('12 000'), 12000, 'espace dans le nombre');
eq(parsePriceInput('8000,6'), 8001, 'virgule arrondie');
eq(parsePriceInput('0'), 0, 'zéro accepté');
eq(parsePriceInput('-5'), null, 'négatif refusé');
eq(parsePriceInput('abc'), null, 'texte refusé');

console.log(`\n${n - fails}/${n} contrôles OK`);
process.exit(fails ? 1 : 0);
