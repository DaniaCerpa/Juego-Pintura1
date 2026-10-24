import {
  difficultyConfig,
  easierParams,
  estimateDifficulty,
  paramsForLevel,
  type DifficultyConfig,
  type LevelParams,
} from './difficulty';
import { allPigmentIds, isDistinguishableSet } from './pigments';
import { createRng, type Rng } from './rng';
import { isJarUniform, isSolved } from './rules';
import { solve, type SolverResult } from './solver';
import type { LevelDef, LevelRules, PigmentId } from './types';

export interface GeneratorOptions {
  config?: DifficultyConfig;
  /** Pigmentos disponibles (por defecto, todos los de pigments.json). */
  palette?: PigmentId[];
  /** Si es true, ignora las columnas de mezclas y secado (F0). */
  sortOnly?: boolean;
}

export interface GeneratedLevel {
  def: LevelDef;
  solver: SolverResult;
  attempts: number;
  warnings: string[];
}

interface Candidate {
  jars: PigmentId[][];
  rules: LevelRules;
  seed: number;
}

/** Elige C pigmentos distinguibles entre sí con el RNG dado. */
export function pickPigments(rng: Rng, count: number, palette: PigmentId[]): PigmentId[] {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pool = rng.shuffle([...palette]);
    const chosen = pool.slice(0, count);
    if (isDistinguishableSet(chosen)) return chosen;
  }
  // Último recurso determinista: quitar el segundo miembro de cada par conflictivo.
  const pool = rng.shuffle([...palette]);
  const chosen: PigmentId[] = [];
  for (const p of pool) {
    if (chosen.length === count) break;
    if (isDistinguishableSet([...chosen, p])) chosen.push(p);
  }
  return chosen;
}

/** Reparte 4·C capas barajadas en C frascos llenos y agrega E vacíos. */
function buildSortCandidate(
  rng: Rng,
  pigments: PigmentId[],
  empties: number,
  capacity: number,
  seed: number,
): Candidate {
  const layers: PigmentId[] = [];
  for (const p of pigments) for (let i = 0; i < capacity; i++) layers.push(p);
  rng.shuffle(layers);
  const jars: PigmentId[][] = [];
  for (let i = 0; i < pigments.length; i++) {
    jars.push(layers.slice(i * capacity, (i + 1) * capacity));
  }
  for (let i = 0; i < empties; i++) jars.push([]);
  return { jars, rules: { mixes: [], drying: [] }, seed };
}

/** Rechazos baratos previos al solver (§4.2.6). */
export function rejectReason(jars: PigmentId[][], capacity: number): string | null {
  for (const j of jars) if (j.length > 0 && isJarUniform(j)) return 'frasco inicial uniforme';
  if (isSolved({ jars, capacity, moveCount: 0, drying: {} })) return 'ya resuelto';
  const seen = new Set<string>();
  for (const j of jars) {
    if (j.length === 0) continue;
    const key = j.join(',');
    if (seen.has(key)) return 'dos frascos idénticos';
    seen.add(key);
  }
  return null;
}

function tryParams(
  level: number,
  params: LevelParams,
  cfg: DifficultyConfig,
  palette: PigmentId[],
  state: { attempts: number; best: GeneratedLevel | null },
): GeneratedLevel | null {
  const [parMin, parMax] = params.par;
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    const seed = level * 1000 + state.attempts;
    state.attempts++;
    const rng = createRng(seed);
    const pigmentCount = rng.int(params.pigments[0], params.pigments[1]);
    const empties = rng.int(params.empties[0], params.empties[1]);
    const pigments = pickPigments(rng, pigmentCount, palette);
    const cand = buildSortCandidate(rng, pigments, empties, cfg.capacity, seed);
    if (rejectReason(cand.jars, cfg.capacity)) continue;
    const result = solve(
      { jars: cand.jars, capacity: cfg.capacity, rules: cand.rules },
      { maxStates: cfg.solver.maxStates, maxMs: cfg.solver.maxMs },
    );
    if (!result.solvable) continue;
    const def: LevelDef = {
      id: level,
      capacity: cfg.capacity,
      jars: cand.jars,
      par: result.par,
      difficulty: estimateDifficulty(result.par, cand.rules.mixes.length, cand.rules.drying.length),
      rules: cand.rules,
      handmade: false,
      seed,
    };
    const gen: GeneratedLevel = { def, solver: result, attempts: state.attempts, warnings: [] };
    if (result.par >= parMin && result.par <= parMax) return gen;
    // Guardar el candidato cuyo par queda más cerca del rango, por si nada encaja.
    const dist = result.par < parMin ? parMin - result.par : result.par - parMax;
    const bestDist =
      state.best === null
        ? Infinity
        : state.best.def.par < parMin
          ? parMin - state.best.def.par
          : state.best.def.par - parMax;
    if (dist < bestDist) state.best = gen;
  }
  return null;
}

/**
 * Genera el nivel N (§4.2). Determinista: `seed = N * 1000 + intento`.
 * Si tras `maxAttempts` no hay candidato en rango, baja un escalón y registra warning.
 */
export function generateLevel(level: number, options: GeneratorOptions = {}): GeneratedLevel {
  const cfg = options.config ?? difficultyConfig;
  const palette = options.palette ?? allPigmentIds();
  const params = paramsForLevel(level, cfg);
  const state = { attempts: 0, best: null as GeneratedLevel | null };

  const direct = tryParams(level, params, cfg, palette, state);
  if (direct) return direct;

  const warnings = [
    `nivel ${level}: sin candidato en rango de par tras ${state.attempts} intentos`,
  ];
  const easier = easierParams(params, cfg);
  if (easier.rowIndex !== params.rowIndex) {
    const fallback = tryParams(level, easier, cfg, palette, state);
    if (fallback) {
      fallback.warnings.push(...warnings, `nivel ${level}: generado un escalón más fácil`);
      return fallback;
    }
  }
  if (state.best) {
    state.best.warnings.push(
      ...warnings,
      `nivel ${level}: par fuera de rango (${state.best.def.par})`,
    );
    return state.best;
  }
  throw new Error(`No se pudo generar el nivel ${level}`);
}
