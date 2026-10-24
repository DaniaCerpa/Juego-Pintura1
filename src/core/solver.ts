import { buildMixTable, getRecipe } from './mixes';
import { pourOutcome } from './rules';
import type { LevelDef, LevelRules, LevelState, PigmentId, Pour } from './types';

export interface SolverOptions {
  maxStates?: number;
  maxMs?: number;
  /** Si es true, devuelve la secuencia óptima de movimientos. */
  withSolution?: boolean;
}

export interface SolverResult {
  solvable: boolean;
  par: number; // -1 si no hay solución
  statesExplored: number;
  /** false si se agotaron los límites antes de decidir (nivel "no verificable"). */
  verified: boolean;
  solution?: Pour[];
}

const DEFAULT_MAX_STATES = 300_000;
const DEFAULT_MAX_MS = 2000;

/**
 * Representación compacta: cada frasco es un string de caracteres (abajo → arriba),
 * un carácter por pigmento. El estado es un arreglo de strings en el orden real del tablero.
 */
interface Compact {
  jars: string[];
  drying: Int16Array | null; // mecha por frasco (-1 = no aplica)
}

function internPigments(jars: readonly (readonly PigmentId[])[]): Map<PigmentId, string> {
  const map = new Map<PigmentId, string>();
  for (const jar of jars) {
    for (const p of jar) {
      if (!map.has(p)) map.set(p, String.fromCharCode(65 + map.size));
    }
  }
  return map;
}

function runLen(jar: string): number {
  if (jar.length === 0) return 0;
  const top = jar[jar.length - 1];
  let n = 0;
  for (let i = jar.length - 1; i >= 0 && jar[i] === top; i--) n++;
  return n;
}

function isUniform(jar: string): boolean {
  for (let i = 1; i < jar.length; i++) if (jar[i] !== jar[0]) return false;
  return true;
}

function isResolved(jar: string, capacity: number): boolean {
  return jar.length === 0 || (jar.length === capacity && isUniform(jar));
}

function keyOf(c: Compact): string {
  if (!c.drying) {
    const sorted = c.jars.slice().sort();
    return sorted.join(',');
  }
  const parts = c.jars.map((j, i) => (c.drying![i] >= 0 ? `${j}#${c.drying![i]}` : j));
  parts.sort();
  return parts.join(',');
}

function segments(jar: string): number {
  if (jar.length === 0) return 0;
  let n = 1;
  for (let i = 1; i < jar.length; i++) if (jar[i] !== jar[i - 1]) n++;
  return n;
}

/**
 * Búsqueda óptima (A* con cola de cubos, equivalente a BFS cuando h = 0) sobre estados
 * canónicos (§4.1). Heurística admisible: cada movimiento reduce el total de segmentos de
 * color en ≤ 1 (vertido) o ≤ 2 (mezcla), y el estado final tiene exactamente un segmento
 * por frasco lleno. Devuelve si el nivel es resoluble y su par (mínimo de movimientos).
 * El orden de los frascos no importa para la clave; los movimientos devueltos usan índices reales.
 */
export function solve(
  input: Pick<LevelDef, 'jars' | 'capacity' | 'rules'> | LevelState,
  options: SolverOptions = {},
): SolverResult {
  const maxStates = options.maxStates ?? DEFAULT_MAX_STATES;
  const maxMs = options.maxMs ?? DEFAULT_MAX_MS;
  const capacity = input.capacity;
  const rules: LevelRules = 'rules' in input ? input.rules : { mixes: [], drying: [] };
  // Alfabeto interno: pigmentos del tablero más reactivos/productos de las recetas activas.
  const extra: PigmentId[][] = rules.mixes.map((id) => {
    const r = getRecipe(id);
    return [...r.reagents, r.product];
  });
  const intern = internPigments([...input.jars, ...extra]);
  const mixTable = buildMixTable(rules.mixes, (p) => intern.get(p)!);
  const hasMixes = mixTable.size > 0;

  const startJars = input.jars.map((j) => j.map((p) => intern.get(p)!).join(''));
  let startDrying: Int16Array | null = null;
  const dryingEntries: Array<[number, number]> =
    'drying' in input && !('rules' in input)
      ? Object.entries(input.drying).map(([k, v]) => [Number(k), v])
      : rules.drying.map((d) => [d.jar, d.fuse]);
  if (dryingEntries.length > 0) {
    startDrying = new Int16Array(startJars.length).fill(-1);
    for (const [jar, fuse] of dryingEntries) startDrying[jar] = fuse;
  }

  const start: Compact = { jars: startJars, drying: startDrying };
  const n = startJars.length;
  const deadline = Date.now() + maxMs;
  const totalLayers = startJars.reduce((a, j) => a + j.length, 0);
  const finalFull = Math.ceil(totalLayers / capacity);

  const heuristic = (c: Compact): number => {
    let segs = 0;
    for (const j of c.jars) segs += segments(j);
    const h = segs - finalFull;
    if (h <= 0) return 0;
    return hasMixes ? Math.ceil(h / 2) : h;
  };

  const allResolved = (c: Compact): boolean => {
    for (const j of c.jars) if (!isResolved(j, capacity)) return false;
    return true;
  };

  if (allResolved(start)) {
    return { solvable: true, par: 0, statesExplored: 1, verified: true, solution: [] };
  }

  const states: Compact[] = [start];
  const parent: number[] = [-1];
  const moveFrom: number[] = [-1];
  const moveTo: number[] = [-1];
  const gOf: number[] = [0];
  const bestG = new Map<string, number>([[keyOf(start), 0]]);
  const buckets: number[][] = [];
  const push = (idx: number, f: number) => {
    (buckets[f] ??= []).push(idx);
  };
  push(0, heuristic(start));

  let f = 0;
  let explored = 0;
  let timedOut = false;

  outer: while (true) {
    while (f < buckets.length && (!buckets[f] || buckets[f].length === 0)) f++;
    if (f >= buckets.length) break; // cola vacía: irresoluble
    const curIdx = buckets[f].pop()!;
    const cur = states[curIdx];
    const curG = gOf[curIdx];
    const curKey = keyOf(cur);
    if ((bestG.get(curKey) ?? Infinity) < curG) continue; // entrada obsoleta
    if (allResolved(cur)) {
      const result: SolverResult = {
        solvable: true,
        par: curG,
        statesExplored: explored,
        verified: true,
      };
      if (options.withSolution) {
        const path: Pour[] = [];
        for (let k = curIdx; k > 0; k = parent[k]) path.push({ from: moveFrom[k], to: moveTo[k] });
        path.reverse();
        result.solution = path;
      }
      return result;
    }
    explored++;
    if ((explored & 1023) === 0 && Date.now() > deadline) {
      timedOut = true;
      break;
    }

    let firstEmptyUsed = false;
    for (let i = 0; i < n; i++) {
      const src = cur.jars[i];
      if (src.length === 0) continue;
      const srcUniform = isUniform(src);
      // Poda: no verter desde un frasco uniforme y lleno (ya está resuelto).
      if (srcUniform && src.length === capacity) continue;
      const top = src[src.length - 1];
      const run = runLen(src);

      firstEmptyUsed = false;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dst = cur.jars[j];
        if (dst.length >= capacity) continue;
        if (dst.length === 0) {
          // Poda: no mover un frasco uniforme a uno vacío (estado equivalente).
          if (srcUniform) continue;
          // Poda: todos los frascos vacíos sin secado son equivalentes; usar solo el primero.
          const hasDrying = cur.drying !== null && cur.drying[j] >= 0;
          if (!hasDrying) {
            if (firstEmptyUsed) continue;
            firstEmptyUsed = true;
          }
        }
        const dstTop = dst.length ? dst[dst.length - 1] : undefined;
        const outcome = pourOutcome(top, run, dstTop, dst.length, capacity, mixTable);
        if (!outcome) continue;

        const nextJars = cur.jars.slice();
        nextJars[i] = src.slice(0, src.length - outcome.layers);
        nextJars[j] =
          outcome.kind === 'mix'
            ? dst.slice(0, dst.length - 1) + outcome.product! + outcome.product!
            : dst + top.repeat(outcome.layers);
        let nextDrying: Int16Array | null = null;
        if (cur.drying) {
          nextDrying = tickCompactDrying(cur.drying, nextJars, capacity);
          if (nextDrying === null) continue; // secó: rama inválida
        }
        const next: Compact = { jars: nextJars, drying: nextDrying };
        const key = keyOf(next);
        const g = curG + 1;
        if ((bestG.get(key) ?? Infinity) <= g) continue;
        bestG.set(key, g);

        const idx = states.length;
        states.push(next);
        parent.push(curIdx);
        moveFrom.push(i);
        moveTo.push(j);
        gOf.push(g);
        push(idx, g + heuristic(next));

        if (states.length >= maxStates) {
          timedOut = true;
          break outer;
        }
      }
    }
  }

  return { solvable: false, par: -1, statesExplored: explored, verified: !timedOut };
}

/**
 * Secado en representación compacta (F1). Devuelve null si alguna mecha llega a 0.
 * En F0 nunca hay frascos con secado, así que no se ejecuta.
 */
function tickCompactDrying(
  drying: Int16Array,
  jars: string[],
  capacity: number,
): Int16Array | null {
  const next = new Int16Array(drying);
  for (let i = 0; i < next.length; i++) {
    if (next[i] < 0) continue;
    if (isResolved(jars[i], capacity)) {
      next[i] = -1;
      continue;
    }
    next[i] -= 1;
    if (next[i] <= 0) return null;
  }
  return next;
}
