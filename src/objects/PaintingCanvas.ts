import Phaser from 'phaser';
import {
  generatePainting,
  regionBoundsPx,
  regionsRevealed,
  type PaintingRegion,
  type PaintingSpec,
  type Shape,
} from '../core/painting';
import type { PigmentId } from '../core/types';
import { COLORS, UI } from '../ui/theme';
import { canvasTexture, roundRectPath, texRng } from './canvasTex';

interface RegionSprites {
  color: Phaser.GameObjects.Image;
  sketch: Phaser.GameObjects.Image;
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

function drawShape2D(
  ctx: CanvasRenderingContext2D,
  s: Shape,
  w: number,
  h: number,
  sketch: boolean,
): void {
  const cx = s.x * w;
  const cy = s.y * h;
  const sw = s.w * w;
  const sh = s.h * h;
  ctx.beginPath();
  switch (s.kind) {
    case 'rect':
      ctx.rect(cx - sw / 2, cy - sh / 2, sw, sh);
      break;
    case 'circle':
      ctx.arc(cx, cy, sw / 2, 0, Math.PI * 2);
      break;
    case 'ellipse':
      ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(cx - sw / 2, cy + sh / 2);
      ctx.lineTo(cx + sw / 2, cy + sh / 2);
      ctx.lineTo(cx, cy - sh / 2);
      ctx.closePath();
      break;
  }
  if (sketch) ctx.stroke();
  else {
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * Lienzo de un cuadro procedural (§7.3, B6). Papel con el boceto a lápiz; cada región con
 * sentido (cielo, sol, nubes, montañas, agua, colinas, pradera, árboles, casas) es una
 * textura recortada a su rectángulo. Revelar una región = un pincel la recorre (600 ms)
 * mientras el color aparece de izquierda a derecha. Los contornos de las regiones aún no
 * pintadas quedan encima, como boceto. Texturas generadas una vez por cuadro y tamaño.
 */
export class PaintingCanvas extends Phaser.GameObjects.Container {
  readonly spec: PaintingSpec;
  private regionSprites: RegionSprites[] = [];
  private percent = 0;
  private readonly pw: number;
  private readonly ph: number;
  private brush: Phaser.GameObjects.Image | null = null;
  private signature: Phaser.GameObjects.Graphics | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    index: number,
    pigments: PigmentId[],
    percent: number,
    options: { frame?: boolean } = {},
  ) {
    super(scene, x, y);
    this.spec = generatePainting(index, pigments);
    const w = Math.round(width);
    const h = Math.round(height);
    this.pw = w;
    this.ph = h;
    if (options.frame ?? true)
      this.add(scene.add.image(0, 0, PaintingCanvas.frameKey(scene, w, h)));
    // Papel con textura de lienzo
    this.add(scene.add.image(0, 0, PaintingCanvas.paperKey(scene, w, h)));
    const prefix = `pr-${index}-${w}x${h}`;
    this.spec.regions.forEach((r, i) => {
      const b = regionBoundsPx(r, w, h);
      const color = scene.add
        .image(-w / 2 + b.x0, -h / 2 + b.y0, this.regionKey(`${prefix}-c${i}`, r, b, false))
        .setOrigin(0, 0);
      const sketch = scene.add
        .image(-w / 2 + b.x0, -h / 2 + b.y0, this.regionKey(`${prefix}-s${i}`, r, b, true))
        .setOrigin(0, 0);
      this.regionSprites.push({ color, sketch, bounds: b });
    });
    // Orden: regiones a color (atrás → adelante) y encima los bocetos de lo no pintado.
    for (const rs of this.regionSprites) this.add(rs.color);
    for (const rs of this.regionSprites) this.add(rs.sketch);
    scene.add.existing(this);
    this.setPercent(percent);
  }

  private static frameKey(scene: Phaser.Scene, w: number, h: number): string {
    const fw = Math.max(10, Math.round(Math.min(w, h) * 0.05));
    return canvasTexture(scene, `pframe-${w}x${h}`, w + fw * 2 + 14, h + fw * 2 + 18, (ctx) => {
      ctx.fillStyle = 'rgba(44,35,80,0.28)';
      roundRectPath(ctx, 10, 14, w + fw * 2, h + fw * 2, 8);
      ctx.fill();
      // Marco moderno de galería: blanco con canto sutil
      const g = ctx.createLinearGradient(4, 4, w + fw * 2, h + fw * 2);
      g.addColorStop(0, '#FFFFFF');
      g.addColorStop(1, '#ECE7F3');
      ctx.fillStyle = g;
      roundRectPath(ctx, 4, 4, w + fw * 2, h + fw * 2, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(44,35,80,0.22)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(4 + fw - 2, 4 + fw - 2, w + 4, h + 4);
    });
  }

  private static paperKey(scene: Phaser.Scene, w: number, h: number): string {
    return canvasTexture(scene, `paper-${w}x${h}`, w, h, (ctx) => {
      ctx.fillStyle = '#E4DCCB';
      ctx.fillRect(0, 0, w, h);
      const rnd = texRng(w * 7 + h);
      for (let i = 0; i < (w * h) / 90; i++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(120,100,70,0.06)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    });
  }

  private regionKey(
    key: string,
    r: PaintingRegion,
    b: { x0: number; y0: number; x1: number; y1: number },
    sketch: boolean,
  ): string {
    return canvasTexture(this.scene, key, b.x1 - b.x0, b.y1 - b.y0, (ctx) => {
      ctx.translate(-b.x0, -b.y0);
      if (sketch) {
        ctx.strokeStyle = 'rgba(110,98,84,0.55)';
        ctx.lineWidth = Math.max(1, this.pw / 300);
      }
      for (const s of r.shapes) drawShape2D(ctx, s, this.pw, this.ph, sketch);
    });
  }

  getPercent(): number {
    return this.percent;
  }

  /** Fija el porcentaje revelado; con `partial` (0–1) la región en curso aparece a medias. */
  setPercent(percent: number, partial = 0): void {
    this.percent = Phaser.Math.Clamp(percent, 0, 100);
    const n = regionsRevealed(this.percent);
    this.regionSprites.forEach((rs, i) => {
      const bw = rs.bounds.x1 - rs.bounds.x0;
      const bh = rs.bounds.y1 - rs.bounds.y0;
      if (i < n) {
        rs.color.setVisible(true).setCrop();
        rs.sketch.setVisible(false);
      } else if (i === n && partial > 0) {
        rs.color.setVisible(true).setCrop(0, 0, Math.max(1, bw * partial), bh);
        rs.sketch.setVisible(true);
      } else {
        rs.color.setVisible(false);
        rs.sketch.setVisible(true);
      }
    });
  }

  private static brushKey(scene: Phaser.Scene): string {
    return canvasTexture(scene, 'brush', 40, 150, (ctx) => {
      // Mango, virola y pelo con pintura
      ctx.fillStyle = '#7A4A26';
      roundRectPath(ctx, 14, 0, 12, 92, 6);
      ctx.fill();
      ctx.fillStyle = '#C9CED6';
      ctx.fillRect(12, 88, 16, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(14, 90, 4, 16);
      ctx.fillStyle = '#3A2A1E';
      ctx.beginPath();
      ctx.moveTo(12, 108);
      ctx.quadraticCurveTo(20, 150, 28, 108);
      ctx.closePath();
      ctx.fill();
    });
  }

  /**
   * Revela con pincel las regiones hasta llegar a `to` % (§9.3: 600 ms). Si hay varias
   * regiones pendientes, se reparten el tiempo. Devuelve el tween (interrumpible).
   */
  animateTo(to: number, durationMs = UI.anim.brushMs): Phaser.Tweens.Tween {
    const from = regionsRevealed(this.percent);
    const target = regionsRevealed(to);
    const count = Math.max(1, target - from);
    if (!this.brush) {
      this.brush = this.scene.add
        .image(0, 0, PaintingCanvas.brushKey(this.scene))
        .setOrigin(0.5, 1)
        .setAngle(28)
        .setVisible(false);
      this.add(this.brush);
    }
    const brush = this.brush;
    const scale = Phaser.Math.Clamp(this.ph / 600, 0.35, 1.1);
    brush.setScale(scale);
    const proxy = { p: 0 };
    return this.scene.tweens.add({
      targets: proxy,
      p: 1,
      duration: durationMs,
      ease: 'Sine.InOut',
      onStart: () => brush.setVisible(target > from),
      onUpdate: () => {
        const pos = proxy.p * count;
        const k = Math.min(count - 1, Math.floor(pos));
        const local = Math.min(1, pos - k);
        const idx = from + k;
        this.setPercent((from + k) * 10, local);
        const rs = this.regionSprites[idx];
        if (!rs) return;
        // El pincel barre la región en zigzag (5 pasadas) mientras avanza a la derecha.
        const b = rs.bounds;
        const x = -this.pw / 2 + b.x0 + (b.x1 - b.x0) * local;
        const zig = Math.abs(Math.sin(local * Math.PI * 5));
        const y = -this.ph / 2 + b.y0 + (b.y1 - b.y0) * (0.15 + 0.7 * zig);
        brush.setPosition(x + 6 * scale, y + 10 * scale);
      },
      onComplete: () => {
        brush.setVisible(false);
        this.setPercent(to);
      },
      onStop: () => {
        brush.setVisible(false);
        this.setPercent(to);
      },
    });
  }

  /** Firma del Encargo: trazo corto en la esquina inferior derecha. */
  sign(durationMs = 500): void {
    if (this.signature) return;
    const g = this.scene.add.graphics();
    this.signature = g;
    this.add(g);
    const x0 = this.pw / 2 - this.pw * 0.24;
    const y0 = this.ph / 2 - this.ph * 0.07;
    const draw = (t: number) => {
      g.clear();
      g.lineStyle(Math.max(2, this.pw / 140), COLORS.panel, 0.9);
      g.beginPath();
      const steps = Math.max(2, Math.floor(t * 28));
      for (let i = 0; i <= steps; i++) {
        const u = i / 28;
        const px = x0 + u * this.pw * 0.2;
        const py = y0 + Math.sin(u * Math.PI * 4) * this.ph * 0.02 - u * this.ph * 0.012;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    };
    if (durationMs <= 1) {
      draw(1);
      return;
    }
    const proxy = { t: 0 };
    this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: durationMs,
      onUpdate: () => draw(proxy.t),
      onComplete: () => draw(1),
    });
  }
}
