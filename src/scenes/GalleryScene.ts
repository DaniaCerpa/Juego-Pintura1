import Phaser from 'phaser';
import galleryData from '../data/gallery.json';
import { MAX_PRECOMPUTED_LEVEL, paintingPigments } from '../core/levels';
import { PaintingCanvas } from '../objects/PaintingCanvas';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { showToast } from '../ui/Toast';
import { COLORS, drawBackdrop, H, shade, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';

/**
 * Galería (§7.3, §9.1.2): pared con los últimos cuadros colgados, caballete con el cuadro
 * de la decena actual a medio pintar, "Pintar nivel N", Paleta, Ajustes y Regalo diario.
 */
export class GalleryScene extends Phaser.Scene {
  private coinsText!: Phaser.GameObjects.Text;

  constructor() {
    super('Gallery');
  }

  create(): void {
    const { state, analytics, audio } = services();
    drawBackdrop(this);
    this.input.once('pointerdown', () => audio.unlock());
    analytics.log('session_start', { level: state.currentLevel });

    // Cabecera: monedas, título, ajustes
    this.drawCoins();
    this.add.text(W / 2, 140, t('app.name'), textStyle(110, UI.colors.accent)).setOrigin(0.5);
    this.add
      .text(W / 2, 222, t('gallery.subtitle'), textStyle(36, UI.colors.textDim, '600'))
      .setOrigin(0.5);
    const settings = new Button(this, W - 110, 140, '⚙', {
      width: 120,
      height: 110,
      fontSize: 52,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
      radius: 26,
    });
    settings.onPress = () => goTo(this, 'Settings', { from: 'Gallery' });

    const level = state.currentLevel;
    const per = galleryData.levelsPerPainting;
    const currentPainting = Math.floor((level - 1) / per);
    this.drawWall(currentPainting);
    this.drawEasel(currentPainting);

    // Botón principal
    const canPlay = level <= MAX_PRECOMPUTED_LEVEL;
    const play = new Button(
      this,
      W / 2,
      1500,
      canPlay ? t('gallery.play', { n: level }) : t('end.title'),
      { width: 720, height: 150, fontSize: 52 },
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
    if (level % per === 0) {
      this.add
        .text(W / 2, 1405, `★ ${t('gallery.commission')} ★`, textStyle(32, UI.colors.accent, '600'))
        .setOrigin(0.5);
    }

    // Fila secundaria: Paleta y Regalo diario
    const palette = new Button(this, W / 2 - 190, 1680, t('gallery.palette'), {
      width: 340,
      height: 120,
      fontSize: 36,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
      icon: '🎨',
    });
    palette.onPress = () => goTo(this, 'Palette', { from: 'Gallery' });
    const offer = state.dailyOffer();
    const daily = new Button(
      this,
      W / 2 + 190,
      1680,
      offer.claimable ? t('gallery.daily') : t('gallery.dailyTomorrow'),
      {
        width: 340,
        height: 120,
        fontSize: offer.claimable ? 36 : 30,
        color: offer.claimable ? COLORS.accent : COLORS.backgroundLight,
        textColor: offer.claimable ? UI.colors.panel : UI.colors.text,
        icon: '🎁',
      },
    );
    daily.setEnabledState(offer.claimable);
    daily.onPress = () => {
      const got = state.claimDaily();
      if (got <= 0) return;
      const day = state.data.daily.streak;
      analytics.log('daily_gift_claimed', { day });
      audio.play('victory');
      showToast(this, t('gallery.dailyClaimed', { n: got, day }), 1380);
      daily.setText(t('gallery.dailyTomorrow')).setEnabledState(false);
    };

    this.add
      .text(W / 2, H - 60, `v${__APP_VERSION__}`, textStyle(24, UI.colors.textDim, '600'))
      .setOrigin(0.5)
      .setAlpha(0.6);
    fadeIn(this);
  }

  private drawCoins(): void {
    const { state } = services();
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 0.7);
    g.fillRoundedRect(50, 95, 250, 90, 45);
    g.fillStyle(COLORS.accent, 1);
    g.fillCircle(100, 140, 28);
    g.fillStyle(shade(COLORS.accent, -0.3), 1);
    g.fillCircle(100, 140, 18);
    this.coinsText = this.add
      .text(145, 140, String(state.coins), textStyle(40, UI.colors.text))
      .setOrigin(0, 0.5);
    const off = state.on('coins', () => this.coinsText.setText(String(state.coins)));
    this.events.once('shutdown', off);
  }

  /** Listón con los últimos cuadros completados (hasta `slotsPerWall`). */
  private drawWall(currentPainting: number): void {
    const { state } = services();
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 0.45);
    g.fillRoundedRect(50, 290, W - 100, 330, 30);
    g.fillStyle(shade(COLORS.accentDark, -0.4), 1);
    g.fillRoundedRect(70, 590, W - 140, 14, 6);
    const slots = galleryData.slotsPerWall;
    const slotW = 185;
    const slotH = 230;
    const gap = (W - 100 - slots * slotW) / (slots + 1);
    for (let i = 0; i < slots; i++) {
      const x = 50 + gap + i * (slotW + gap) + slotW / 2;
      const y = 300 + slotH / 2 + 20;
      const idx = currentPainting - slots + i;
      if (idx >= 0 && state.paintingPercent(idx) >= 100) {
        new PaintingCanvas(
          this,
          x,
          y,
          slotW - 40,
          slotH - 50,
          idx,
          paintingPigments(idx, galleryData.levelsPerPainting),
          100,
        );
      } else {
        // Marco vacío a la espera
        g.fillStyle(shade(COLORS.panel, 0.08), 1);
        g.fillRoundedRect(x - slotW / 2 + 10, y - slotH / 2 + 10, slotW - 20, slotH - 20, 8);
        g.fillStyle(COLORS.background, 1);
        g.fillRect(x - slotW / 2 + 26, y - slotH / 2 + 26, slotW - 52, slotH - 52);
      }
    }
  }

  private drawEasel(paintingIdx: number): void {
    const { state } = services();
    const cx = W / 2;
    const cy = 1000;
    const g = this.add.graphics();
    // Patas del caballete (detrás del cuadro)
    g.lineStyle(16, COLORS.accentDark, 1);
    g.lineBetween(cx - 60, cy - 300, cx - 250, cy + 300);
    g.lineBetween(cx + 60, cy - 300, cx + 250, cy + 300);
    g.lineBetween(cx, cy - 200, cx, cy + 320);
    g.lineStyle(14, COLORS.accentDark, 1);
    g.lineBetween(cx - 250, cy + 150, cx + 250, cy + 150);
    const w = 560;
    const h = 440;
    const pct = state.paintingPercent(paintingIdx);
    const canvas = new PaintingCanvas(
      this,
      cx,
      cy - 30,
      w,
      h,
      paintingIdx,
      paintingPigments(paintingIdx, galleryData.levelsPerPainting),
      pct,
    );
    const title = canvas.spec.title;
    this.add
      .text(
        cx,
        cy + 250,
        `${title} · ${t('gallery.progress', { pct })}`,
        textStyle(32, UI.colors.textDim, '600'),
      )
      .setOrigin(0.5);
    // Repisa del caballete
    g.fillStyle(COLORS.accentDark, 1);
    g.fillRoundedRect(cx - 320, cy + 196, 640, 22, 8);
  }
}
