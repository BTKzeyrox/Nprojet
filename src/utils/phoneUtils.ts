// Téléphone : chiffres uniquement, format fixe « 261 34 12 345 67 »
const PHONE_PREFIX = '261';

export const formatPhone = (raw: string): string => {
  let d = (raw || '').replace(/\D/g, '');
  if (!d.startsWith(PHONE_PREFIX)) d = PHONE_PREFIX + d.replace(/^0+/, '');
  d = d.slice(0, 12);
  const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 7), d.slice(7, 10), d.slice(10, 12)].filter(Boolean);
  const out = parts.join(' ');
  return d.length === 3 ? out + ' ' : out;
};
export const phoneDigits = (v: string) => v.replace(/\D/g, '');
export const phoneIsEmpty = (v: string) => phoneDigits(v) === PHONE_PREFIX || phoneDigits(v) === '';
export const phoneIsComplete = (v: string) => phoneDigits(v).length === 12;
