import handmadeData from '../data/levels/handmade.json';
import generatedData from '../data/levels/levels_0001_0500.json';
import type { LevelDef } from './types';

const handmade = new Map<number, LevelDef>(
  (handmadeData as { levels: LevelDef[] }).levels.map((l) => [l.id, l]),
);
const generated = new Map<number, LevelDef>(
  (generatedData as { levels: LevelDef[] }).levels.map((l) => [l.id, l]),
);

/** Último nivel precalculado disponible. */
export const MAX_PRECOMPUTED_LEVEL = Math.max(0, ...generated.keys(), ...handmade.keys());

/** Niveles hechos a mano tienen prioridad sobre el generador (§4.4). */
export function getLevelDef(id: number): LevelDef | undefined {
  return handmade.get(id) ?? generated.get(id);
}

export function handmadeLevels(): LevelDef[] {
  return [...handmade.values()];
}
