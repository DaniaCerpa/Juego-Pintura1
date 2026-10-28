import Phaser from 'phaser';
import { services } from '../services';
import { H, UI, W } from '../ui/theme';
import { addWordmark } from '../ui/wordmark';

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

    const fontReady = (document as Document & { fonts?: FontFaceSet }).fonts?.load(
      `800 40px "${UI.font.family}"`,
    );
    const timeout = new Promise<void>((r) => setTimeout(r, 1500));
    Promise.race([fontReady ?? Promise.resolve(), timeout]).then(() => {
      // Splash con el wordmark (B8) una vez que la fuente está lista.
      const mark = addWordmark(this, W / 2, H / 2 - 40, 150)
        .setAlpha(0)
        .setScale(0.92);
      this.tweens.add({ targets: mark, alpha: 1, scale: 1, duration: 320, ease: 'Back.Out' });
      this.time.delayedCall(520, () => this.scene.start('Gallery'));
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
}
