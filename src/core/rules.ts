import { buildMixTable, findMix, type MixTable } from './mixes';
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
 * Decisión pura de la regla central (§3.2 + mezclas §5.1): dado el tope y la racha del
 * origen, el tope y la altura del destino, decide si el vertido es válido y qué produce.
 * `tryPour` (estado completo) y el solver (representación compacta) comparten esta función.
 */
export function pourOutcome(
  srcTop: PigmentId | undefined,
  srcRun: number,
  dstTop: PigmentId | undefined,
  dstLen: number,
  capacity: number,
  mixes: MixTable,
): PourOutcome | null {
  if (srcTop === undefined || srcRun === 0) return null;
  const free = capacity - dstLen;
  if (free <= 0) return null;
  if (dstTop === undefined || dstTop === srcTop) {
    return { kind: 'pour', layers: Math.min(srcRun, free) };
  }
  const mix = findMix(mixes, srcTop, dstTop);
  if (!mix) return null;
  // Mezcla: cae 1 capa de A, se consume la capa B del tope y se producen 2 de P (§5.1).
  return { kind: 'mix', layers: 1, product: mix.product, recipeId: mix.recipeId };
}

const tableCache = new WeakMap<LevelRules, MixTable>();

/** Tabla de mezclas de unas reglas (cacheada por identidad del objeto). */
export function mixTableFor(rules: LevelRules): MixTable {
  let t = tableCache.get(rules);
  if (!t) {
    t = buildMixTable(rules.mixes);
    tableCache.set(rules, t);
  }
  return t;
}

/**
 * Regla central (§3.2). Devuelve el estado siguiente si el vertido es válido.
 * Nunca muta `state`. Aplica el secado (§6) tras el movimiento.
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
  const outcome = pourOutcome(
    pigment,
    topRun(src),
    topOf(dst),
    dst.length,
    state.capacity,
    mixTableFor(rules),
  );
  if (!outcome) return { ok: false, reason: 'mismatch' };

  const next = cloneState(state);
  next.jars[from] = src.slice(0, src.length - outcome.layers);
  if (outcome.kind === 'mix' && outcome.product) {
    next.jars[to] = dst.slice(0, dst.length - 1).concat([outcome.product, outcome.product]);
  } else {
    next.jars[to] = dst.concat(new Array<PigmentId>(outcome.layers).fill(pigment));
  }
  next.moveCount = state.moveCount + 1;
  const dried = tickDrying(next);
  return {
    ok: true,
    next,
    kind: outcome.kind,
    layers: outcome.layers,
    pigment,
    product: outcome.product,
    recipeId: outcome.recipeId,
    dried,
  };
}

/**
 * Secado (§6), aplicado en sitio sobre `state` tras un movimiento: cada frasco con mecha
 * la apaga si quedó resuelto; si no, baja 1. Devuelve los índices que llegaron a 0 (derrota).
 */
export function tickDrying(state: LevelState): number[] {
  const dried: number[] = [];
  for (const key of Object.keys(state.drying)) {
    const i = Number(key);
    if (isJarResolved(state.jars[i] ?? [], state.capacity)) {
      delete state.drying[i];
      continue;
    }
    state.drying[i] -= 1;
    if (state.drying[i] <= 0) dried.push(i);
  }
  return dried;
}

/** Diluir (§6): repone la mecha de los frascos secos a su valor original. */
export function dilute(state: LevelState, rules: LevelRules): LevelState {
  const next = cloneState(state);
  for (const d of rules.drying) {
    if (next.drying[d.jar] !== undefined && next.drying[d.jar] <= 0) next.drying[d.jar] = d.fuse;
  }
  return next;
}

/** Frasco extra (§3.5): agrega un frasco vacío al final del tablero. */
export function addExtraJar(state: LevelState): LevelState {
  const next = cloneState(state);
  next.jars.push([]);
  return next;
}
