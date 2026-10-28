import {
  difficultyConfig,
  dryingExtraFor,
  easierParams,
  estimateDifficulty,
  paramsForLevel,
  type DifficultyConfig,
  type LevelParams,
} from './difficulty';
import { recipesUnlockedAt } from './mixes';
import { allPigmentIds, isDistinguishableSet } from './pigments';
import { createRng, type Rng } from './rng';
import { createState, isJarResolved, isJarUniform, isSolved, tryPour } from './rules';
import { solve, type SolverResult } from './solver';
import type { DryingRule, LevelDef, LevelRules, MixRecipe, PigmentId, Pour } from './types';

export interface GeneratorOptions {
  config?: DifficultyConfig;
  /** Pigmentos disponibles (por defecto, todos los de pigments.json). */
  palette?: PigmentId[];
  /** Diagnóstico: se llama por intento con el motivo del rechazo o 'ok'. */
  onAttempt?: (info: {
    seed: number;
    outcome: string;
    ms: number;
    par?: number;
    jars: PigmentId[][];
    rules: LevelRules;
  }) => void;
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

/** Elige C pigmentos distinguibles entre sí con el RNG dado, incluyendo los `required`. */
export function pickPigments(
  rng: Rng,
  count: number,
  palette: PigmentId[],
  required: PigmentId[] = [],
): PigmentId[] {
  const rest = palette.filter((p) => !required.includes(p));
  for (let attempt = 0; attempt < 20; attempt++) {
    const pool = rng.shuffle([...rest]);
    const chosen = [...required, ...pool.slice(0, Math.max(0, count - required.length))];
    if (isDistinguishableSet(chosen)) return chosen;
  }
  // Último recurso determinista: quitar el segundo miembro de cada par conflictivo.
  const pool = rng.shuffle([...rest]);
  const chosen: PigmentId[] = [...required];
  for (const p of pool) {
    if (chosen.length >= count) break;
    if (isDistinguishableSet([...chosen, p])) chosen.push(p);
  }
  return chosen;
}

/**
 * Elige las recetas del nivel entre las desbloqueadas (§5.2). Las recetas elegidas no se
 * encadenan (el producto de una no es reactivo de otra) para acotar el espacio de estados.
 */
function pickRecipes(rng: Rng, level: number, wanted: number): MixRecipe[] {
  const unlocked = rng.shuffle([...recipesUnlockedAt(level)]);
  const chosen: MixRecipe[] = [];
  for (const r of unlocked) {
    if (chosen.length >= wanted) break;
    const used = new Set(chosen.flatMap((c) => [...c.reagents, c.product]));
    if (used.has(r.product) || r.reagents.some((x) => used.has(x))) continue;
    chosen.push(r);
  }
  return chosen;
}

/**
 * Reparte las capas barajadas en C frascos llenos y agrega E vacíos. Con mezclas (§5.3)
 * se parte del estado resuelto y se reemplazan pares de producto por sus reactivos.
 */
function buildCandidate(
  rng: Rng,
  pigments: PigmentId[],
  recipes: MixRecipe[],
  empties: number,
  capacity: number,
  seed: number,
): Candidate {
  const layers: PigmentId[] = [];
  for (const p of pigments) for (let i = 0; i < capacity; i++) layers.push(p);
  for (const r of recipes) {
    const pairs = rng.int(1, Math.floor(capacity / 2));
    for (let k = 0; k < pairs; k++) {
      // 2 capas de producto → 1 de cada reactivo (conservación de volumen).
      const a = layers.indexOf(r.product);
      const b = layers.indexOf(r.product, a + 1);
      if (a < 0 || b < 0) break;
      layers[a] = r.reagents[0];
      layers[b] = r.reagents[1];
    }
  }
  rng.shuffle(layers);
  const jars: PigmentId[][] = [];
  for (let i = 0; i < pigments.length; i++) {
    jars.push(layers.slice(i * capacity, (i + 1) * capacity));
  }
  for (let i = 0; i < empties; i++) jars.push([]);
  return { jars, rules: { mixes: recipes.map((r) => r.id), drying: [] }, seed };
}

/**
 * Índice del movimiento (1-based) en que cada frasco queda resuelto por primera vez
 * siguiendo la solución; -1 si nunca (no debería ocurrir) o 0 si ya lo estaba.
 */
export function resolutionIndex(
  def: Pick<LevelDef, 'jars' | 'capacity' | 'rules'>,
  solution: Pour[],
): number[] {
  let state = createState(def);
  const idx: number[] = state.jars.map((j) => (isJarResolved(j, state.capacity) ? 0 : -1));
  solution.forEach((m, k) => {
    const r = tryPour(state, m.from, m.to, { mixes: def.rules.mixes, drying: [] });
    if (!r.ok) throw new Error('solución inválida');
    state = r.next;
    state.jars.forEach((j, i) => {
      if (idx[i] === -1 && isJarResolved(j, state.capacity)) idx[i] = k + 1;
    });
  });
  return idx;
}

/**
 * Secado (§6): marca como abiertos los frascos que más movimientos requieren según el
 * solver y fija `F = movimientos_de_ese_frasco + margen(nivel)` (mínimo `dryingFuseMin`).
 */
export function chooseDrying(
  def: Pick<LevelDef, 'jars' | 'capacity' | 'rules'>,
  solution: Pour[],
  count: number,
  cfg: DifficultyConfig,
  extra: number,
): DryingRule[] {
  if (count <= 0) return [];
  const idx = resolutionIndex(def, solution);
  const candidates = idx
    .map((v, jar) => ({ jar, v }))
    .filter((c) => c.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, count);
  return candidates.map((c) => ({
    jar: c.jar,
    fuse: Math.max(cfg.dryingFuseMin, c.v + extra),
  }));
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
  onAttempt?: GeneratorOptions['onAttempt'],
): GeneratedLevel | null {
  const [parMin, parMax] = params.par;
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    const seed = level * 1000 + state.attempts;
    state.attempts++;
    const t0 = Date.now();
    let candRef: Candidate | null = null;
    const report = (outcome: string, par?: number) =>
      onAttempt?.({
        seed,
        outcome,
        ms: Date.now() - t0,
        par,
        jars: candRef?.jars ?? [],
        rules: candRef?.rules ?? { mixes: [], drying: [] },
      });
    const rng = createRng(seed);
    const pigmentCount = rng.int(params.pigments[0], params.pigments[1]);
    const empties = rng.int(params.empties[0], params.empties[1]);
    const recipes = pickRecipes(rng, level, rng.int(params.mixes[0], params.mixes[1]));
    const products = recipes.map((r) => r.product);
    // Los reactivos no son pigmentos propios del nivel: solo aparecen por los pares
    // reemplazados (§5.3). Así cada mezcla posible es significativa y el solver no explota.
    const reagents = new Set(recipes.flatMap((r) => r.reagents));
    const usable = palette.filter((p) => !reagents.has(p));
    const pigments = pickPigments(rng, pigmentCount, usable, products);
    const cand = buildCandidate(rng, pigments, recipes, empties, cfg.capacity, seed);
    candRef = cand;
    const reject = rejectReason(cand.jars, cfg.capacity);
    if (reject) {
      report(reject);
      continue;
    }
    const dryCount = rng.int(params.drying[0], params.drying[1]);
    let result = solve(
      { jars: cand.jars, capacity: cfg.capacity, rules: cand.rules },
      { maxStates: cfg.solver.maxStates, maxMs: cfg.solver.maxMs, withSolution: dryCount > 0 },
    );
    if (!result.solvable) {
      report(result.verified ? 'irresoluble' : 'no verificable');
      continue;
    }
    if (dryCount > 0 && result.solution) {
      const def0 = { jars: cand.jars, capacity: cfg.capacity, rules: cand.rules };
      cand.rules = {
        mixes: cand.rules.mixes,
        drying: chooseDrying(def0, result.solution, dryCount, cfg, dryingExtraFor(level, cfg)),
      };
      result = solve(
        { jars: cand.jars, capacity: cfg.capacity, rules: cand.rules },
        { maxStates: cfg.solver.maxStates, maxMs: cfg.solver.maxMs },
      );
      if (!result.solvable) {
        report(result.verified ? 'irresoluble con secado' : 'no verificable con secado');
        continue;
      }
    }
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
    report(result.par >= parMin && result.par <= parMax ? 'ok' : 'par fuera de rango', result.par);
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

  const direct = tryParams(level, params, cfg, palette, state, options.onAttempt);
  if (direct) return direct;

  const warnings = [
    `nivel ${level}: sin candidato en rango de par tras ${state.attempts} intentos`,
  ];
  const easier = easierParams(params, cfg);
  if (easier.rowIndex !== params.rowIndex) {
    const fallback = tryParams(level, easier, cfg, palette, state, options.onAttempt);
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
