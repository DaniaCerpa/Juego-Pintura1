import type Phaser from 'phaser';
import { getPigment } from '../core/pigments';
import type { PigmentId } from '../core/types';
import { COLORS } from '../ui/theme';
import { canvasTexture, rgba, roundRectPath, shadeHexStr, texRng } from './canvasTex';

/**
 * Texturas de pintura (B3), generadas una vez por pigmento o por ancho de frasco:
 *  - paint-<id>: cuerpo de un bloque: gradiente vertical sutil + brillo especular a la
 *    izquierda + sombra a la derecha (se estira al tamaño del bloque).
 *  - paintcap-<w>-<id>: base del bloque inferior con las esquinas redondeadas del frasco.
 *  - menisc-<id>: menisco curvo de la superficie superior.
 *  - crust-<w>, cracks-<w>: costra de secado y grietas (B5).
 *  - cork-<w>: tapa de corcho (frasco completado).
 *  - glass-<w>, glassfront-<w>: vidrio (detrás y delante de la pintura).
 */
const PAINT_TEX_H = 256;
const PAINT_TEX_W = 48;

function paintBodyGradient(ctx: CanvasRenderingContext2D, hex: string, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shadeHexStr(hex, 0.14));
  g.addColorStop(0.45, hex);
  g.addColorStop(1, shadeHexStr(hex, -0.2));
  return g;
}

function specular(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Brillo especular en el borde izquierdo y sombra suave a la derecha (volumen cilíndrico).
  const s = ctx.createLinearGradient(0, 0, w, 0);
  s.addColorStop(0, 'rgba(255,255,255,0.05)');
  s.addColorStop(0.1, 'rgba(255,255,255,0.38)');
  s.addColorStop(0.2, 'rgba(255,255,255,0.08)');
  s.addColorStop(0.55, 'rgba(255,255,255,0)');
  s.addColorStop(0.85, 'rgba(0,0,0,0.06)');
  s.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = s;
  ctx.fillRect(0, 0, w, h);
}

export function paintKey(scene: Phaser.Scene, id: PigmentId): string {
  const hex = getPigment(id).hex;
  return canvasTexture(scene, `paint-${id}`, PAINT_TEX_W, PAINT_TEX_H, (ctx, w, h) => {
    ctx.fillStyle = paintBodyGradient(ctx, hex, h);
    ctx.fillRect(0, 0, w, h);
    specular(ctx, w, h);
  });
}

/** Base redondeada del bloque inferior (color del extremo oscuro del gradiente). */
export function paintCapKey(
  scene: Phaser.Scene,
  jarW: number,
  innerW: number,
  capH: number,
  id: PigmentId,
): string {
  const hex = getPigment(id).hex;
  const r = Math.min(capH, innerW / 2);
  return canvasTexture(scene, `paintcap-${jarW}-${id}`, innerW, capH, (ctx, w, h) => {
    roundRectPath(ctx, 0, -2, w, h + 2, { tl: 0, tr: 0, br: r, bl: r });
    ctx.save();
    ctx.clip();
    ctx.fillStyle = shadeHexStr(hex, -0.2);
    ctx.fillRect(0, 0, w, h);
    specular(ctx, w, h);
    ctx.restore();
  });
}

/** Menisco: superficie superior curva, más clara, con reflejo en el borde trasero. */
export function meniscusKey(scene: Phaser.Scene, id: PigmentId): string {
  const hex = getPigment(id).hex;
  return canvasTexture(scene, `menisc-${id}`, 96, 28, (ctx, w, h) => {
    const cy = h / 2;
    // Bordes que suben por la pared (menisco cóncavo)
    ctx.fillStyle = shadeHexStr(hex, 0.12);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(w * 0.1, cy, w * 0.5, cy);
    ctx.quadraticCurveTo(w * 0.9, cy, w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    // Superficie vista desde arriba
    const g = ctx.createLinearGradient(0, cy - 6, 0, cy + 8);
    g.addColorStop(0, shadeHexStr(hex, 0.38));
    g.addColorStop(1, shadeHexStr(hex, 0.12));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(w / 2, cy + 1, w / 2 - 1, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(w / 2, cy + 1, w / 2 - 4, 6, 0, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  });
}

/** Costra de secado: película opaca y mate que se forma sobre la superficie. */
export function crustKey(scene: Phaser.Scene, innerW: number): string {
  return canvasTexture(scene, `crust-${innerW}`, innerW, 60, (ctx, w, h) => {
    const rnd = texRng(innerW * 31);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(196,182,160,0.95)');
    g.addColorStop(0.55, 'rgba(160,145,122,0.75)');
    g.addColorStop(1, 'rgba(140,125,105,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,75,60,0.18)' : 'rgba(240,230,210,0.2)';
      ctx.beginPath();
      ctx.ellipse(
        rnd() * w,
        rnd() * h * 0.6,
        2 + rnd() * 6,
        1 + rnd() * 3,
        rnd() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });
}

/** Grietas de la pintura seca (visibles cerca de 0). */
export function cracksKey(scene: Phaser.Scene, innerW: number): string {
  return canvasTexture(scene, `cracks-${innerW}`, innerW, 60, (ctx, w) => {
    const rnd = texRng(innerW * 17 + 3);
    ctx.strokeStyle = 'rgba(55,40,28,0.85)';
    ctx.lineCap = 'round';
    for (let c = 0; c < 5; c++) {
      let x = rnd() * w;
      let y = 2 + rnd() * 8;
      ctx.lineWidth = 1.2 + rnd() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 6; s++) {
        x += (rnd() - 0.5) * 22;
        y += 3 + rnd() * 6;
        ctx.lineTo(Math.max(0, Math.min(w, x)), y);
      }
      ctx.stroke();
    }
  });
}

export function corkKey(scene: Phaser.Scene, jarW: number): string {
  const cw = Math.round(jarW * 0.78);
  const ch = Math.round(jarW * 0.36);
  return canvasTexture(scene, `cork-${jarW}`, cw, ch, (ctx, w, h) => {
    const rnd = texRng(jarW);
    roundRectPath(ctx, 1, 1, w - 2, h - 2, { tl: 10, tr: 10, br: 6, bl: 6 });
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#D9A86A');
    g.addColorStop(0.5, '#C08A4E');
    g.addColorStop(1, '#8E6236');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = rnd() < 0.6 ? 'rgba(90,55,25,0.35)' : 'rgba(255,230,190,0.3)';
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,240,210,0.35)';
    ctx.fillRect(0, 0, w, 4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(70,40,15,0.6)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, 1, 1, w - 2, h - 2, { tl: 10, tr: 10, br: 6, bl: 6 });
    ctx.stroke();
  });
}

const PAD = 12;

/** Vidrio trasero: cuerpo translúcido y borde (se dibuja detrás de la pintura). */
export function glassBackKey(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTexture(scene, `glassback-${w}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    const r = w * 0.22;
    ctx.translate(PAD, PAD);
    roundRectPath(ctx, 0, 10, w, h - 10, { tl: 10, tr: 10, br: r, bl: r });
    const g = ctx.createLinearGradient(0, 0, w, 0);
    // Sobre la pared clara el vidrio necesita un poco de cuerpo: velo azul grisáceo.
    g.addColorStop(0, 'rgba(120,145,165,0.22)');
    g.addColorStop(0.5, 'rgba(150,170,185,0.12)');
    g.addColorStop(1, 'rgba(110,135,155,0.26)');
    ctx.fillStyle = g;
    ctx.fill();
  });
}

/** Vidrio frontal: bordes, labio y reflejos (se dibuja encima de la pintura). */
export function glassFrontKey(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTexture(scene, `glassfront-${w}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    const r = w * 0.22;
    ctx.translate(PAD, PAD);
    // Contorno oscuro fino (se lee sobre la pared clara) bajo el borde iluminado
    ctx.strokeStyle = 'rgba(60,75,88,0.55)';
    ctx.lineWidth = 7;
    roundRectPath(ctx, 0, 10, w, h - 10, { tl: 10, tr: 10, br: r, bl: r });
    ctx.stroke();
    roundRectPath(ctx, -6, 0, w + 12, 18, 8);
    ctx.stroke();
    // Borde del vidrio con más luz arriba-izquierda
    const edge = ctx.createLinearGradient(0, 0, w, h);
    edge.addColorStop(0, rgba(COLORS.glass, 0.85));
    edge.addColorStop(1, rgba(COLORS.glass, 0.4));
    ctx.strokeStyle = edge;
    ctx.lineWidth = 4;
    roundRectPath(ctx, 0, 10, w, h - 10, { tl: 10, tr: 10, br: r, bl: r });
    ctx.stroke();
    // Labio
    roundRectPath(ctx, -6, 0, w + 12, 18, 8);
    ctx.fillStyle = rgba(COLORS.glass, 0.3);
    ctx.fill();
    ctx.strokeStyle = rgba(COLORS.glass, 0.8);
    ctx.lineWidth = 3;
    ctx.stroke();
    // Reflejo largo a la izquierda
    const refl = ctx.createLinearGradient(10, 0, 10 + w * 0.12, 0);
    refl.addColorStop(0, 'rgba(255,255,255,0.05)');
    refl.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    refl.addColorStop(1, 'rgba(255,255,255,0.05)');
    ctx.fillStyle = refl;
    roundRectPath(ctx, 10, 34, w * 0.12, h * 0.6, 8);
    ctx.fill();
    // Brillo corto a la derecha y destello en la base
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRectPath(ctx, w - 22, h - h * 0.3, w * 0.07, h * 0.16, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(w * 0.32, h - 8, w * 0.16, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** Silueta del frasco en blanco, para destellos. */
export function glassFlashKey(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTexture(scene, `glassflash-${w}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    const r = w * 0.22;
    ctx.translate(PAD, PAD);
    roundRectPath(ctx, -6, 0, w + 12, h, { tl: 10, tr: 10, br: r, bl: r });
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fill();
  });
}

export function glassFlashTinted(scene: Phaser.Scene, w: number, h: number, hex: string): string {
  return canvasTexture(scene, `glassflash-${w}-${hex}`, w + PAD * 2, h + PAD * 2, (ctx) => {
    const r = w * 0.22;
    ctx.translate(PAD, PAD);
    roundRectPath(ctx, -6, 0, w + 12, h, { tl: 10, tr: 10, br: r, bl: r });
    ctx.fillStyle = hex;
    ctx.fill();
  });
}
