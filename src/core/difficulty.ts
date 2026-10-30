import difficultyData from '../data/difficulty.json';

export interface DifficultyRow {
  from: number;
  to: number;
  pigments: [number, number];
  empties: [number, number];
  par: [number, number];
  mixes: [number, number];
  drying: [number, number];
  handmade?: boolean;
  note?: string;
}

export interface DryingMargin {
  from: number;
  to: number;
  extra: number;
}

export interface TeachConfig {
  mixLevel: number;
  dryingLevel: number;
  dryingTeachExtra: number;
}

export interface DifficultyConfig {
  capacity: number;
  breatherEvery: number;
  commissionEvery: number;
  maxAttempts: number;
  solver: { maxStates: number; maxMs: number };
  /** Presupuesto del solver para detectar partidas sin salida en juego. */
  deadEnd: { maxStates: number; maxMs: number; searchWhenMovesAtMost: number };
  dryingFuseMin: number;
  dryingMargin: DryingMargin[];
  teach: TeachConfig;
  rows: DifficultyRow[];
}

export interface LevelParams {
  level: number;
  rowIndex: number;
  pigments: [number, number];
  empties: [number, number];
  par: [number, number];
  mixes: [number, number];
  drying: [number, number];
  /** Nivel de respiro: un escalón más fácil (§4.3). */
  breather: boolean;
  /** Encargo: cada 10 niveles, completa el cuadro (§4.3, §7.3). */
  commission: boolean;
  /** La tabla lo declara hecho a mano. */
  handmadeRow: boolean;
}

export const difficultyConfig: DifficultyConfig = difficultyData as DifficultyConfig;

export function isHandmadeRow(row: DifficultyRow): boolean {
  return row.handmade === true || row.from === row.to;
}

export function rowIndexFor(level: number, cfg: DifficultyConfig = difficultyConfig): number {
  const idx = cfg.rows.findIndex((r) => level >= r.from && level <= r.to);
  if (idx < 0) throw new Error(`Sin fila de dificultad para el nivel ${level}`);
  return idx;
}

/**
 * Parámetros de generación para el nivel N según la tabla §4.3.
 * Respiro: cada `breatherEvery` niveles (que no sean Encargo) se usa la fila anterior.
 */
export function paramsForLevel(
  level: number,
  cfg: DifficultyConfig = difficultyConfig,
): LevelParams {
  if (!Number.isInteger(level) || level < 1) throw new Error(`Nivel inválido: ${level}`);
  const rowIndex = rowIndexFor(level, cfg);
  const commission = level % cfg.commissionEvery === 0;
  const handmadeRow = isHandmadeRow(cfg.rows[rowIndex]);
  let breather = !commission && !handmadeRow && level % cfg.breatherEvery === 0;
  if (breather) {
    // Un escalón más fácil, pero sin perder las reglas (mezclas/secado) que la fila enseña.
    // Las filas hechas a mano no sirven de escalón; si no hay fila anterior usable, no hay respiro.
    const own = cfg.rows[rowIndex];
    let prev = rowIndex - 1;
    while (prev >= 0 && isHandmadeRow(cfg.rows[prev])) prev--;
    if (prev >= 0) {
      const easier = cfg.rows[prev];
      return {
        level,
        rowIndex,
        pigments: [...easier.pigments],
        empties: [...own.empties],
        par: [...easier.par],
        mixes: [...own.mixes],
        drying: [...own.drying],
        breather,
        commission,
        handmadeRow,
      };
    }
    breather = false;
  }
  const row = cfg.rows[rowIndex];
  return {
    level,
    rowIndex,
    pigments: [...row.pigments],
    empties: [...row.empties],
    par: [...row.par],
    mixes: [...row.mixes],
    drying: [...row.drying],
    breather,
    commission,
    handmadeRow,
  };
}

/** Un escalón más fácil que los parámetros dados (para el reintento del generador, §4.2.8). */
export function easierParams(
  p: LevelParams,
  cfg: DifficultyConfig = difficultyConfig,
): LevelParams {
  let prev = p.rowIndex - 1;
  while (prev >= 0 && isHandmadeRow(cfg.rows[prev])) prev--;
  if (prev < 0) return p;
  const row = cfg.rows[prev];
  return { ...p, rowIndex: prev, pigments: [...row.pigments], par: [...row.par] };
}

/** Margen de la mecha de secado para un nivel (§6): F = movimientos del frasco + margen. */
export function dryingExtraFor(level: number, cfg: DifficultyConfig = difficultyConfig): number {
  const m = cfg.dryingMargin.find((x) => level >= x.from && level <= x.to);
  return m ? m.extra : (cfg.dryingMargin[cfg.dryingMargin.length - 1]?.extra ?? 2);
}

/**
 * Estimación de dificultad 1–10 a partir del par y las reglas activas.
 * Número de diseño simple y monótono; sirve para analytics y ordenar niveles.
 */
export function estimateDifficulty(par: number, mixes: number, dryingJars: number): number {
  const base = par / 7 + mixes * 0.5 + dryingJars * 1;
  return Math.max(1, Math.min(10, Math.round(base)));
}
