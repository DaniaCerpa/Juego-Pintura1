import { difficultyConfig } from './difficulty';
import { getRecipe } from './mixes';
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

/** Cantidad de vertidos o mezclas válidas (se detiene al llegar a `cap`). */
export function countMoves(state: LevelState, rules: LevelRules, cap = Infinity): number {
  const table = mixTableFor(rules);
  const { jars, capacity } = state;
  let n = 0;
  for (let i = 0; i < jars.length; i++) {
    if (jars[i].length === 0) continue;
    for (let j = 0; j < jars.length; j++) {
      if (i === j) continue;
      const o = pourOutcome(
        topOf(jars[i]),
        topRun(jars[i]),
        topOf(jars[j]),
        jars[j].length,
        capacity,
        table,
      );
      if (o && ++n >= cap) return n;
    }
  }
  return n;
}

/** ¿Queda al menos un vertido o mezcla válida? */
export function hasAnyMove(state: LevelState, rules: LevelRules): boolean {
  return countMoves(state, rules, 1) > 0;
}

/**
 * Condición necesaria sobre cantidades: ¿existe alguna secuencia de mezclas que deje cada
 * pigmento en múltiplos de la capacidad? Cada mezcla A+B→P resta 1 a A y B y suma 2 a P.
 * Si no existe, la partida es imposible sin importar la posición de las capas. Si la
 * búsqueda se pasa del límite, se asume que sí (nunca declara "sin salida" por error).
 */
export function countsCanComplete(state: LevelState, rules: LevelRules, limit = 5000): boolean {
  const ids: PigmentId[] = [];
  const idx = new Map<PigmentId, number>();
  const add = (p: PigmentId) => {
    if (!idx.has(p)) {
      idx.set(p, ids.length);
      ids.push(p);
    }
  };
  for (const jar of state.jars) for (const p of jar) add(p);
  const recipes = rules.mixes.map((id) => {
    const r = getRecipe(id);
    r.reagents.forEach(add);
    add(r.product);
    return [idx.get(r.reagents[0])!, idx.get(r.reagents[1])!, idx.get(r.product)!] as const;
  });
  const start = new Array<number>(ids.length).fill(0);
  for (const jar of state.jars) for (const p of jar) start[idx.get(p)!]++;
  const cap = state.capacity;
  const ok = (c: number[]) => c.every((v) => v % cap === 0);
  const seen = new Set<string>([start.join(',')]);
  const queue: number[][] = [start];
  while (queue.length > 0) {
    const c = queue.pop()!;
    if (ok(c)) return true;
    for (const [a, b, p] of recipes) {
      if (c[a] === 0 || c[b] === 0) continue;
      const n = c.slice();
      n[a]--;
      n[b]--;
      n[p] += 2;
      const key = n.join(',');
      if (seen.has(key)) continue;
      if (seen.size >= limit) return true;
      seen.add(key);
      queue.push(n);
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
  const incomplete = incompletePigments(state);
  const moves = countMoves(state, rules, cfg.searchWhenMovesAtMost + 1);
  if (moves === 0) kind = 'noMoves';
  else if (incomplete.length > 0 && !countsCanComplete(state, rules)) {
    // Ninguna combinación de mezclas deja los colores en frascos completos.
    kind = 'unsolvable';
  } else if (moves <= cfg.searchWhenMovesAtMost) {
    // Con pocos movimientos el espacio es chico: el solver puede demostrarlo rápido.
    const r = solveFrom(state, rules, maxStates, maxMs);
    if (!r.verified || r.solvable) return { kind: 'none' };
    kind = 'unsolvable';
  } else return { kind: 'none' };
  let extraJarHelps = false;
  if (options.checkExtraJar) {
    const r = solveFrom(addExtraJar(state), rules, maxStates, maxMs);
    extraJarHelps = r.solvable;
  }
  return { kind, incomplete, extraJarHelps };
}
