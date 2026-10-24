import mixesData from '../data/mixes.json';
import type { MixRecipe, PigmentId } from './types';

export interface MixesConfig {
  recipes: MixRecipe[];
  discoverReward: number;
  completePaletteReward: number;
}

export const mixesConfig: MixesConfig = mixesData as MixesConfig;

const byId = new Map(mixesConfig.recipes.map((r) => [r.id, r]));

export function getRecipe(id: string): MixRecipe {
  const r = byId.get(id);
  if (!r) throw new Error(`Receta desconocida: ${id}`);
  return r;
}

/** Recetas desbloqueadas en un nivel dado (§5.2). */
export function recipesUnlockedAt(level: number): MixRecipe[] {
  return mixesConfig.recipes.filter((r) => r.unlockLevel <= level);
}

/**
 * Tabla de mezclas simétrica: `"A|B"` y `"B|A"` → { product, recipeId }.
 * Las reglas de un nivel se traducen a esta tabla una vez; `pourOutcome` consulta O(1).
 */
export type MixTable = ReadonlyMap<string, { product: PigmentId; recipeId: string }>;

export const EMPTY_MIX_TABLE: MixTable = new Map();

export function buildMixTable(
  recipeIds: readonly string[],
  rename: (p: PigmentId) => PigmentId = (p) => p,
): MixTable {
  const table = new Map<string, { product: PigmentId; recipeId: string }>();
  for (const id of recipeIds) {
    const r = getRecipe(id);
    const [a, b] = r.reagents.map(rename);
    const entry = { product: rename(r.product), recipeId: r.id };
    table.set(`${a}|${b}`, entry);
    table.set(`${b}|${a}`, entry);
  }
  return table;
}

export function findMix(
  table: MixTable,
  a: PigmentId,
  b: PigmentId,
): { product: PigmentId; recipeId: string } | undefined {
  return table.get(`${a}|${b}`);
}
