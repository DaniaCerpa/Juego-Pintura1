import economyData from '../data/economy.json';

export interface StarThresholds {
  three: number; // ≤ par + three → ★★★
  two: number; // ≤ par + two → ★★
}

export const starThresholds: StarThresholds = economyData.stars;

/** Estrellas por movimientos frente al par (§7.1). Siempre al menos 1 al ganar. */
export function starsFor(
  moves: number,
  par: number,
  t: StarThresholds = starThresholds,
): 1 | 2 | 3 {
  if (moves <= par + t.three) return 3;
  if (moves <= par + t.two) return 2;
  return 1;
}
