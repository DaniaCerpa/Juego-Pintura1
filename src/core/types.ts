// src/core/types.ts — puro, serializable
export type PigmentId = string;

export interface LevelState {
  jars: PigmentId[][]; // jars[i] = capas de abajo hacia arriba
  capacity: number; // 4
  moveCount: number;
  drying: Record<number, number>; // índice de frasco → movimientos restantes (§6), vacío si no aplica
}

export interface DryingRule {
  jar: number;
  fuse: number;
}

export interface LevelRules {
  mixes: string[]; // ids de recetas habilitadas, ej. ["blue+yellow"]
  drying: DryingRule[];
}

export interface LevelDef {
  id: number;
  capacity: number;
  jars: PigmentId[][];
  par: number;
  difficulty: number;
  rules: LevelRules;
  handmade: boolean;
  seed: number;
}

export interface MixRecipe {
  id: string;
  reagents: [PigmentId, PigmentId];
  product: PigmentId;
  unlockLevel: number;
}

export interface Pour {
  from: number;
  to: number;
}

export type PourKind = 'pour' | 'mix';

export interface PourResult {
  ok: true;
  next: LevelState;
  kind: PourKind;
  layers: number; // capas que cayeron (en mezcla: 1)
  pigment: PigmentId; // pigmento vertido
  product?: PigmentId; // pigmento producido si kind === 'mix'
  recipeId?: string;
  dried: number[]; // frascos cuya mecha llegó a 0 con este movimiento (§6)
}

export interface PourRejected {
  ok: false;
  reason: 'same' | 'empty-source' | 'full-target' | 'mismatch' | 'out-of-range';
}

export type TryPourResult = PourResult | PourRejected;

export const EMPTY_RULES: LevelRules = { mixes: [], drying: [] };
