import type Phaser from 'phaser';
import { canvasTexture, texRng } from './canvasTex';

/**
 * Atril de madera realista (dos texturas): la parte de atrás (patas, pata trasera,
 * travesaño) va detrás del cuadro; la bandeja donde se apoya el lienzo y la pinza superior
 * van delante. Madera clara con degradado cilíndrico, vetas y tornillos.
 */
export const EASEL_W = 640;
export const EASEL_H = 760;

const WOOD_LIGHT = '#F0C58A';
const WOOD = '#D29A5A';
const WOOD_DARK = '#9C6533';

function plank(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  seed: number,
  shade = 0,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1 + nx, y1 + ny);
  ctx.lineTo(x2 + nx, y2 + ny);
  ctx.lineTo(x2 - nx, y2 - ny);
  ctx.lineTo(x1 - nx, y1 - ny);
  ctx.closePath();
  // Degradado a lo ancho: volumen redondeado, luz desde la izquierda
  const g = ctx.createLinearGradient(x1 + nx, y1 + ny, x1 - nx, y1 - ny);
  g.addColorStop(0, WOOD_DARK);
  g.addColorStop(0.3, WOOD);
  g.addColorStop(0.55, WOOD_LIGHT);
  g.addColorStop(1, WOOD_DARK);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  // Vetas a lo largo
  const rnd = texRng(seed);
  for (let i = 0; i < 9; i++) {
    const t = (rnd() - 0.5) * 0.8;
    const wob = 1 + rnd() * 2.5;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(110,60,20,0.28)' : 'rgba(255,230,190,0.25)';
    ctx.lineWidth = 0.8 + rnd() * 1.2;
    ctx.beginPath();
    for (let s = 0; s <= 20; s++) {
      const u = s / 20;
      const off = t * width + Math.sin(u * 12 + i) * wob;
      const px = x1 + dx * u + (nx / (width / 2)) * off;
      const py = y1 + dy * u + (ny / (width / 2)) * off;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (shade !== 0) {
    ctx.fillStyle = shade > 0 ? `rgba(255,255,255,${shade})` : `rgba(40,20,5,${-shade})`;
    ctx.fillRect(0, 0, EASEL_W, EASEL_H);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(80,45,15,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1 + nx, y1 + ny);
  ctx.lineTo(x2 + nx, y2 + ny);
  ctx.moveTo(x1 - nx, y1 - ny);
  ctx.lineTo(x2 - nx, y2 - ny);
  ctx.stroke();
}

function screw(ctx: CanvasRenderingContext2D, x: number, y: number, r = 6): void {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
  g.addColorStop(0, '#F4F1EA');
  g.addColorStop(1, '#8F8A80');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,55,50,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.6, y);
  ctx.lineTo(x + r * 0.6, y);
  ctx.stroke();
}

/** Patas y travesaño (detrás del cuadro). Origen: centro arriba de la textura. */
export function easelBackKey(scene: Phaser.Scene): string {
  return canvasTexture(scene, 'easel-back', EASEL_W, EASEL_H, (ctx) => {
    const cx = EASEL_W / 2;
    // Sombra en el piso
    const sh = ctx.createRadialGradient(cx, EASEL_H - 22, 10, cx, EASEL_H - 22, 260);
    sh.addColorStop(0, 'rgba(40,20,60,0.25)');
    sh.addColorStop(1, 'rgba(40,20,60,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(cx, EASEL_H - 22, 270, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pata trasera (más oscura, va hacia atrás)
    plank(ctx, cx, 30, cx + 24, EASEL_H - 30, 26, 3, -0.22);
    // Patas delanteras abiertas
    plank(ctx, cx - 40, 8, cx - 225, EASEL_H - 14, 34, 7);
    plank(ctx, cx + 40, 8, cx + 225, EASEL_H - 14, 34, 11);
    // Cabezal donde se unen
    plank(ctx, cx - 46, 22, cx + 46, 22, 30, 5);
    screw(ctx, cx, 22, 7);
    // Travesaño inferior
    plank(ctx, cx - 205, EASEL_H - 150, cx + 205, EASEL_H - 150, 22, 13, -0.08);
    screw(ctx, cx - 186, EASEL_H - 150);
    screw(ctx, cx + 186, EASEL_H - 150);
  });
}

/**
 * Bandeja donde se apoya el lienzo y pinza superior (delante del cuadro).
 * `trayY` y `clampY` son las alturas dentro de la textura (mismo marco que la de atrás).
 */
export function easelFrontKey(scene: Phaser.Scene, trayY: number, clampY: number): string {
  return canvasTexture(scene, `easel-front-${trayY}-${clampY}`, EASEL_W, EASEL_H, (ctx) => {
    const cx = EASEL_W / 2;
    // Bandeja: cara superior + frente + sombra
    const tw = 470;
    ctx.fillStyle = 'rgba(40,20,5,0.25)';
    ctx.fillRect(cx - tw / 2 + 6, trayY + 26, tw, 10);
    const top = ctx.createLinearGradient(0, trayY - 10, 0, trayY + 6);
    top.addColorStop(0, WOOD_LIGHT);
    top.addColorStop(1, WOOD);
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(cx - tw / 2 + 10, trayY - 12);
    ctx.lineTo(cx + tw / 2 - 10, trayY - 12);
    ctx.lineTo(cx + tw / 2, trayY + 4);
    ctx.lineTo(cx - tw / 2, trayY + 4);
    ctx.closePath();
    ctx.fill();
    plank(ctx, cx - tw / 2, trayY + 15, cx + tw / 2, trayY + 15, 24, 17);
    // Labio delantero de la bandeja
    ctx.fillStyle = 'rgba(255,240,210,0.6)';
    ctx.fillRect(cx - tw / 2 + 4, trayY + 3, tw - 8, 2);
    // Un par de tubos de pintura y un pincel sobre la bandeja (detalle de taller)
    const tube = (x: number, color: string) => {
      ctx.fillStyle = '#E9E6EE';
      ctx.beginPath();
      ctx.moveTo(x, trayY - 22);
      ctx.lineTo(x + 46, trayY - 18);
      ctx.lineTo(x + 46, trayY - 6);
      ctx.lineTo(x, trayY - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(x + 10, trayY - 19, 20, 14);
      ctx.fillStyle = '#4A4458';
      ctx.fillRect(x + 46, trayY - 16, 9, 8);
    };
    tube(cx - 200, '#FF4F81');
    tube(cx - 140, '#1B9BE0');
    ctx.strokeStyle = '#7A4A26';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + 90, trayY - 6);
    ctx.lineTo(cx + 200, trayY - 14);
    ctx.stroke();
    ctx.fillStyle = '#C9CED6';
    ctx.fillRect(cx + 196, trayY - 18, 12, 8);
    ctx.fillStyle = '#FFC83A';
    ctx.beginPath();
    ctx.ellipse(cx + 214, trayY - 14, 9, 4, -0.1, 0, Math.PI * 2);
    ctx.fill();
    // Pinza superior
    plank(ctx, cx - 60, clampY, cx + 60, clampY, 22, 19);
    plank(ctx, cx, clampY - 26, cx, clampY + 8, 18, 23, -0.05);
    screw(ctx, cx, clampY, 6);
  });
}
