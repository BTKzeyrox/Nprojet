// Couleur d'une carte de poste selon le « Reste » (score qu'il reste à faire)
// moins de 20M = rouge, moins de 50M = orange, sinon aucune couleur (carte normale)
export type PostBand = 'red' | 'orange' | 'normal';

export const RED_BELOW = 20_000_000;
export const ORANGE_BELOW = 50_000_000;

export const getRemainingBand = (remainingScore: number, noAccount = false): PostBand => {
  if (noAccount) return 'normal';
  if (remainingScore < RED_BELOW) return 'red';
  if (remainingScore < ORANGE_BELOW) return 'orange';
  return 'normal';
};
