import pigmentsData from '../data/pigments.json';
import type { PigmentId } from './types';

export interface Pigment {
  id: PigmentId;
  hex: string;
  primary: boolean;
  symbol: string;
}

export interface PigmentsConfig {
  pigments: Pigment[];
  avoidPairsWhenFewPigments: [PigmentId, PigmentId][];
  fewPigmentsThreshold: number;
  symbolsFromPigmentCount: number;
  minDeltaE: number;
  minDeltaEDeuteranopia: number;
}

export const pigmentsConfig: PigmentsConfig = pigmentsData as PigmentsConfig;

const byId = new Map(pigmentsConfig.pigments.map((p) => [p.id, p]));

export function getPigment(id: PigmentId): Pigment {
  const p = byId.get(id);
  if (!p) throw new Error(`Pigmento desconocido: ${id}`);
  return p;
}

export function allPigmentIds(): PigmentId[] {
  return pigmentsConfig.pigments.map((p) => p.id);
}

/** Indica si un conjunto de pigmentos respeta las reglas de accesibilidad (§10). */
export function isDistinguishableSet(ids: readonly PigmentId[], cfg = pigmentsConfig): boolean {
  if (ids.length > cfg.fewPigmentsThreshold) return true;
  const set = new Set(ids);
  return !cfg.avoidPairsWhenFewPigments.some(([a, b]) => set.has(a) && set.has(b));
}
