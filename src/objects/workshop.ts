import type Phaser from 'phaser';
import { UI } from '../ui/theme';
import { canvasTexture, rgba, shadeHexStr, texRng } from './canvasTex';

/**
 * Ambiente de taller (B2): mesa de madera con vetas, estante para filas superiores y
 * sombras suaves. Todo generado por código una vez; las escenas solo colocan imágenes.
 */
const WOOD = '#8A5A33';

function grain(
  ctx: CanvasRenderingContext2D,
  w: number,
  y0: number,
  h: number,
  seed: number,
): void {
  const rnd = texRng(seed);
  // Vetas: ondas horizontales largas y finas, más claras y más oscuras.
  for (let i = 0; i < Math.round(h / 5); i++) {
    const y = y0 + rnd() * h;
    const amp = 1 + rnd() * 3;
    const freq = 0.004 + rnd() * 0.01;
    const phase = rnd() * 10;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(255,220,170,0.07)' : 'rgba(40,20,5,0.12)';
    ctx.lineWidth = 0.8 + rnd() * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) {
      const yy = y + Math.sin(x * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Nudos
  for (let k = 0; k < 2; k++) {
    const x = rnd() * w;
    const y = y0 + rnd() * h;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 16);
    g.addColorStop(0, 'rgba(40,20,5,0.25)');
    g.addColorStop(1, 'rgba(40,20,5,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Mesa: superficie (con luz desde arriba a la izquierda), canto y cuerpo que se desvanece. */
export const TABLE_SURFACE = 150;
export const TABLE_EDGE = 36;

export function ensureTableTexture(scene: Phaser.Scene, bodyH: number): string {
  const h = TABLE_SURFACE + TABLE_EDGE + Math.max(0, Math.round(bodyH));
  return canvasTexture(scene, `table-${h}`, UI.canvas.width, h, (ctx, w) => {
    // Superficie: más clara al fondo-izquierda (luz), más oscura al frente-derecha.
    const s = ctx.createLinearGradient(0, 0, w * 0.3, TABLE_SURFACE);
    s.addColorStop(0, shadeHexStr(WOOD, 0.22));
    s.addColorStop(1, shadeHexStr(WOOD, -0.05));
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, w, TABLE_SURFACE);
    grain(ctx, w, 0, TABLE_SURFACE, 7);
    const light = ctx.createRadialGradient(w * 0.2, 0, 20, w * 0.2, 0, w * 0.8);
    light.addColorStop(0, 'rgba(255,214,150,0.22)');
    light.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, TABLE_SURFACE);
    // Borde trasero (la mesa termina contra la pared)
    const back = ctx.createLinearGradient(0, 0, 0, 18);
    back.addColorStop(0, 'rgba(0,0,0,0.35)');
    back.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = back;
    ctx.fillRect(0, 0, w, 18);
    // Canto frontal
    const e = ctx.createLinearGradient(0, TABLE_SURFACE, 0, TABLE_SURFACE + TABLE_EDGE);
    e.addColorStop(0, shadeHexStr(WOOD, 0.08));
    e.addColorStop(0.15, shadeHexStr(WOOD, -0.18));
    e.addColorStop(1, shadeHexStr(WOOD, -0.42));
    ctx.fillStyle = e;
    ctx.fillRect(0, TABLE_SURFACE, w, TABLE_EDGE);
    ctx.fillStyle = 'rgba(255,230,190,0.25)';
    ctx.fillRect(0, TABLE_SURFACE, w, 2);
    // Cuerpo: madera oscura que se funde con el fondo.
    if (h > TABLE_SURFACE + TABLE_EDGE) {
      const y0 = TABLE_SURFACE + TABLE_EDGE;
      const b = ctx.createLinearGradient(0, y0, 0, h);
      b.addColorStop(0, shadeHexStr(WOOD, -0.5));
      b.addColorStop(1, rgba(UI.colors.background, 0));
      ctx.fillStyle = b;
      ctx.fillRect(0, y0, w, h - y0);
      ctx.globalAlpha = 0.5;
      grain(ctx, w, y0, Math.min(140, h - y0), 11);
      ctx.globalAlpha = 1;
      const sh = ctx.createLinearGradient(0, y0, 0, y0 + 24);
      sh.addColorStop(0, 'rgba(0,0,0,0.45)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh;
      ctx.fillRect(0, y0, w, 24);
    }
  });
}

/** Estante para filas superiores (tablero de 2–3 filas). */
export const SHELF_SURFACE = 44;
export function ensureShelfTexture(scene: Phaser.Scene): string {
  return canvasTexture(scene, 'shelf', UI.canvas.width, SHELF_SURFACE + 26, (ctx, w, h) => {
    const s = ctx.createLinearGradient(0, 0, 0, SHELF_SURFACE);
    s.addColorStop(0, shadeHexStr(WOOD, 0.18));
    s.addColorStop(1, shadeHexStr(WOOD, 0));
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, w, SHELF_SURFACE);
    grain(ctx, w, 0, SHELF_SURFACE, 3);
    const e = ctx.createLinearGradient(0, SHELF_SURFACE, 0, h);
    e.addColorStop(0, shadeHexStr(WOOD, -0.15));
    e.addColorStop(1, shadeHexStr(WOOD, -0.45));
    ctx.fillStyle = e;
    ctx.fillRect(0, SHELF_SURFACE, w, h - SHELF_SURFACE);
    ctx.fillStyle = 'rgba(255,230,190,0.22)';
    ctx.fillRect(0, SHELF_SURFACE, w, 2);
  });
}

/** Sombra suave proyectada sobre la mesa (luz arriba-izquierda → sombra abajo-derecha). */
export function ensureSoftShadow(scene: Phaser.Scene, w: number): string {
  const sw = Math.round(w * 1.5);
  const sh = Math.round(w * 0.42);
  return canvasTexture(scene, `softshadow-${w}`, sw, sh, (ctx, cw, ch) => {
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(1, ch / cw);
    const g = ctx.createRadialGradient(0, 0, cw * 0.08, 0, 0, cw / 2);
    g.addColorStop(0, 'rgba(20,10,0,0.55)');
    g.addColorStop(0.55, 'rgba(20,10,0,0.25)');
    g.addColorStop(1, 'rgba(20,10,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, cw / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

/** Luz cálida de taller: haz desde arriba a la izquierda + viñeta. */
export function ensureWorkshopLight(scene: Phaser.Scene): string {
  return canvasTexture(scene, 'workshop-light', 270, 480, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.18, h * 0.04, 10, w * 0.3, h * 0.2, h * 0.85);
    g.addColorStop(0, 'rgba(255,205,140,0.34)');
    g.addColorStop(0.35, 'rgba(255,190,120,0.12)');
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const v = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.35, w / 2, h * 0.5, h * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  });
}
