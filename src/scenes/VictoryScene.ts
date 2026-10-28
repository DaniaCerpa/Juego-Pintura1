import Phaser from 'phaser';
import adsData from '../data/ads.json';
import galleryData from '../data/gallery.json';
import { MAX_PRECOMPUTED_LEVEL, paintingPigments } from '../core/levels';
import type { PigmentId } from '../core/types';
import { Fx } from '../objects/Fx';
import { PaintingCanvas } from '../objects/PaintingCanvas';
import { services } from '../services';
import type { LevelResult } from '../state/gameState';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, drawBackdrop, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';
import { sharePaintingFromScene } from '../ui/share';
import { IconButton } from '../ui/IconButton';

export interface VictoryData {
  result: LevelResult;
  pigments: PigmentId[];
}

/**
 * Victoria (§9.1.4): estrellas animadas, monedas, la pincelada del cuadro (+10 %),
 * firma si es Encargo, "Siguiente" grande, "Rejugar" y duplicar monedas (rewarded, ★★+).
 */
export class VictoryScene extends Phaser.Scene {
  private params!: VictoryData;
  private fx!: Fx;
  private intro: Phaser.Tweens.Tween[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private canvas!: PaintingCanvas;
  private coinsLabel!: Phaser.GameObjects.Text;
  private doubled = false;

  constructor() {
    super('Victory');
  }

  init(data: VictoryData): void {
    this.params = data;
    this.intro = [];
    this.timers = [];
    this.doubled = false;
  }

  create(): void {
    const { audio, haptics, analytics } = services();
    const r = this.params.result;
    drawBackdrop(this);
    this.fx = new Fx(this);
    audio.play('victory');
    haptics.vibrate('complete');

    const perfect = r.moves <= r.par;
    this.add
      .text(W / 2, 150, t('level.title', { n: r.level }), textStyle(38, UI.colors.textDim, '600'))
      .setOrigin(0.5);
    const title = this.add
      .text(
        W / 2,
        250,
        perfect ? t('victory.perfect') : t('victory.title'),
        textStyle(84, UI.colors.accent),
      )
      .setOrigin(0.5)
      .setScale(0.6)
      .setAlpha(0);
    this.intro.push(
      this.tweens.add({
        targets: title,
        alpha: 1,
        scale: 1,
        duration: 420,
        ease: 'Back.Out',
        delay: 80,
      }),
    );

    // Estrellas
    const starY = 380;
    const stars: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < 3; i++) {
      const s = this.add
        .text(
          W / 2 + (i - 1) * 150,
          starY,
          '★',
          textStyle(120, i < r.stars ? UI.colors.accent : '#4a433b'),
        )
        .setOrigin(0.5)
        .setScale(0)
        .setAlpha(0);
      stars.push(s);
      this.intro.push(
        this.tweens.add({
          targets: s,
          scale: 1,
          alpha: 1,
          duration: 300,
          ease: 'Back.Out',
          delay: 350 + i * 180,
          onStart: () => {
            if (i < r.stars) audio.play('complete');
          },
        }),
      );
    }
    this.add
      .text(
        W / 2,
        480,
        t('victory.moves', { moves: r.moves, par: r.par }),
        textStyle(36, UI.colors.text, '600'),
      )
      .setOrigin(0.5);

    // Monedas
    this.coinsLabel = this.add
      .text(
        W / 2,
        560,
        r.reward.total > 0 ? t('victory.coins', { n: r.reward.total }) : '',
        textStyle(44, UI.colors.accent),
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.intro.push(
      this.tweens.add({ targets: this.coinsLabel, alpha: 1, duration: 300, delay: 900 }),
    );

    // La pincelada: el cuadro de la decena se pinta un 10 % más (600 ms)
    const pw = 520;
    const ph = 400;
    this.canvas = new PaintingCanvas(
      this,
      W / 2,
      880,
      pw,
      ph,
      r.paintingIndex,
      paintingPigments(r.paintingIndex, galleryData.levelsPerPainting),
      r.paintingBefore,
    );
    const caption = this.add
      .text(
        W / 2,
        1130,
        t('victory.brush', { pct: r.paintingAfter }),
        textStyle(30, UI.colors.textDim, '600'),
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.timers.push(
      this.time.delayedCall(1000, () => {
        this.intro.push(this.canvas.animateTo(r.paintingAfter));
        this.intro.push(this.tweens.add({ targets: caption, alpha: 1, duration: 200 }));
        if (r.paintingCompleted) {
          this.time.delayedCall(UI.anim.brushMs, () => {
            this.canvas.sign();
            analytics.log('painting_completed', { painting_id: r.paintingIndex });
            caption.setText(t('victory.commission')).setColor(UI.colors.accent);
          });
        }
      }),
    );

    // Confeti
    const pigs = this.params.pigments;
    this.timers.push(this.time.delayedCall(80, () => this.fx.confettiBurst(W / 2, 300, pigs)));
    this.timers.push(
      this.time.delayedCall(UI.anim.victoryMs * 0.45, () =>
        this.fx.confettiBurst(W / 2 - 300, 500, pigs),
      ),
    );
    this.timers.push(
      this.time.delayedCall(UI.anim.victoryMs * 0.7, () =>
        this.fx.confettiBurst(W / 2 + 300, 500, pigs),
      ),
    );

    // Botones
    const nextLevel = r.level + 1;
    const hasNext = nextLevel <= MAX_PRECOMPUTED_LEVEL;
    // En un Encargo el botón principal lleva a la galería, donde el cuadro vuela a su marco.
    const hang = r.paintingCompleted;
    const nextLabel = hang ? t('victory.hang') : hasNext ? t('victory.next') : t('victory.gallery');
    const next = new Button(this, W / 2, 1300, nextLabel, {
      width: 640,
      height: 150,
      fontSize: 50,
    });
    next.onPress = () => {
      if (hang) {
        this.registry.set('justHung', r.paintingIndex);
        goTo(this, 'Gallery');
      } else if (hasNext) goTo(this, 'Level', { level: nextLevel });
      else goTo(this, 'Gallery');
    };
    if (r.stars >= 2 && r.reward.total > 0 && r.level >= adsData.minLevelForRewardedOffers) {
      const dbl = new Button(this, W / 2, 1470, t('victory.double'), {
        width: 640,
        height: 120,
        fontSize: 36,
        color: COLORS.accent,
        outline: true,
        textColor: UI.colors.text,
        icon: '▶',
      });
      dbl.onPress = async () => {
        if (this.doubled) return;
        dbl.setEnabledState(false);
        const { ads, state } = services();
        const res = await ads.showRewarded('rw_double_reward');
        if (res !== 'completed') {
          dbl.setEnabledState(true);
          return;
        }
        this.doubled = true;
        analytics.log('ad_rewarded', { placement: 'rw_double_reward' });
        state.addCoins(r.reward.total);
        this.coinsLabel.setText(t('victory.coins', { n: r.reward.total * 2 }));
        audio.play('victory');
        dbl.setVisible(false);
      };
    }
    if (r.paintingCompleted) {
      // Encargo: compartir el cuadro terminado (A5), botón en la esquina del marco.
      const share = new IconButton(this, W / 2 + 290, 690, 'share', {
        size: 104,
        color: UI.colors.accent,
        iconColor: UI.colors.panel,
      });
      share.setAlpha(0).setDepth(5);
      this.time.delayedCall(1000 + UI.anim.brushMs + 300, () => {
        this.tweens.add({ targets: share, alpha: 1, duration: 250 });
      });
      share.onPress = () => void sharePaintingFromScene(this, this.canvas.spec);
    }
    const replay = new Button(this, W / 2 - 170, 1640, t('victory.replay'), {
      width: 300,
      height: 120,
      fontSize: 36,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
    });
    replay.onPress = () => goTo(this, 'Level', { level: r.level });
    const gallery = new Button(this, W / 2 + 170, 1640, t('victory.gallery'), {
      width: 300,
      height: 120,
      fontSize: 36,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
    });
    gallery.onPress = () => {
      if (r.paintingCompleted) this.registry.set('justHung', r.paintingIndex);
      goTo(this, 'Gallery');
    };

    // Saltable (§9.3): un toque termina la intro de inmediato.
    this.input.on('pointerdown', () => this.skipIntro(r));
    this.events.once('shutdown', () => this.fx.clear());
    fadeIn(this);
  }

  private skipIntro(r: LevelResult): void {
    for (const tm of this.timers) tm.remove(false);
    this.timers = [];
    for (const tw of this.intro) tw.complete();
    this.intro = [];
    this.canvas.setPercent(r.paintingAfter);
    if (r.paintingCompleted) this.canvas.sign(1);
  }
}
