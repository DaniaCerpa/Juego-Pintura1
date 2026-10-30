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
import { sharePaintingFromScene } from '../ui/share';
import { IconButton } from '../ui/IconButton';
import { iconKey } from '../ui/icons';
import { addWordmark } from '../ui/wordmark';

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

    // Cabecera: monedas, wordmark, ajustes
    this.drawCoins();
    addWordmark(this, W / 2, 140, 104);
    this.add
      .text(W / 2, 228, t('gallery.subtitle'), textStyle(34, UI.colors.onWallDim, '600'))
      .setOrigin(0.5);
    const settings = new IconButton(this, W - 110, 140, 'gear', { size: 104 });
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
        .text(
          W / 2,
          1405,
          `★ ${t('gallery.commission')} ★`,
          textStyle(32, UI.colors.accentDark, '600'),
        )
        .setOrigin(0.5);
    }

    // Fila secundaria (B7): Paleta y Regalo, mismo estilo; el regalo resalta con un punto rojo.
    const secondary = {
      width: 340,
      height: 120,
      fontSize: 36,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
    };
    const palette = new Button(this, W / 2 - 190, 1680, t('gallery.palette'), {
      ...secondary,
      iconKey: iconKey(this, 'palette'),
    });
    palette.onPress = () => goTo(this, 'Palette', { from: 'Gallery' });
    const offer = state.dailyOffer();
    const daily = new Button(this, W / 2 + 190, 1680, t('gallery.daily'), {
      ...secondary,
      iconKey: iconKey(this, 'gift'),
    });
    daily.setDot(offer.claimable).setEnabledState(offer.claimable);
    daily.onPress = () => {
      const got = state.claimDaily();
      if (got <= 0) return;
      const day = state.data.daily.streak;
      analytics.log('daily_gift_claimed', { day });
      audio.play('victory');
      showToast(this, t('gallery.dailyClaimed', { n: got, day }), 1380);
      daily.setDot(false).setEnabledState(false);
    };

    this.add
      .text(W / 2, H - 60, `v${__APP_VERSION__}`, textStyle(24, UI.colors.onWallDim, '600'))
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

  /**
   * Pared con una "página" de `slotsPerWall` marcos que incluye el cuadro actual. Los
   * terminados se cuelgan (tocar = compartir); los pendientes son siluetas de marco con
   * un "?" tenue y el nivel que los completa (B8).
   */
  private drawWall(currentPainting: number): void {
    const { state } = services();
    const g = this.add.graphics();
    g.fillStyle(COLORS.panel, 0.45);
    g.fillRoundedRect(50, 290, W - 100, 330, 30);
    g.fillStyle(shade(COLORS.accentDark, -0.4), 1);
    g.fillRoundedRect(70, 590, W - 140, 14, 6);
    const slots = galleryData.slotsPerWall;
    const per = galleryData.levelsPerPainting;
    const first = Math.floor(currentPainting / slots) * slots;
    const slotW = 185;
    const slotH = 230;
    const gap = (W - 100 - slots * slotW) / (slots + 1);
    for (let i = 0; i < slots; i++) {
      const x = 50 + gap + i * (slotW + gap) + slotW / 2;
      const y = 300 + slotH / 2 + 20;
      const idx = first + i;
      if (state.paintingPercent(idx) >= 100) {
        const hung = new PaintingCanvas(
          this,
          x,
          y,
          slotW - 40,
          slotH - 50,
          idx,
          paintingPigments(idx, per),
          100,
        );
        // Recién terminado (Encargo): vuela desde el caballete a su marco (B6).
        if (this.registry.get('justHung') === idx) {
          this.registry.remove('justHung');
          const fromScale = 560 / (slotW - 40);
          hung
            .setPosition(W / 2, 970)
            .setScale(fromScale)
            .setDepth(20);
          this.tweens.add({
            targets: hung,
            x,
            y,
            scale: 1,
            delay: 350,
            duration: 750,
            ease: 'Cubic.InOut',
            onComplete: () => {
              hung.setDepth(0);
              services().audio.play('complete');
              this.tweens.add({
                targets: hung,
                angle: { from: -3, to: 0 },
                duration: 400,
                ease: 'Elastic.Out',
              });
            },
          });
        }
        // Tocar un cuadro colgado lo comparte (A5)
        hung.setSize(slotW, slotH).setInteractive({ useHandCursor: true });
        hung.on('pointerdown', () => {
          this.tweens.add({ targets: hung, scale: { from: 0.94, to: 1 }, duration: 160 });
          void sharePaintingFromScene(this, hung.spec);
        });
      } else {
        // Silueta de marco a la espera
        const fx = x - slotW / 2 + 12;
        const fy = y - slotH / 2 + 10;
        g.lineStyle(6, COLORS.accentDark, idx === currentPainting ? 0.75 : 0.4);
        g.strokeRoundedRect(fx, fy, slotW - 24, slotH - 40, 8);
        g.lineStyle(2, COLORS.accent, idx === currentPainting ? 0.4 : 0.18);
        g.strokeRoundedRect(fx + 12, fy + 12, slotW - 48, slotH - 64, 4);
        this.add
          .text(x, y - 18, '?', textStyle(64, UI.colors.textDim))
          .setOrigin(0.5)
          .setAlpha(idx === currentPainting ? 0.5 : 0.3);
        this.add
          .text(
            x,
            y + 52,
            t('gallery.level', { n: (idx + 1) * per }),
            textStyle(24, UI.colors.textDim, '600'),
          )
          .setOrigin(0.5)
          .setAlpha(0.7);
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
    g.lineBetween(cx - 60, cy - 300, cx - 235, cy + 270);
    g.lineBetween(cx + 60, cy - 300, cx + 235, cy + 270);
    g.lineBetween(cx, cy - 200, cx, cy + 285);
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
    const title = t(canvas.spec.titleKey);
    // Placa con el título y el progreso (tapa el cruce de las patas)
    g.fillStyle(COLORS.panel, 0.92);
    g.fillRoundedRect(cx - 330, cy + 236, 660, 64, 20);
    g.lineStyle(2, COLORS.accent, 0.4);
    g.strokeRoundedRect(cx - 330, cy + 236, 660, 64, 20);
    this.add
      .text(
        cx,
        cy + 268,
        `${title} · ${t('gallery.progress', { pct })}`,
        textStyle(32, UI.colors.textDim, '600'),
      )
      .setOrigin(0.5);
    // Repisa del caballete
    g.fillStyle(COLORS.accentDark, 1);
    g.fillRoundedRect(cx - 320, cy + 196, 640, 22, 8);
  }
}
