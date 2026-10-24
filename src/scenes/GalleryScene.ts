import Phaser from 'phaser';
import galleryData from '../data/gallery.json';
import { MAX_PRECOMPUTED_LEVEL } from '../core/levels';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, drawBackdrop, H, shade, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';

/**
 * Galería provisional (F0): pared del taller con marcos, caballete con el cuadro de la
 * decena actual (progreso en %), y botón grande "Pintar nivel N". El cuadro procedural
 * real llega en F1 (§7.3).
 */
export class GalleryScene extends Phaser.Scene {
  constructor() {
    super('Gallery');
  }

  create(): void {
    const { state, analytics, audio } = services();
    drawBackdrop(this);
    this.input.once('pointerdown', () => audio.unlock());
    analytics.log('session_start', { level: state.currentLevel });

    // Título
    this.add.text(W / 2, 150, t('app.name'), textStyle(120, UI.colors.accent)).setOrigin(0.5);
    this.add
      .text(W / 2, 240, t('gallery.subtitle'), textStyle(40, UI.colors.textDim, '600'))
      .setOrigin(0.5);

    // Pared con cuadros pequeños (decenas completadas)
    const level = state.currentLevel;
    const per = galleryData.levelsPerPainting;
    const currentPainting = Math.floor((level - 1) / per);
    this.drawWall(currentPainting);

    // Caballete con el cuadro actual
    const done = (level - 1) % per;
    const pct = Math.round((done / per) * 100);
    this.drawEasel(W / 2, 1010, currentPainting, pct);

    const canPlay = level <= MAX_PRECOMPUTED_LEVEL;
    const play = new Button(
      this,
      W / 2,
      1560,
      canPlay ? t('gallery.play', { n: level }) : t('end.title'),
      { width: 700, height: 150, fontSize: 52 },
    );
    play.onPress = () => {
      if (!canPlay) return;
      goTo(this, 'Level', { level });
    };
    this.tweens.add({
      targets: play,
      scale: { from: 1, to: 1.03 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    const settings = new Button(this, W - 110, 150, '⚙', {
      width: 120,
      height: 110,
      fontSize: 52,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
      radius: 26,
    });
    settings.onPress = () => goTo(this, 'Settings', { from: 'Gallery' });

    this.add
      .text(W / 2, H - 70, `v${__APP_VERSION__}`, textStyle(24, UI.colors.textDim, '600'))
      .setOrigin(0.5)
      .setAlpha(0.6);
    fadeIn(this);
  }

  private drawWall(currentPainting: number): void {
    const g = this.add.graphics();
    // Listón de la pared
    g.fillStyle(COLORS.panel, 0.5);
    g.fillRoundedRect(60, 330, W - 120, 300, 30);
    const slots = galleryData.slotsPerWall;
    const slotW = 190;
    const gap = (W - 120 - slots * slotW) / (slots + 1);
    for (let i = 0; i < slots; i++) {
      const x = 60 + gap + i * (slotW + gap);
      const y = 360;
      const paintingIdx = currentPainting - slots + i;
      const hung = paintingIdx >= 0;
      // Marco
      g.fillStyle(hung ? COLORS.accentDark : shade(COLORS.panel, 0.08), 1);
      g.fillRoundedRect(x, y, slotW, 240, 10);
      g.fillStyle(hung ? COLORS.accent : shade(COLORS.panel, 0.12), 1);
      g.fillRoundedRect(x + 8, y + 8, slotW - 16, 224, 6);
      // Lienzo
      if (hung) {
        this.drawMiniPainting(g, x + 22, y + 22, slotW - 44, 196, paintingIdx);
      } else {
        g.fillStyle(COLORS.background, 1);
        g.fillRect(x + 22, y + 22, slotW - 44, 196);
      }
    }
  }

  /** Cuadro abstracto de relleno por semilla (F0). En F1 lo reemplaza core/painting.ts. */
  private drawMiniPainting(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    seed: number,
  ): void {
    const palette = [0xe2473f, 0x2f6fdb, 0xf3d23a, 0x3ba65a, 0xf08a24, 0x7a4fc2, 0xf6f1e6];
    g.fillStyle(shade(palette[(seed * 3) % palette.length], 0.6), 1);
    g.fillRect(x, y, w, h);
    for (let i = 0; i < 5; i++) {
      const c = palette[(seed * 7 + i * 3) % palette.length];
      g.fillStyle(c, 0.9);
      const bw = w * (0.25 + ((seed + i) % 3) * 0.15);
      const bh = h * (0.2 + ((seed * 2 + i) % 4) * 0.12);
      g.fillRect(
        x + ((i * 37 + seed * 11) % (w - bw)),
        y + ((i * 53 + seed * 17) % (h - bh)),
        bw,
        bh,
      );
    }
  }

  private drawEasel(cx: number, cy: number, paintingIdx: number, pct: number): void {
    const g = this.add.graphics();
    // Patas del caballete
    g.lineStyle(14, COLORS.accentDark, 1);
    g.lineBetween(cx - 200, cy + 330, cx - 40, cy - 260);
    g.lineBetween(cx + 200, cy + 330, cx + 40, cy - 260);
    g.lineBetween(cx, cy + 330, cx, cy - 200);
    g.lineBetween(cx - 230, cy + 130, cx + 230, cy + 130);
    // Marco del cuadro
    const w = 520;
    const h = 420;
    const x = cx - w / 2;
    const y = cy - h / 2 - 40;
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(x + 10, y + 14, w, h, 12);
    g.fillStyle(COLORS.accentDark, 1);
    g.fillRoundedRect(x, y, w, h, 12);
    g.fillStyle(COLORS.accent, 1);
    g.fillRoundedRect(x + 12, y + 12, w - 24, h - 24, 8);
    // Lienzo: boceto gris, pintado hasta pct (revelado por franjas verticales)
    const px = x + 30;
    const py = y + 30;
    const pw = w - 60;
    const ph = h - 60;
    g.fillStyle(0xd8d0c2, 1);
    g.fillRect(px, py, pw, ph);
    g.lineStyle(3, 0x8a8176, 0.5);
    for (let i = 1; i < 6; i++) g.lineBetween(px, py + (ph / 6) * i, px + pw, py + (ph / 6) * i);
    const painted = Math.round((pw * pct) / 100);
    if (painted > 0) {
      const mask = this.make.graphics({ x: 0, y: 0 }, false);
      mask.fillRect(px, py, painted, ph);
      const art = this.add.graphics();
      this.drawMiniPainting(art, px, py, pw, ph, paintingIdx);
      art.setMask(mask.createGeometryMask());
    }
    this.add
      .text(
        cx,
        cy + 395,
        `${t('gallery.painting', { n: paintingIdx + 1 })} · ${t('gallery.progress', { pct })}`,
        textStyle(34, UI.colors.textDim, '600'),
      )
      .setOrigin(0.5);
  }
}
