import Phaser from 'phaser';
import { services } from '../services';
import { COLORS, H, textStyle, UI, W } from '../ui/theme';
import { t } from '../ui/i18n';

/**
 * Carga de datos y generación de texturas por código: punto para partículas, confeti,
 * textura de lienzo y viñeta. Espera a la fuente de Google Fonts (con tope de tiempo).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    services();
    this.makeDot();
    this.makeConfetti();
    this.makeCanvasNoise();
    this.makeVignette();

    const label = this.add
      .text(W / 2, H / 2, t('app.name'), textStyle(96, UI.colors.accent))
      .setOrigin(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: label, alpha: 1, duration: 250 });

    const fontReady = (document as Document & { fonts?: FontFaceSet }).fonts?.load(
      `800 40px "${UI.font.family}"`,
    );
    const timeout = new Promise<void>((r) => setTimeout(r, 1500));
    Promise.race([fontReady ?? Promise.resolve(), timeout]).then(() => {
      // Redibujar el texto una vez que la fuente está lista y pasar a la galería.
      label.setStyle(textStyle(96, UI.colors.accent));
      this.time.delayedCall(150, () => this.scene.start('Gallery'));
    });
  }

  private makeDot(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(12, 12, 12);
    g.generateTexture('dot', 24, 24);
    g.destroy();
  }

  private makeConfetti(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(0, 0, 22, 14, 3);
    g.generateTexture('confetti', 22, 14);
    g.destroy();
  }

  /** Textura de lienzo: trama fina de puntos claros/oscuros, repetible. */
  private makeCanvasNoise(): void {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let seed = 20261024;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const weave = (x % 4 < 2 !== y % 4 < 2 ? 1 : 0) * 18;
        const v = 128 + (rnd() - 0.5) * 70 + weave;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.textures.addCanvas('canvas-noise', canvas);
  }

  /** Viñeta radial cálida: centro claro, bordes oscuros. */
  private makeVignette(): void {
    const w = 270;
    const h = 480;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const grad = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h / 2, h * 0.7);
    const light = Phaser.Display.Color.IntegerToColor(COLORS.backgroundLight);
    grad.addColorStop(0, `rgba(${light.red},${light.green},${light.blue},0.9)`);
    grad.addColorStop(0.55, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    this.textures.addCanvas('vignette', canvas);
  }
}
