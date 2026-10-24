import Phaser from 'phaser';
import { MAX_PRECOMPUTED_LEVEL } from '../core/levels';
import { getPigment } from '../core/pigments';
import type { PigmentId } from '../core/types';
import { Fx } from '../objects/Fx';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, drawBackdrop, hexToNum, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';

export interface VictoryData {
  level: number;
  moves: number;
  par: number;
  firstClear: boolean;
  pigments: PigmentId[];
}

/** Victoria mínima (F0): título, movimientos/par, confeti saltable, Siguiente / Rejugar. */
export class VictoryScene extends Phaser.Scene {
  private params!: VictoryData;
  private fx!: Fx;
  private intro: Phaser.Tweens.Tween[] = [];

  constructor() {
    super('Victory');
  }

  init(data: VictoryData): void {
    this.params = data;
    this.intro = [];
  }

  create(): void {
    const { audio, haptics } = services();
    drawBackdrop(this);
    this.fx = new Fx(this);
    audio.play('victory');
    haptics.vibrate('complete');

    const perfect = this.params.moves <= this.params.par;
    const title = this.add
      .text(
        W / 2,
        520,
        perfect ? t('victory.perfect') : t('victory.title'),
        textStyle(96, UI.colors.accent),
      )
      .setOrigin(0.5)
      .setScale(0.6)
      .setAlpha(0);
    const sub = this.add
      .text(
        W / 2,
        640,
        t('victory.moves', { moves: this.params.moves, par: this.params.par }),
        textStyle(44, UI.colors.text, '600'),
      )
      .setOrigin(0.5)
      .setAlpha(0);
    const lvl = this.add
      .text(
        W / 2,
        400,
        t('level.title', { n: this.params.level }),
        textStyle(40, UI.colors.textDim, '600'),
      )
      .setOrigin(0.5)
      .setAlpha(0);

    // Muestra de los pigmentos del nivel como gotas
    const colors = this.params.pigments.map((p) => hexToNum(getPigment(p).hex));
    const dots = this.add.graphics().setAlpha(0);
    const spacing = 90;
    const x0 = W / 2 - ((colors.length - 1) * spacing) / 2;
    colors.forEach((c, i) => {
      dots.fillStyle(0x000000, 0.3);
      dots.fillCircle(x0 + i * spacing + 4, 806, 32);
      dots.fillStyle(c, 1);
      dots.fillCircle(x0 + i * spacing, 800, 32);
      dots.fillStyle(0xffffff, 0.35);
      dots.fillCircle(x0 + i * spacing - 10, 790, 10);
    });

    this.intro.push(
      this.tweens.add({
        targets: title,
        alpha: 1,
        scale: 1,
        duration: 420,
        ease: 'Back.Out',
        delay: 100,
      }),
      this.tweens.add({ targets: [sub, lvl], alpha: 1, duration: 300, delay: 350 }),
      this.tweens.add({ targets: dots, alpha: 1, duration: 300, delay: 500 }),
    );
    const pigs = this.params.pigments;
    this.time.delayedCall(80, () => this.fx.confettiBurst(W / 2, 300, pigs));
    this.time.delayedCall(UI.anim.victoryMs * 0.45, () =>
      this.fx.confettiBurst(W / 2 - 300, 500, pigs),
    );
    this.time.delayedCall(UI.anim.victoryMs * 0.7, () =>
      this.fx.confettiBurst(W / 2 + 300, 500, pigs),
    );

    const nextLevel = this.params.level + 1;
    const hasNext = nextLevel <= MAX_PRECOMPUTED_LEVEL;
    const next = new Button(this, W / 2, 1180, hasNext ? t('victory.next') : t('victory.gallery'), {
      width: 620,
      height: 150,
      fontSize: 54,
    });
    next.onPress = () =>
      hasNext ? goTo(this, 'Level', { level: nextLevel }) : goTo(this, 'Gallery');
    const replay = new Button(this, W / 2 - 170, 1380, t('victory.replay'), {
      width: 300,
      height: 120,
      fontSize: 38,
      color: COLORS.accent,
      outline: true,
      textColor: UI.colors.text,
    });
    replay.onPress = () => goTo(this, 'Level', { level: this.params.level });
    const gallery = new Button(this, W / 2 + 170, 1380, t('victory.gallery'), {
      width: 300,
      height: 120,
      fontSize: 38,
      color: COLORS.accent,
      outline: true,
      textColor: UI.colors.text,
    });
    gallery.onPress = () => goTo(this, 'Gallery');

    // Saltable: un toque termina la intro de inmediato.
    this.input.on('pointerdown', () => {
      for (const tw of this.intro) tw.complete();
      this.intro = [];
    });
    this.events.once('shutdown', () => this.fx.clear());
    fadeIn(this);
  }
}
