import type Phaser from 'phaser';
import { canvasTexture } from '../objects/canvasTex';
import { UI } from './theme';

/**
 * Íconos vectoriales dibujados por código (B7) en el color de texto del HUD.
 * Tamaño base 96 px; se escalan sin perder nitidez apreciable.
 */
export type IconName =
  'undo' | 'jarPlus' | 'restart' | 'pause' | 'gear' | 'palette' | 'gift' | 'share' | 'play';

const S = 96;

function arrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.6, -size * 0.8);
  ctx.lineTo(-size * 0.6, size * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const draw: Record<IconName, (ctx: CanvasRenderingContext2D) => void> = {
  undo: (ctx) => {
    // Flecha curva hacia la izquierda
    ctx.beginPath();
    ctx.arc(50, 56, 24, -Math.PI * 0.95, Math.PI * 0.55, false);
    ctx.stroke();
    arrowHead(ctx, 26, 50, -Math.PI * 0.42, 14);
  },
  restart: (ctx) => {
    ctx.beginPath();
    ctx.arc(48, 50, 26, -Math.PI * 0.35, Math.PI * 1.45, false);
    ctx.stroke();
    arrowHead(ctx, 70, 30, Math.PI * 0.25, 14);
  },
  jarPlus: (ctx) => {
    // Frasco con "+"
    ctx.beginPath();
    ctx.moveTo(30, 20);
    ctx.lineTo(30, 72);
    ctx.quadraticCurveTo(30, 82, 40, 82);
    ctx.lineTo(56, 82);
    ctx.quadraticCurveTo(66, 82, 66, 72);
    ctx.lineTo(66, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(24, 18);
    ctx.lineTo(72, 18);
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(48, 38);
    ctx.lineTo(48, 66);
    ctx.moveTo(34, 52);
    ctx.lineTo(62, 52);
    ctx.stroke();
  },
  pause: (ctx) => {
    ctx.fillRect(30, 24, 13, 48);
    ctx.fillRect(53, 24, 13, 48);
  },
  play: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(34, 22);
    ctx.lineTo(74, 48);
    ctx.lineTo(34, 74);
    ctx.closePath();
    ctx.fill();
  },
  gear: (ctx) => {
    ctx.save();
    ctx.translate(48, 48);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -36, 12, 16);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(48, 48, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(48, 48, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  palette: (ctx) => {
    // Paleta de pintor con agujero y gotas de color
    ctx.beginPath();
    ctx.moveTo(48, 14);
    ctx.bezierCurveTo(82, 14, 88, 46, 76, 60);
    ctx.bezierCurveTo(68, 70, 56, 60, 52, 70);
    ctx.bezierCurveTo(48, 82, 40, 84, 30, 80);
    ctx.bezierCurveTo(10, 72, 8, 40, 20, 26);
    ctx.bezierCurveTo(28, 18, 38, 14, 48, 14);
    ctx.closePath();
    ctx.fill();
    const dots: Array<[number, number, string]> = [
      [32, 34, '#C2161D'],
      [50, 28, '#FDF21F'],
      [66, 38, '#2057B6'],
      [28, 54, '#3C9F4D'],
    ];
    for (const [x, y, c] of dots) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  gift: (ctx) => {
    ctx.fillRect(20, 40, 56, 40);
    ctx.fillRect(16, 30, 64, 14);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(44, 30, 8, 50);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(38, 22, 10, 7, 0.4, 0, Math.PI * 2);
    ctx.ellipse(58, 22, 10, 7, -0.4, 0, Math.PI * 2);
    ctx.stroke();
  },
  share: (ctx) => {
    ctx.beginPath();
    ctx.moveTo(48, 14);
    ctx.lineTo(48, 58);
    ctx.stroke();
    arrowHead(ctx, 48, 16, -Math.PI / 2, 14);
    ctx.beginPath();
    ctx.moveTo(30, 40);
    ctx.lineTo(22, 40);
    ctx.lineTo(22, 80);
    ctx.lineTo(74, 80);
    ctx.lineTo(74, 40);
    ctx.lineTo(66, 40);
    ctx.stroke();
  },
};

/** Devuelve la clave de textura del ícono, generándola la primera vez. */
export function iconKey(
  scene: Phaser.Scene,
  name: IconName,
  color: string = UI.colors.text,
): string {
  return canvasTexture(scene, `icon-${name}-${color}`, S, S, (ctx) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    draw[name](ctx);
  });
}
