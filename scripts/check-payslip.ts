// Contrôle du bulletin de paie imprimable (M5.3), sans écran ni réseau. Lancer : npm run check:payslip
import { companyForSlip, fmtDay, fmtScore, pidLabel, slipHtml, slipMoney, slipTotals, type Slip } from '../src/utils/payslip';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const clean = (h: string) => !/undefined|NaN|\[object|Infinity|null/.test(h.replace(/<style>[\s\S]*?<\/style>/, ''));

const slip = (over: Partial<Slip> = {}): Slip => ({
  id: 'slip-2026-10-u1', pid: '2026-10', period_start: '2026-10-01', period_end: '2026-10-31', user_id: 'u1', name: 'Rakoto Jean', username: 'rakoto', phone: '034 00 000 00',
  lines: [
    { post_id: 'p1', date: '2026-10-03', client: 'Atelier Rivage', post_number: 4, score: 2_500_000, rate: 2000, amount: 5000 },
    { post_id: 'p2', date: '2026-10-12', client: 'Maison Lumière', post_number: null, score: 1_000_000, rate: 2000, amount: 2000 },
  ],
  gross: 7000, bonuses: [{ id: 'b1', amount: 1000, reason: 'Mission urgente', at: '2026-10-13' }], penalties: [{ id: 'q1', amount: 500, reason: 'Retard', at: '2026-10-14' }], penalty_applied: 500,
  advance_due_before: 3000, advance_deducted: 1000, advance_carry: 2000, net: 6500, paid: null, closed_at: '2026-11-01T00:00:00Z', ...over,
});
const company = { identity: { name: 'Atelier Soa', address: 'Lot 12, Antananarivo', phone: '020 00 000 00', email: 'contact@soa.mg', logo_url: '', currency: 'Ar' }, legal: { tax_id: '123456', register_id: 'RC-99', notes: ['TVA non applicable.', 'Merci de votre travail.'] } };

// ---------- libellés et formats ----------
ok(pidLabel('2026-10') === 'Octobre 2026' && pidLabel('2026-10-A') === 'Octobre 2026 · 1 au 15' && pidLabel('2026-10-B') === 'Octobre 2026 · 16 à la fin', 'période FR : mois, quinzaine A et B');
ok(pidLabel('2026-10', 'en') === 'October 2026' && pidLabel('2026-02-B', 'en') === 'February 2026 · 16th to end', 'période EN');
ok(pidLabel('abc') === 'abc' && pidLabel('2026-13') === '2026-13' && pidLabel('') === '', 'période invalide : texte gardé tel quel');
ok(fmtDay('2026-10-03', 'fr') === '03/10/2026' && fmtDay('2026-10-03', 'en') === '03/10/2026' && fmtDay('pas une date') === 'pas une date', 'dates FR/EN, date fausse gardée');
ok(fmtDay('2026-10-20', 'fr') === '20/10/2026' && fmtScore(2_500_000, 'fr').endsWith('M') && fmtScore(2_500_000, 'en').startsWith('2.5'), 'points : 2,5 M (FR) et 2.5 M (EN)');
ok(slipMoney(12345) === '12\u202f345 Ar' || /^12[\s\u202f\u00a0]345 Ar$/.test(slipMoney(12345)), 'montant FR : 12 345 Ar');
ok(slipMoney(12345, 'Ar', 'en') === '12,345 Ar' && slipMoney(1500, 'EUR', 'fr').endsWith(' EUR') && slipMoney(NaN) === '0 Ar' && slipMoney(1e12).includes('000') && !slipMoney(1e12).includes('e'), 'montant : EN avec virgule, autre monnaie, NaN = 0, 1 000 milliards sans exposant');

// ---------- cohérence du calcul ----------
const t1 = slipTotals(slip());
ok(t1.total === 8000 && t1.penApplied === 500 && t1.expectedNet === 6500 && t1.consistent && !t1.capped, 'calcul : 7 000 + 1 000 − 500 − 1 000 = 6 500, cohérent');
const t2 = slipTotals(slip({ penalties: [{ id: 'q', amount: 20000, reason: 'Grosse retenue', at: 'x' }], penalty_applied: 8000, advance_deducted: 0, net: 0 }));
ok(t2.capped && t2.penApplied === 8000 && t2.expectedNet === 0 && t2.consistent, 'retenues plus grandes que le total : limitées au total, net 0, cohérent');
ok(!slipTotals(slip({ net: 9999 })).consistent && slipTotals(slip({ net: 6500.4 })).consistent, 'écart de net détecté (9 999 ≠ 6 500), arrondi toléré');
ok(slipTotals(slip({ gross: NaN as any, bonuses: [], penalties: [], penalty_applied: 0, advance_deducted: 0, net: 0 })).consistent, 'NaN traité comme 0, sans erreur');

// ---------- document FR (admin, avec l'entreprise) ----------
const fr = slipHtml(slip(), { lang: 'fr', company: companyForSlip(company), printedAt: '2026-11-02T08:00:00Z' });
ok(clean(fr), 'FR : aucun « undefined », « NaN » ni « null » dans le document');
ok(fr.includes('Bulletin de paie') && fr.includes('Atelier Soa') && fr.includes('Lot 12, Antananarivo') && fr.includes('N° fiscal : 123456') && fr.includes('RC-99') && fr.includes('contact@soa.mg'), 'FR : en-tête de l\'entreprise (nom, adresse, contacts, numéros)');
ok(fr.includes('Rakoto Jean') && fr.includes('@rakoto') && fr.includes('Octobre 2026') && fr.includes('01/10/2026') && fr.includes('31/10/2026') && fr.includes('slip-2026-10-u1') && fr.includes('02/11/2026'), 'FR : salarié, période, dates, référence, date d\'édition');
ok(fr.includes('Mission 4 · Atelier Rivage') && fr.includes('Maison Lumière') && fr.includes('2,5 M') && /5[\s\u202f\u00a0]000 Ar/.test(fr), 'FR : lignes de mission avec points et montants');
ok(/Mission urgente/.test(fr) && /Retard/.test(fr) && /\+ 1[\s\u202f\u00a0]000 Ar/.test(fr) && /− 500 Ar/.test(fr) && /− 1[\s\u202f\u00a0]000 Ar/.test(fr) && /NET À PAYER<\/td><td class="r">6[\s\u202f\u00a0]500 Ar/.test(fr), 'FR : prime, retenue, avance remboursée et net 6 500 Ar');
ok(fr.includes('Avance restant à rembourser') && /2[\s\u202f\u00a0]000 Ar/.test(fr) && fr.includes('Pas encore payé.'), 'FR : avance reportée et « pas encore payé »');
ok(fr.includes('TVA non applicable.') && fr.includes('Merci de votre travail.') && fr.includes('pas un bulletin de paie légal'), 'FR : mentions de l\'entreprise et avertissement « pas un bulletin légal »');
ok(/Signature de l(&#39;|')employeur/.test(fr) && fr.includes('Signature du salarié') && fr.includes('@page{size:A4'), 'FR : cadres de signature et mise en page A4');
ok(!fr.includes('APERÇU') && !fr.includes('ÉCART DE CALCUL'), 'FR : pas de bandeau « aperçu » (période clôturée) ni d\'alerte d\'écart');

// ---------- aperçu, écart, vide, payé ----------
const prev = slipHtml(slip({ closed_at: undefined }), { lang: 'fr' });
ok(prev.includes('APERÇU : période non clôturée'), 'période non clôturée : bandeau « APERÇU » imprimé');
ok(slipHtml(slip({ net: 9999 }), { lang: 'fr' }).includes('ÉCART DE CALCUL'), 'net qui ne retombe pas : alerte imprimée en rouge');
const empty = slipHtml(slip({ lines: [], gross: 0, bonuses: [], penalties: [], penalty_applied: 0, advance_deducted: 0, advance_due_before: 0, advance_carry: 0, net: 0 }), { lang: 'fr' });
ok(clean(empty) && empty.includes('Aucune mission validée sur la période.') && !empty.includes('Avance restant'), 'bulletin vide : message clair, pas de ligne d\'avance');
const paid = slipHtml(slip({ paid: { at: '2026-11-05T00:00:00Z', method: 'MVola', ref: 'TX123', by_name: 'Admin' } }), { lang: 'fr' });
ok(paid.includes('Payé le 05/11/2026') && paid.includes('MVola') && paid.includes('réf. TX123') && !paid.includes('Pas encore payé'), 'payé : date, moyen, référence');
const capped = slipHtml(slip({ penalties: [{ id: 'q', amount: 20000, reason: 'Grosse retenue', at: 'x' }], penalty_applied: 8000, advance_deducted: 0, net: 0 }), { lang: 'fr' });
ok(capped.includes('Retenues limitées au total : appliqué'), 'retenues limitées : phrase d\'explication');

// ---------- EN et autre monnaie ----------
const en = slipHtml(slip(), { lang: 'en', company: companyForSlip(company), printedAt: '2026-11-02T08:00:00Z' });
ok(clean(en) && en.includes('Payslip') && en.includes('NET PAY') && en.includes('October 2026') && en.includes('Employer signature') && en.includes('Tax ID : 123456') && !en.includes('Bulletin'), 'EN : document en anglais');
ok(/6,500 Ar/.test(en) && /<html lang="en">/.test(en) && en.includes('not a legal payslip'), 'EN : montants avec virgule, langue de la page, avertissement');
const eur = slipHtml(slip(), { lang: 'fr', company: companyForSlip({ ...company, identity: { ...company.identity, currency: 'EUR' } }) });
ok(/6[\s\u202f\u00a0]500 EUR/.test(eur) && !/\d Ar\b/.test(eur.replace(/<style>[\s\S]*?<\/style>/, '')), 'autre monnaie (EUR) : partout, plus de « Ar »');

// ---------- employé : pas d'identité de l'entreprise ----------
const emp = slipHtml(slip(), { lang: 'fr', company: companyForSlip({ legal: undefined, identity: undefined } as any) });
ok(clean(emp) && emp.includes('Bulletin de paie') && emp.includes('Rakoto Jean') && !emp.includes('N° fiscal') && emp.includes('<div class="head"><div class="co"></div></div>'), 'employé (sans identité) : en-tête vide, aucune erreur');
ok(clean(slipHtml(slip())), 'sans aucune option : FR par défaut, sans erreur');

// ---------- sécurité : tout ce qui vient d'une saisie est échappé ----------
const evil = slipHtml(slip({ name: '<script>alert(1)</script>', username: '"><img src=x onerror=alert(2)>', phone: '<b>x</b>', lines: [{ post_id: 'p', date: '2026-10-03', client: '<svg onload=alert(3)>', post_number: 1, score: 1, rate: 1, amount: 1 }], bonuses: [{ id: 'b', amount: 1, reason: '</td><script>x</script>', at: 'x' }], paid: { at: '2026-11-05', method: '<i>m</i>', ref: '"onfocus="x' } }),
  { lang: 'fr', company: companyForSlip({ identity: { name: '<b>Evil</b>', address: '<script>y</script>', logo_url: 'javascript:alert(4)', currency: '<u>' }, legal: { notes: ['<img src=x>'] } } as any) });
const body = evil.replace(/<style>[\s\S]*?<\/style>/, '');
ok(!/<script|<img|<svg|<b>Evil|<b>x|<i>m|<u>/.test(body) && !/<[^>]*(onerror|onload|onfocus)=/.test(body) && body.includes('&lt;script&gt;') && body.includes('&lt;svg onload=alert(3)&gt;'), 'sécurité : nom, client, motif, entreprise, notes, moyen de paiement : balises échappées, aucun gestionnaire d\'événement dans une balise');
ok(!body.includes('javascript:') && !body.includes('<img src="javascript'), 'sécurité : logo « javascript: » refusé');
const logoOk = slipHtml(slip(), { company: companyForSlip({ identity: { logo_url: 'https://res.cloudinary.com/x/logo.png"onerror="alert(1)' } } as any) });
ok(!logoOk.includes('onerror="alert(1)') , 'sécurité : une adresse de logo avec guillemet est refusée');
const logoGood = slipHtml(slip(), { company: companyForSlip({ identity: { logo_url: 'https://res.cloudinary.com/x/logo.png' } } as any) });
ok(logoGood.includes('<img src="https://res.cloudinary.com/x/logo.png" alt="">'), 'logo https accepté');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
