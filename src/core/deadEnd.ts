import { difficultyConfig } from './difficulty';
import { addExtraJar, isSolved, mixTableFor, pourOutcome, topOf, topRun } from './rules';
import { solve } from './solver';
import type { LevelRules, LevelState, PigmentId } from './types';

/**
 * Detección de partida sin salida. El jugador nunca debe quedar frente a un tablero
 * imposible sin saberlo: si no quedan vertidos, o el solver demuestra que ya no hay
 * solución (típico tras una mezcla accidental que deja colores sin completar 4 capas),
 * la escena lo avisa y ofrece deshacer, un frasco extra o empezar de nuevo.
 */
export interface IncompletePigment {
  pigment: PigmentId;
  count: number;
}

export type DeadEnd =
  | { kind: 'none' }
  | {
      kind: 'noMoves' | 'unsolvable';
      /** Pigmentos cuya cantidad total no llena frascos completos. */
      incomplete: IncompletePigment[];
      /** true si agregar un frasco vacío vuelve a hacer resoluble la partida. */
      extraJarHelps: boolean;
    };

export interface DeadEndOptions {
  maxStates?: number;
  maxMs?: number;
  /** Si es true, prueba si un frasco vacío extra rescataría la partida. */
  checkExtraJar?: boolean;
}

const cfg = difficultyConfig.deadEnd;

/** ¿Queda al menos un vertido o mezcla válida? */
export function hasAnyMove(state: LevelState, rules: LevelRules): boolean {
  const table = mixTableFor(rules);
  const { jars, capacity } = state;
  for (let i = 0; i < jars.length; i++) {
    if (jars[i].length === 0) continue;
    for (let j = 0; j < jars.length; j++) {
      if (i === j) continue;
      if (
        pourOutcome(
          topOf(jars[i]),
          topRun(jars[i]),
          topOf(jars[j]),
          jars[j].length,
          capacity,
          table,
        )
      )
        return true;
    }
  }
  return false;
}

/** Pigmentos cuya cantidad total no es múltiplo de la capacidad (no pueden llenar frascos). */
export function incompletePigments(state: LevelState): IncompletePigment[] {
  const counts = new Map<PigmentId, number>();
  for (const jar of state.jars) for (const p of jar) counts.set(p, (counts.get(p) ?? 0) + 1);
  const out: IncompletePigment[] = [];
  for (const [pigment, count] of counts) {
    if (count % state.capacity !== 0) out.push({ pigment, count });
  }
  return out;
}

function solveFrom(state: LevelState, rules: LevelRules, maxStates: number, maxMs: number) {
  const drying = Object.entries(state.drying).map(([k, v]) => ({ jar: Number(k), fuse: v }));
  return solve(
    { jars: state.jars, capacity: state.capacity, rules: { mixes: rules.mixes, drying } },
    { maxStates, maxMs },
  );
}

/**
 * Analiza el tablero actual. Solo declara "sin salida" cuando está demostrado: si el
 * solver agota su presupuesto sin decidir, se asume que todavía hay esperanza.
 */
export function analyzeDeadEnd(
  state: LevelState,
  rules: LevelRules,
  options: DeadEndOptions = {},
): DeadEnd {
  if (isSolved(state)) return { kind: 'none' };
  const maxStates = options.maxStates ?? cfg.maxStates;
  const maxMs = options.maxMs ?? cfg.maxMs;
  let kind: 'noMoves' | 'unsolvable';
  if (!hasAnyMove(state, rules)) kind = 'noMoves';
  else {
    const r = solveFrom(state, rules, maxStates, maxMs);
    if (!r.verified || r.solvable) return { kind: 'none' };
    kind = 'unsolvable';
  }
  let extraJarHelps = false;
  if (options.checkExtraJar) {
    const r = solveFrom(addExtraJar(state), rules, maxStates, maxMs);
    extraJarHelps = r.solvable;
  }
  return { kind, incomplete: incompletePigments(state), extraJarHelps };
}
