import galleryData from '../data/gallery.json';
import { getPigment } from './pigments';
import { createRng } from './rng';
import type { PigmentId } from './types';

/**
 * Cuadros procedurales (§7.3): paisajes geométricos originales generados a partir de la
 * semilla de la decena y la paleta de pigmentos de esos niveles. Este módulo solo devuelve
 * una descripción (formas en coordenadas 0–1); `PaintingCanvas` la dibuja.
 */
export type ShapeKind = 'rect' | 'circle' | 'triangle' | 'ellipse';

export interface Shape {
  kind: ShapeKind;
  x: number; // centro (0–1)
  y: number;
  w: number; // tamaño relativo al lienzo (0–1)
  h: number;
  color: string; // hex
  alpha?: number;
}

/** Región con sentido del cuadro (B6): se revela entera con una pincelada. */
export interface PaintingRegion {
  /** Clave i18n del nombre de la región (`painting.region.<key>`). */
  key: RegionKey;
  shapes: Shape[];
}

export type RegionKey =
  | 'sky'
  | 'sun'
  | 'clouds'
  | 'farMountains'
  | 'mountains'
  | 'water'
  | 'hills'
  | 'meadow'
  | 'trees'
  | 'houses';

export const REGION_ORDER: RegionKey[] = [
  'sky',
  'sun',
  'clouds',
  'farMountains',
  'mountains',
  'water',
  'hills',
  'meadow',
  'trees',
  'houses',
];

export interface PaintingSpec {
  id: number;
  seed: number;
  /** Clave i18n del título (`painting.title.N`); la UI la traduce. */
  titleKey: string;
  background: string;
  /** 10 regiones en orden de dibujo (de atrás hacia adelante); cada nivel revela una. */
  regions: PaintingRegion[];
  /** Todas las formas en orden de dibujo (para miniaturas y la imagen de compartir). */
  shapes: Shape[];
  palette: string[];
}

/** Rectángulo (en píxeles) que ocupa una forma dibujada en un lienzo w×h. */
export function shapeBoundsPx(
  s: Shape,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const cx = s.x * w;
  const cy = s.y * h;
  const hw = (s.w * w) / 2;
  const hh = s.kind === 'circle' ? hw : (s.h * h) / 2;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
}

/** Unión de los rectángulos de las formas de una región, recortada al lienzo. */
export function regionBoundsPx(
  r: PaintingRegion,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of r.shapes) {
    const b = shapeBoundsPx(s, w, h);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  return {
    x0: Math.max(0, Math.floor(x0) - 2),
    y0: Math.max(0, Math.floor(y0) - 2),
    x1: Math.min(w, Math.ceil(x1) + 2),
    y1: Math.min(h, Math.ceil(y1) + 2),
  };
}

/** Regiones reveladas para un porcentaje pintado (10 % por región). */
export function regionsRevealed(percent: number): number {
  return Math.max(0, Math.min(REGION_ORDER.length, Math.floor(percent / 10 + 1e-9)));
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Aclara (f > 0) u oscurece (f < 0) un color hex. */
export function shadeHex(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = f > 0 ? 255 : 0;
  const k = Math.abs(f);
  return rgbToHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}

/** Cantidad de títulos disponibles en i18n (`painting.title.0` … `painting.title.N-1`). */
export const PAINTING_TITLE_COUNT = 10;

/** Índice de cuadro (decena) para un nivel. */
export function paintingIndexFor(level: number): number {
  return Math.floor((level - 1) / galleryData.levelsPerPainting);
}

/** Porcentaje pintado de un cuadro según cuántos niveles de su decena se ganaron. */
export function revealPercent(levelsWonInDecade: number): number {
  return Math.min(100, levelsWonInDecade * galleryData.revealPerLevel);
}

/**
 * Genera la descripción del cuadro `index` con los pigmentos indicados (ids). Determinista.
 */
export function generatePainting(index: number, pigments: PigmentId[]): PaintingSpec {
  const seed = 7919 * (index + 1);
  const rng = createRng(seed);
  const ids = pigments.length > 0 ? [...pigments] : ['blue', 'yellow', 'red'];
  const base = ids.map((p) => getPigment(p).hex);
  const palette = rng.shuffle([...base]);
  const pick = (i: number) => palette[i % palette.length];
  const regions: Record<RegionKey, Shape[]> = {
    sky: [],
    sun: [],
    clouds: [],
    farMountains: [],
    mountains: [],
    water: [],
    hills: [],
    meadow: [],
    trees: [],
    houses: [],
  };
  const HORIZON = 0.6;

  // 0 · Cielo: bandas horizontales degradadas
  const sky = pick(0);
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    regions.sky.push({
      kind: 'rect',
      x: 0.5,
      y: (i + 0.5) * (HORIZON / bands),
      w: 1,
      h: HORIZON / bands + 0.01,
      color: shadeHex(sky, 0.62 - t * 0.42),
    });
  }
  // 1 · Sol con halo
  const sun = pick(1);
  const sunX = 0.18 + rng.next() * 0.64;
  const sunY = 0.14 + rng.next() * 0.14;
  const sunR = 0.12 + rng.next() * 0.06;
  regions.sun.push({
    kind: 'circle',
    x: sunX,
    y: sunY,
    w: sunR * 1.7,
    h: 0,
    color: shadeHex(sun, 0.55),
    alpha: 0.45,
  });
  regions.sun.push({ kind: 'circle', x: sunX, y: sunY, w: sunR, h: 0, color: shadeHex(sun, 0.2) });
  // 2 · Nubes: grupos de elipses claras
  const clouds = 2 + rng.int(0, 1);
  for (let c = 0; c < clouds; c++) {
    const cx = 0.12 + rng.next() * 0.76;
    const cy = 0.08 + rng.next() * 0.22;
    const cw = 0.16 + rng.next() * 0.1;
    const col = shadeHex(pick(2), 0.82);
    regions.clouds.push({ kind: 'ellipse', x: cx, y: cy + 0.015, w: cw, h: 0.045, color: col });
    regions.clouds.push({
      kind: 'ellipse',
      x: cx - cw * 0.2,
      y: cy,
      w: cw * 0.5,
      h: 0.05,
      color: col,
    });
    regions.clouds.push({
      kind: 'ellipse',
      x: cx + cw * 0.15,
      y: cy - 0.01,
      w: cw * 0.55,
      h: 0.06,
      color: col,
    });
  }
  // 3 · Montañas lejanas (claras)
  const mountain = pick(3);
  const far = 3 + rng.int(0, 1);
  for (let p = 0; p < far; p++) {
    const h = 0.16 + rng.next() * 0.14;
    regions.farMountains.push({
      kind: 'triangle',
      x: (p + 0.5) / far + (rng.next() - 0.5) * 0.12,
      y: HORIZON - h / 2,
      w: 0.38 + rng.next() * 0.22,
      h,
      color: shadeHex(mountain, 0.42),
    });
  }
  // 4 · Montañas cercanas (oscuras)
  const near = 2 + rng.int(0, 1);
  for (let p = 0; p < near; p++) {
    const h = 0.14 + rng.next() * 0.12;
    regions.mountains.push({
      kind: 'triangle',
      x: (p + 0.5) / near + (rng.next() - 0.5) * 0.18,
      y: HORIZON - h / 2 + 0.01,
      w: 0.42 + rng.next() * 0.2,
      h,
      color: shadeHex(mountain, -0.15 - p * 0.08),
    });
  }
  // 5 · Agua: lago con reflejos
  const water = shadeHex(sky, -0.05);
  regions.water.push({ kind: 'rect', x: 0.5, y: HORIZON + 0.06, w: 1, h: 0.12, color: water });
  for (let i = 0; i < 4; i++) {
    regions.water.push({
      kind: 'ellipse',
      x: 0.1 + rng.next() * 0.8,
      y: HORIZON + 0.02 + rng.next() * 0.08,
      w: 0.12 + rng.next() * 0.16,
      h: 0.008,
      color: shadeHex(water, 0.45),
    });
  }
  // 6 · Colinas
  const hill = pick(4);
  const hills = 3;
  for (let i = 0; i < hills; i++) {
    regions.hills.push({
      kind: 'ellipse',
      x: (i + 0.5) / hills + (rng.next() - 0.5) * 0.2,
      y: 0.78 + i * 0.012,
      w: 0.7 + rng.next() * 0.3,
      h: 0.14 + rng.next() * 0.04,
      color: shadeHex(hill, 0.18 - i * 0.12),
    });
  }
  // 7 · Pradera con flores
  const meadow = pick(5);
  regions.meadow.push({
    kind: 'rect',
    x: 0.5,
    y: 0.92,
    w: 1,
    h: 0.18,
    color: shadeHex(meadow, -0.3),
  });
  for (let i = 0; i < 9; i++) {
    regions.meadow.push({
      kind: 'circle',
      x: 0.04 + rng.next() * 0.92,
      y: 0.88 + rng.next() * 0.1,
      w: 0.018 + rng.next() * 0.012,
      h: 0,
      color: shadeHex(pick(6 + i), 0.25),
    });
  }
  // 8 · Árboles
  const trees = 3 + rng.int(0, 2);
  const treeCol = pick(6);
  for (let i = 0; i < trees; i++) {
    const x = 0.06 + rng.next() * 0.88;
    const y = 0.8 + rng.next() * 0.06;
    regions.trees.push({
      kind: 'rect',
      x,
      y: y + 0.045,
      w: 0.016,
      h: 0.07,
      color: shadeHex(treeCol, -0.65),
    });
    regions.trees.push({
      kind: 'triangle',
      x,
      y: y - 0.01,
      w: 0.08,
      h: 0.12,
      color: shadeHex(treeCol, -0.2),
    });
    regions.trees.push({
      kind: 'triangle',
      x,
      y: y - 0.045,
      w: 0.06,
      h: 0.08,
      color: shadeHex(treeCol, 0.05),
    });
  }
  // 9 · Casas (Encargo): 1–2 casas con techo y puerta
  const houses = 1 + rng.int(0, 1);
  const houseCol = pick(7);
  for (let i = 0; i < houses; i++) {
    const x = 0.25 + i * 0.45 + (rng.next() - 0.5) * 0.12;
    const y = 0.86;
    regions.houses.push({ kind: 'rect', x, y, w: 0.13, h: 0.09, color: shadeHex(houseCol, 0.45) });
    regions.houses.push({
      kind: 'triangle',
      x,
      y: y - 0.075,
      w: 0.16,
      h: 0.07,
      color: shadeHex(houseCol, -0.3),
    });
    regions.houses.push({
      kind: 'rect',
      x,
      y: y + 0.02,
      w: 0.03,
      h: 0.05,
      color: shadeHex(houseCol, -0.55),
    });
    regions.houses.push({
      kind: 'rect',
      x: x + 0.04,
      y: y - 0.01,
      w: 0.025,
      h: 0.022,
      color: shadeHex(sun, 0.4),
    });
  }

  const ordered: PaintingRegion[] = REGION_ORDER.map((key) => ({ key, shapes: regions[key] }));
  return {
    id: index,
    seed,
    titleKey: `painting.title.${index % PAINTING_TITLE_COUNT}`,
    background: shadeHex(sky, 0.6),
    regions: ordered,
    shapes: ordered.flatMap((r) => r.shapes),
    palette,
  };
}
