import creditsData from '../data/masterpieceCredits.json';
import masterpiecesData from '../data/masterpieces.json';
import { rgbToLab, type RGB } from './color';
import { getLevelDef } from './levels';
import { getRecipe } from './mixes';
import { getPigment } from './pigments';
import { createRng } from './rng';
import type { PigmentId } from './types';

/**
 * Cuadros de verdad (obras de dominio público). Cada decena de niveles pinta una obra.
 * La imagen se divide en "manchas" de color (k-means en Lab + posición, como un pinta-por-
 * números) y cada mancha se asigna a un (nivel, pigmento) de la decena por parecido de
 * color. Al completar en un nivel un frasco de ese pigmento, sus manchas se pintan.
 * Módulo puro: recibe píxeles, devuelve etiquetas y asignaciones; la escena dibuja.
 */
export interface Masterpiece {
  id: string;
  /** Archivo exacto en Wikimedia Commons, o `search` para que el workflow lo busque. */
  file?: string;
  search?: string;
  title: { es: string; en: string };
  artist: string;
  year: string;
}

export interface MasterpieceCredit {
  width: number;
  height: number;
  license: string;
  file?: string;
  source: string;
}

export interface SegmentsConfig {
  min: number;
  max: number;
  iterations: number;
  /** Peso de la posición frente al color (en unidades Lab por ancho de imagen). */
  spatialWeight: number;
  smoothPasses: number;
}

/** Aspecto en pantalla: boceto en acuarela (lo pendiente) y realce de lo ya pintado. */
export interface LookConfig {
  /** Cuánto color de la obra lleva el boceto (0 = papel, 1 = obra). */
  sketchColor: number;
  /** Saturación del color del boceto (0 = gris). */
  sketchSaturation: number;
  /** Fuerza de los trazos de lápiz en los bordes. */
  edgeStrength: number;
  /** Realce de saturación de lo pintado (1 = sin cambio). */
  vibrance: number;
  contrast: number;
}

interface MasterpiecesFile {
  source: string;
  displayMaxPx: number;
  analysisWidthPx: number;
  segments: SegmentsConfig;
  look: LookConfig;
  paintings: Masterpiece[];
}

export const masterpiecesConfig = masterpiecesData as MasterpiecesFile;
const credits = creditsData as Record<string, MasterpieceCredit>;

/** Obras con imagen descargada (las demás se ignoran hasta que existan). */
export function availableMasterpieces(
  list: readonly Masterpiece[] = masterpiecesConfig.paintings,
  have: Record<string, unknown> = credits,
): Masterpiece[] {
  return list.filter((m) => have[m.id] !== undefined);
}

export function creditFor(id: string): MasterpieceCredit | undefined {
  return credits[id];
}

/** Obra que corresponde a un cuadro (decena); null si no hay ninguna imagen disponible. */
export function masterpieceFor(paintingIndex: number): Masterpiece | null {
  const list = availableMasterpieces();
  if (list.length === 0) return null;
  return list[((paintingIndex % list.length) + list.length) % list.length];
}

// ---------------------------------------------------------------------------------------
// Pigmentos "completables" de un nivel
// ---------------------------------------------------------------------------------------

/**
 * Pigmentos con los que el jugador puede llenar un frasco en un nivel: los del tablero
 * inicial (en orden de aparición) más los productos de sus mezclas.
 */
export function levelPigments(levelId: number): PigmentId[] {
  const def = getLevelDef(levelId);
  if (!def) return [];
  const out: PigmentId[] = [];
  for (const jar of def.jars) for (const p of jar) if (!out.includes(p)) out.push(p);
  for (const id of def.rules.mixes) {
    const product = getRecipe(id).product;
    if (!out.includes(product)) out.push(product);
  }
  return out;
}

export interface Slot {
  level: number;
  pigment: PigmentId;
}

/** Ranuras de una decena: un (nivel, pigmento) por cada pigmento completable de cada nivel. */
export function decadeSlots(paintingIndex: number, levelsPerPainting: number): Slot[] {
  const slots: Slot[] = [];
  for (let k = 1; k <= levelsPerPainting; k++) {
    const level = paintingIndex * levelsPerPainting + k;
    for (const pigment of levelPigments(level)) slots.push({ level, pigment });
  }
  return slots;
}

// ---------------------------------------------------------------------------------------
// Segmentación (k-means en Lab + posición)
// ---------------------------------------------------------------------------------------

export interface Segmentation {
  width: number;
  height: number;
  /** Etiqueta de mancha por píxel (fila por fila). */
  labels: Uint16Array;
  /** Color medio (sRGB) de cada mancha. */
  colors: RGB[];
  /** Cantidad de píxeles de cada mancha. */
  areas: number[];
}

/**
 * Divide la imagen en `k` manchas de color coherentes. Determinista (semilla fija).
 * `rgba` es el buffer de un canvas (4 bytes por píxel).
 */
export function segmentImage(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  k: number,
  seed: number,
  cfg: SegmentsConfig = masterpiecesConfig.segments,
): Segmentation {
  const n = width * height;
  const F = 5;
  const feat = new Float32Array(n * F);
  const scale = Math.max(width, height);
  const sw = cfg.spatialWeight;
  for (let i = 0; i < n; i++) {
    const lab = rgbToLab([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
    const x = i % width;
    const y = (i / width) | 0;
    feat[i * F] = lab[0];
    feat[i * F + 1] = lab[1];
    feat[i * F + 2] = lab[2];
    feat[i * F + 3] = (x / scale) * sw;
    feat[i * F + 4] = (y / scale) * sw;
  }
  k = Math.max(1, Math.min(k, n));

  // Inicialización k-means++ sobre una muestra (determinista).
  const rng = createRng(seed);
  const centers = new Float32Array(k * F);
  const sampleStep = Math.max(1, Math.floor(n / 4000));
  const sample: number[] = [];
  for (let i = 0; i < n; i += sampleStep) sample.push(i);
  const first = sample[Math.floor(rng.next() * sample.length)];
  for (let f = 0; f < F; f++) centers[f] = feat[first * F + f];
  const dist = new Float64Array(sample.length).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let s = 0; s < sample.length; s++) {
      const i = sample[s];
      let d = 0;
      for (let f = 0; f < F; f++) {
        const v = feat[i * F + f] - centers[(c - 1) * F + f];
        d += v * v;
      }
      if (d < dist[s]) dist[s] = d;
      total += dist[s];
    }
    let r = rng.next() * total;
    let pick = sample[sample.length - 1];
    for (let s = 0; s < sample.length; s++) {
      r -= dist[s];
      if (r <= 0) {
        pick = sample[s];
        break;
      }
    }
    for (let f = 0; f < F; f++) centers[c * F + f] = feat[pick * F + f];
  }

  let labels: Uint16Array = new Uint16Array(n);
  const sums = new Float64Array(k * F);
  const counts = new Uint32Array(k);
  for (let it = 0; it < cfg.iterations; it++) {
    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let f = 0; f < F; f++) {
          const v = feat[i * F + f] - centers[c * F + f];
          d += v * v;
        }
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      labels[i] = best;
      counts[best]++;
      for (let f = 0; f < F; f++) sums[best * F + f] += feat[i * F + f];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let f = 0; f < F; f++) centers[c * F + f] = sums[c * F + f] / counts[c];
    }
  }

  // Suavizado: filtro de moda 3×3 para quitar píxeles sueltos.
  for (let pass = 0; pass < cfg.smoothPasses; pass++) labels = modeFilter(labels, width, height);

  // Compactar etiquetas (sin manchas vacías) y calcular color medio y área.
  const remap = new Int32Array(k).fill(-1);
  const colors: RGB[] = [];
  const acc: number[][] = [];
  const areas: number[] = [];
  for (let i = 0; i < n; i++) {
    const old = labels[i];
    if (remap[old] < 0) {
      remap[old] = colors.length;
      colors.push([0, 0, 0]);
      acc.push([0, 0, 0]);
      areas.push(0);
    }
    const c = remap[old];
    labels[i] = c;
    acc[c][0] += rgba[i * 4];
    acc[c][1] += rgba[i * 4 + 1];
    acc[c][2] += rgba[i * 4 + 2];
    areas[c]++;
  }
  for (let c = 0; c < colors.length; c++) {
    colors[c] = [acc[c][0] / areas[c], acc[c][1] / areas[c], acc[c][2] / areas[c]];
  }
  return { width, height, labels, colors, areas };
}

function modeFilter(labels: Uint16Array, w: number, h: number): Uint16Array {
  const out = new Uint16Array(labels.length);
  const votes = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      votes.clear();
      let best = labels[y * w + x];
      let bestV = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const l = labels[yy * w + xx];
          const v = (votes.get(l) ?? 0) + (dx === 0 && dy === 0 ? 1.5 : 1);
          votes.set(l, v);
          if (v > bestV) {
            bestV = v;
            best = l;
          }
        }
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Asignación mancha → ranura
// ---------------------------------------------------------------------------------------

/** Cantidad de manchas para una decena con `slotCount` ranuras (≈1,6 manchas por ranura). */
export function segmentCountFor(
  slotCount: number,
  cfg: SegmentsConfig = masterpiecesConfig.segments,
): number {
  return Math.max(cfg.min, Math.min(cfg.max, Math.round(slotCount * 1.6)));
}

/**
 * Asigna cada mancha a una ranura.
 * 1. Emparejamiento voraz global por parecido de color: cada ranura recibe una mancha
 *    (mientras alcancen), así todo frasco completado pinta algo.
 * 2. Las manchas sobrantes (de mayor a menor) van a la ranura de color más parecido entre
 *    los niveles que aún no superan su parte del área (`group` = nivel de cada ranura), para
 *    que cada nivel pinte una porción parecida del cuadro.
 * Devuelve el índice de ranura de cada mancha.
 */
export function assignSegments(
  colors: readonly RGB[],
  areas: readonly number[],
  slotColors: readonly RGB[],
  group: readonly number[] = slotColors.map(() => 0),
): Int16Array {
  const out = new Int16Array(colors.length).fill(-1);
  if (slotColors.length === 0) return out;
  const cl = colors.map((c) => rgbToLab(c));
  const sl = slotColors.map((c) => rgbToLab(c));
  const d = (a: number[], b: number[]) =>
    (a[0] - b[0]) ** 2 * 0.5 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const groupArea = new Map<number, number>();
  for (const g of group) groupArea.set(g, 0);
  const total = areas.reduce((a, v) => a + v, 0);
  const target = total / Math.max(1, groupArea.size);

  const pairs: { c: number; s: number; d: number }[] = [];
  for (let c = 0; c < cl.length; c++)
    for (let s = 0; s < sl.length; s++) pairs.push({ c, s, d: d(cl[c], sl[s]) });
  pairs.sort((a, b) => a.d - b.d || a.c - b.c || a.s - b.s);
  const slotTaken = new Uint8Array(sl.length);
  let freeSlots = sl.length;
  for (const p of pairs) {
    if (freeSlots === 0) break;
    if (out[p.c] >= 0 || slotTaken[p.s]) continue;
    out[p.c] = p.s;
    slotTaken[p.s] = 1;
    freeSlots--;
    groupArea.set(group[p.s], (groupArea.get(group[p.s]) ?? 0) + areas[p.c]);
  }
  const rest = [...cl.keys()]
    .filter((c) => out[c] < 0)
    .sort((a, b) => areas[b] - areas[a] || a - b);
  for (const c of rest) {
    // Parecido de color, pero con preferencia por los niveles que van más atrasados.
    let best = 0;
    let bestScore = Infinity;
    for (let s = 0; s < sl.length; s++) {
      const fill = (groupArea.get(group[s]) ?? 0) / target;
      const score = (d(cl[c], sl[s]) + 60) * (0.25 + fill * fill);
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    out[c] = best;
    groupArea.set(group[best], (groupArea.get(group[best]) ?? 0) + areas[c]);
  }
  return out;
}

/** Plan completo de una decena: ranuras y a qué ranura pertenece cada mancha. */
export interface DecadePlan {
  slots: Slot[];
  segmentSlot: Int16Array;
}

export function planDecade(
  seg: Pick<Segmentation, 'colors' | 'areas'>,
  paintingIndex: number,
  levelsPerPainting: number,
): DecadePlan {
  const slots = decadeSlots(paintingIndex, levelsPerPainting);
  const slotColors = slots.map((s) => hexRgb(getPigment(s.pigment).hex));
  const group = slots.map((s) => s.level);
  return { slots, segmentSlot: assignSegments(seg.colors, seg.areas, slotColors, group) };
}

/** Fracción del cuadro (por área) que pinta cada nivel de la decena. */
export function levelShares(
  seg: Pick<Segmentation, 'areas'>,
  plan: DecadePlan,
): Map<number, number> {
  const total = seg.areas.reduce((a, v) => a + v, 0);
  const m = new Map<number, number>();
  plan.segmentSlot.forEach((slot, c) => {
    const level = plan.slots[slot]?.level;
    if (level === undefined) return;
    m.set(level, (m.get(level) ?? 0) + seg.areas[c] / total);
  });
  return m;
}

function hexRgb(hex: string): RGB {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Semilla estable por obra (para que la división en manchas sea siempre la misma). */
export function seedFor(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Realza saturación y contraste de un buffer RGBA en sitio (colores más vivos). */
export function boostColors(px: Uint8ClampedArray, vibrance: number, contrast: number): void {
  for (let o = 0; o < px.length; o += 4) {
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    for (let c = 0; c < 3; c++) {
      const v = px[o + c];
      const sat = l + (v - l) * vibrance;
      px[o + c] = (sat - 128) * contrast + 128;
    }
  }
}
