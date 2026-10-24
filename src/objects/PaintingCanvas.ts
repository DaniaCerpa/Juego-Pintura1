import Phaser from 'phaser';
import { generatePainting, type PaintingSpec, type Shape } from '../core/painting';
import type { PigmentId } from '../core/types';
import { COLORS, hexToNum, UI } from '../ui/theme';

/**
 * Lienzo de un cuadro procedural (§7.3): boceto gris debajo, cuadro a color encima,
 * revelado por pinceladas diagonales (máscara) según el porcentaje. Marco incluido.
 * Dibuja una sola vez con Graphics; la máscara se recalcula solo al cambiar el porcentaje.
 */
export class PaintingCanvas extends Phaser.GameObjects.Container {
  readonly spec: PaintingSpec;
  private art: Phaser.GameObjects.Graphics;
  /** Contenedor aparte para el arte enmascarado: el renderer Canvas solo aplica máscaras
   *  a objetos de primer nivel o a contenedores, no a hijos de un contenedor. */
  private artLayer: Phaser.GameObjects.Container;
  private maskGfx: Phaser.GameObjects.Graphics;
  private percent = 0;
  private readonly pw: number;
  private readonly ph: number;
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
    this.pw = width;
    this.ph = height;
    const frame = options.frame ?? true;
    if (frame) {
      const g = scene.add.graphics();
      const fw = 22;
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(
        -width / 2 - fw + 8,
        -height / 2 - fw + 12,
        width + fw * 2,
        height + fw * 2,
        10,
      );
      g.fillStyle(COLORS.accentDark, 1);
      g.fillRoundedRect(-width / 2 - fw, -height / 2 - fw, width + fw * 2, height + fw * 2, 10);
      g.fillStyle(COLORS.accent, 1);
      g.fillRoundedRect(
        -width / 2 - fw + 7,
        -height / 2 - fw + 7,
        width + fw * 2 - 14,
        height + fw * 2 - 14,
        6,
      );
      g.fillStyle(0x000000, 0.25);
      g.fillRect(-width / 2 - 4, -height / 2 - 4, width + 8, height + 8);
      this.add(g);
    }
    // Boceto: lienzo crudo con las formas en gris claro (líneas).
    const sketch = scene.add.graphics();
    sketch.fillStyle(0xd8d0c2, 1);
    sketch.fillRect(-width / 2, -height / 2, width, height);
    for (const s of this.spec.shapes) this.drawShape(sketch, s, true);
    this.add(sketch);
    // Cuadro a color, en su propia capa enmascarada
    this.art = scene.add.graphics();
    this.art.fillStyle(hexToNum(this.spec.background), 1);
    this.art.fillRect(-width / 2, -height / 2, width, height);
    for (const s of this.spec.shapes) this.drawShape(this.art, s, false);
    this.artLayer = scene.add.container(x, y, [this.art]);
    this.maskGfx = scene.make.graphics({ x: 0, y: 0 }, false);
    this.artLayer.setMask(this.maskGfx.createGeometryMask());
    scene.add.existing(this);
    // El arte va justo encima del marco/boceto en el orden de dibujo.
    scene.children.moveAbove(this.artLayer, this);
    this.setPercent(percent);
  }

  private drawShape(g: Phaser.GameObjects.Graphics, s: Shape, sketch: boolean): void {
    const w = this.pw;
    const h = this.ph;
    const cx = (s.x - 0.5) * w;
    const cy = (s.y - 0.5) * h;
    const sw = s.w * w;
    const sh = s.h * h;
    const color = sketch ? 0x8a8176 : hexToNum(s.color);
    if (sketch) g.lineStyle(2, color, 0.45);
    else g.fillStyle(color, s.alpha ?? 1);
    switch (s.kind) {
      case 'rect':
        if (sketch) g.strokeRect(cx - sw / 2, cy - sh / 2, sw, sh);
        else g.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
        break;
      case 'circle':
        if (sketch) g.strokeCircle(cx, cy, sw / 2);
        else g.fillCircle(cx, cy, sw / 2);
        break;
      case 'ellipse':
        if (sketch) g.strokeEllipse(cx, cy, sw, sh);
        else g.fillEllipse(cx, cy, sw, sh);
        break;
      case 'triangle':
        if (sketch)
          g.strokeTriangle(cx - sw / 2, cy + sh / 2, cx + sw / 2, cy + sh / 2, cx, cy - sh / 2);
        else g.fillTriangle(cx - sw / 2, cy + sh / 2, cx + sw / 2, cy + sh / 2, cx, cy - sh / 2);
        break;
    }
  }

  getPercent(): number {
    return this.percent;
  }

  /** Fija el porcentaje revelado (0–100) redibujando la máscara. */
  setPercent(percent: number): void {
    this.percent = Phaser.Math.Clamp(percent, 0, 100);
    this.redrawMask(this.percent / 100);
  }

  private redrawMask(frac: number): void {
    const m = this.maskGfx;
    m.clear();
    m.fillStyle(0xffffff, 1);
    const w = this.pw;
    const h = this.ph;
    // La máscara vive en coordenadas del mundo: usar la posición absoluta del contenedor.
    const ox = this.x - w / 2;
    const oy = this.y - h / 2;
    const strokes = this.spec.strokes;
    const total = strokes.length;
    const full = Math.floor(frac * total);
    const partial = frac * total - full;
    for (let i = 0; i < total; i++) {
      const s = strokes[i];
      const amount = i < full ? 1 : i === full ? partial : 0;
      if (amount <= 0) continue;
      // Banda diagonal que crece de arriba hacia abajo según `amount`.
      const x0 = s.x * w;
      const sw = s.w * w;
      const slant = s.slant * w;
      const hh = h * amount;
      const cx = (v: number) => Phaser.Math.Clamp(v, ox, ox + w);
      m.beginPath();
      m.moveTo(cx(ox + x0), oy);
      m.lineTo(cx(ox + x0 + sw), oy);
      m.lineTo(cx(ox + x0 + sw + slant * amount), oy + hh);
      m.lineTo(cx(ox + x0 + slant * amount), oy + hh);
      m.closePath();
      m.fillPath();
    }
  }

  /** Pincelada animada hasta `to` % (§9.3: 600 ms). Devuelve el tween. */
  animateTo(to: number, durationMs = UI.anim.brushMs): Phaser.Tweens.Tween {
    const proxy = { p: this.percent };
    return this.scene.tweens.add({
      targets: proxy,
      p: to,
      duration: durationMs,
      ease: 'Sine.InOut',
      onUpdate: () => this.setPercent(proxy.p),
      onComplete: () => this.setPercent(to),
    });
  }

  /** Firma del Encargo: trazo corto en la esquina inferior derecha + brillo. */
  sign(durationMs = 500): void {
    if (this.signature) return;
    const g = this.scene.add.graphics();
    this.signature = g;
    this.artLayer.add(g);
    const x0 = this.pw / 2 - this.pw * 0.22;
    const y0 = this.ph / 2 - this.ph * 0.08;
    const proxy = { t: 0 };
    this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: durationMs,
      onUpdate: () => {
        g.clear();
        g.lineStyle(4, 0x2a2621, 0.85);
        g.beginPath();
        const steps = Math.max(2, Math.floor(proxy.t * 24));
        for (let i = 0; i <= steps; i++) {
          const u = i / 24;
          const px = x0 + u * this.pw * 0.18;
          const py = y0 + Math.sin(u * Math.PI * 4) * this.ph * 0.02 - u * this.ph * 0.01;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
      },
    });
  }

  setDepth(value: number): this {
    super.setDepth(value);
    this.artLayer?.setDepth(value);
    return this;
  }

  destroy(fromScene?: boolean): void {
    this.maskGfx.destroy();
    this.artLayer.destroy();
    super.destroy(fromScene);
  }
}
