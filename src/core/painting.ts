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

export interface Stroke {
  /** Banda diagonal en coordenadas 0–1: x de inicio en la parte superior y ancho. */
  x: number;
  w: number;
  slant: number;
}

export interface PaintingSpec {
  id: number;
  seed: number;
  title: string;
  background: string;
  shapes: Shape[];
  /** 10 pinceladas que revelan el cuadro de izquierda a derecha, con inclinación. */
  strokes: Stroke[];
  palette: string[];
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

const TITLES_ES = [
  'Amanecer en el taller',
  'Colinas de pigmento',
  'Marea de color',
  'Noche de esmalte',
  'Valle templado',
  'Sol de cadmio',
  'Costa de óxido',
  'Bosque de ultramar',
  'Campo abierto',
  'Luna de cerusa',
];

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

  const shapes: Shape[] = [];
  // Cielo: bandas horizontales degradadas a partir del primer color.
  const sky = pick(0);
  const bands = 4 + rng.int(0, 2);
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    shapes.push({
      kind: 'rect',
      x: 0.5,
      y: (t * 0.6) / 2 + (0.6 / bands) * 0.5 * 0,
      w: 1,
      h: 0.6 / bands + 0.01,
      color: shadeHex(sky, 0.55 - t * 0.45),
    });
    shapes[shapes.length - 1].y = (i + 0.5) * (0.6 / bands);
  }
  // Astro
  const sun = pick(1);
  shapes.push({
    kind: 'circle',
    x: 0.2 + rng.next() * 0.6,
    y: 0.14 + rng.next() * 0.2,
    w: 0.1 + rng.next() * 0.1,
    h: 0,
    color: shadeHex(sun, 0.25),
  });
  // Montañas: 2–3 capas de triángulos, de lejos (claro) a cerca (oscuro).
  const mountain = pick(2);
  const layers = 2 + rng.int(0, 1);
  for (let l = 0; l < layers; l++) {
    const depth = l / Math.max(1, layers - 1);
    const peaks = 2 + rng.int(0, 2);
    for (let p = 0; p < peaks; p++) {
      shapes.push({
        kind: 'triangle',
        x: (p + 0.5) / peaks + (rng.next() - 0.5) * 0.2,
        y: 0.62 - depth * 0.04,
        w: 0.35 + rng.next() * 0.3,
        h: 0.18 + rng.next() * 0.2 - depth * 0.05,
        color: shadeHex(mountain, 0.35 - depth * 0.55),
      });
    }
  }
  // Colinas: elipses anchas.
  const hill = pick(3);
  const hills = 2 + rng.int(0, 2);
  for (let i = 0; i < hills; i++) {
    shapes.push({
      kind: 'ellipse',
      x: rng.next(),
      y: 0.72 + i * 0.06,
      w: 0.7 + rng.next() * 0.5,
      h: 0.2 + rng.next() * 0.1,
      color: shadeHex(hill, 0.2 - i * 0.2),
    });
  }
  // Suelo
  shapes.push({ kind: 'rect', x: 0.5, y: 0.93, w: 1, h: 0.16, color: shadeHex(pick(4), -0.35) });
  // Árboles / casas pequeñas
  const accent = pick(5);
  const items = 3 + rng.int(0, 4);
  for (let i = 0; i < items; i++) {
    const x = 0.08 + rng.next() * 0.84;
    const y = 0.8 + rng.next() * 0.08;
    if (rng.next() < 0.6) {
      shapes.push({
        kind: 'rect',
        x,
        y: y + 0.04,
        w: 0.012,
        h: 0.07,
        color: shadeHex(accent, -0.6),
      });
      shapes.push({
        kind: 'triangle',
        x,
        y: y + 0.02,
        w: 0.07,
        h: 0.11,
        color: shadeHex(accent, -0.15),
      });
    } else {
      shapes.push({ kind: 'rect', x, y: y + 0.02, w: 0.07, h: 0.06, color: shadeHex(accent, 0.3) });
      shapes.push({
        kind: 'triangle',
        x,
        y: y - 0.03,
        w: 0.09,
        h: 0.05,
        color: shadeHex(accent, -0.3),
      });
    }
  }

  // Pinceladas: 10 bandas diagonales que cubren el lienzo de izquierda a derecha.
  const strokes: Stroke[] = [];
  const slant = 0.12 + rng.next() * 0.1;
  for (let i = 0; i < 10; i++) {
    strokes.push({ x: i / 10 - slant / 2, w: 0.1 + slant + 0.02, slant });
  }

  return {
    id: index,
    seed,
    title: TITLES_ES[index % TITLES_ES.length],
    background: shadeHex(sky, 0.6),
    shapes,
    strokes,
    palette,
  };
}
