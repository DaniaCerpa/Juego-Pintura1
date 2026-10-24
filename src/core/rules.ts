import type { LevelDef, LevelRules, LevelState, PigmentId, PourKind, TryPourResult } from './types';

/** Crea el estado inicial de un nivel a partir de su definición. */
export function createState(def: Pick<LevelDef, 'jars' | 'capacity' | 'rules'>): LevelState {
  const drying: Record<number, number> = {};
  for (const d of def.rules.drying) drying[d.jar] = d.fuse;
  return {
    jars: def.jars.map((j) => [...j]),
    capacity: def.capacity,
    moveCount: 0,
    drying,
  };
}

export function cloneState(state: LevelState): LevelState {
  return {
    jars: state.jars.map((j) => [...j]),
    capacity: state.capacity,
    moveCount: state.moveCount,
    drying: { ...state.drying },
  };
}

/** Pigmento de la capa superior, o undefined si el frasco está vacío. */
export function topOf(jar: readonly PigmentId[]): PigmentId | undefined {
  return jar[jar.length - 1];
}

/** Cantidad de capas contiguas del mismo pigmento desde el tope. */
export function topRun(jar: readonly PigmentId[]): number {
  if (jar.length === 0) return 0;
  const top = jar[jar.length - 1];
  let n = 0;
  for (let i = jar.length - 1; i >= 0 && jar[i] === top; i--) n++;
  return n;
}

/** Frasco resuelto: vacío o lleno de un solo pigmento. */
export function isJarResolved(jar: readonly PigmentId[], capacity: number): boolean {
  if (jar.length === 0) return true;
  if (jar.length !== capacity) return false;
  const first = jar[0];
  for (let i = 1; i < jar.length; i++) if (jar[i] !== first) return false;
  return true;
}

/** Frasco uniforme (todas sus capas del mismo pigmento), sin importar si está lleno. */
export function isJarUniform(jar: readonly PigmentId[]): boolean {
  for (let i = 1; i < jar.length; i++) if (jar[i] !== jar[0]) return false;
  return true;
}

/** Condición de victoria (§3.3): todos los frascos vacíos o llenos de un solo pigmento. */
export function isSolved(state: LevelState): boolean {
  return state.jars.every((j) => isJarResolved(j, state.capacity));
}

/** Resultado abstracto de un vertido, independiente de la representación del tablero. */
export interface PourOutcome {
  kind: PourKind;
  /** Capas que salen del origen (en mezcla: 1). */
  layers: number;
  /** Pigmento producido (solo en mezcla). */
  product?: PigmentId;
  recipeId?: string;
}

/**
 * Decisión pura de la regla central (§3.2): dado el tope y la racha del origen,
 * el tope y la altura del destino, decide si el vertido es válido y qué produce.
 * `tryPour` (estado completo) y el solver (representación compacta) comparten esta función.
 */
export function pourOutcome(
  srcTop: PigmentId | undefined,
  srcRun: number,
  dstTop: PigmentId | undefined,
  dstLen: number,
  capacity: number,
  rules: LevelRules,
): PourOutcome | null {
  void rules; // mezclas se incorporan en F1
  if (srcTop === undefined || srcRun === 0) return null;
  const free = capacity - dstLen;
  if (free <= 0) return null;
  if (dstTop !== undefined && dstTop !== srcTop) return null;
  return { kind: 'pour', layers: Math.min(srcRun, free) };
}

/**
 * Regla central (§3.2). Devuelve el estado siguiente si el vertido es válido.
 * Nunca muta `state`.
 */
export function tryPour(
  state: LevelState,
  from: number,
  to: number,
  rules: LevelRules,
): TryPourResult {
  if (from === to) return { ok: false, reason: 'same' };
  const src = state.jars[from];
  const dst = state.jars[to];
  if (!src || !dst) return { ok: false, reason: 'out-of-range' };
  if (src.length === 0) return { ok: false, reason: 'empty-source' };
  if (dst.length >= state.capacity) return { ok: false, reason: 'full-target' };

  const pigment = src[src.length - 1];
  const outcome = pourOutcome(pigment, topRun(src), topOf(dst), dst.length, state.capacity, rules);
  if (!outcome) return { ok: false, reason: 'mismatch' };

  const next = cloneState(state);
  next.jars[from] = src.slice(0, src.length - outcome.layers);
  next.jars[to] = dst.concat(new Array<PigmentId>(outcome.layers).fill(pigment));
  next.moveCount = state.moveCount + 1;
  return { ok: true, next, kind: outcome.kind, layers: outcome.layers, pigment };
}

/** Frasco extra (§3.5): agrega un frasco vacío al final del tablero. */
export function addExtraJar(state: LevelState): LevelState {
  const next = cloneState(state);
  next.jars.push([]);
  return next;
}
