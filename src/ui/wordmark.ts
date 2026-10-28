import Phaser from 'phaser';
import { getPigment } from '../core/pigments';
import { FONT } from './theme';

/**
 * Wordmark "Pigmento" (B8): cada letra de un pigmento distinto y una gota de pintura en
 * lugar del punto de la "i". Versión Phaser (splash, galería) y versión canvas 2D (imagen
 * para compartir), con la misma composición.
 */
const LETTERS: Array<{ ch: string; pigment: string }> = [
  { ch: 'P', pigment: 'red' },
  { ch: 'ı', pigment: 'orange' }, // i sin punto: el punto es la gota
  { ch: 'g', pigment: 'yellow' },
  { ch: 'm', pigment: 'green' },
  { ch: 'e', pigment: 'teal' },
  { ch: 'n', pigment: 'blue' },
  { ch: 't', pigment: 'purple' },
  { ch: 'o', pigment: 'pink' },
];
const DROP_PIGMENT = 'sky';

function dropPath2D(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  // Gota: círculo abajo y punta arriba
  ctx.beginPath();
  ctx.moveTo(x, y - r * 2.1);
  ctx.bezierCurveTo(x + r * 0.35, y - r * 1.2, x + r, y - r * 0.6, x + r, y);
  ctx.arc(x, y, r, 0, Math.PI, false);
  ctx.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.35, y - r * 1.2, x, y - r * 2.1);
  ctx.closePath();
}

/** Dibuja el wordmark centrado en (cx, cy) en un contexto 2D. */
export function drawWordmark2D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
): void {
  ctx.save();
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const widths = LETTERS.map((l) => ctx.measureText(l.ch).width);
  const spacing = size * 0.01;
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (LETTERS.length - 1);
  let x = cx - total / 2;
  const base = cy + size * 0.32;
  LETTERS.forEach((l, i) => {
    const hex = getPigment(l.pigment).hex;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(l.ch, x + size * 0.03, base + size * 0.04);
    ctx.fillStyle = hex;
    ctx.fillText(l.ch, x, base);
    if (l.ch === 'ı') {
      const r = size * 0.085;
      dropPath2D(ctx, x + widths[i] / 2, base - size * 0.72, r);
      ctx.fillStyle = getPigment(DROP_PIGMENT).hex;
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(x + widths[i] / 2 - r * 0.35, base - size * 0.72 - r * 0.1, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    x += widths[i] + spacing;
  });
  ctx.restore();
}

/** Wordmark como imagen (textura generada una vez por tamaño). */
export function addWordmark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
): Phaser.GameObjects.Image {
  const key = `wordmark-${size}`;
  if (!scene.textures.exists(key)) {
    const w = Math.round(size * 5.2);
    const h = Math.round(size * 1.5);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) drawWordmark2D(ctx, w / 2, h / 2, size);
    scene.textures.addCanvas(key, canvas);
  }
  return scene.add.image(x, y, key);
}
