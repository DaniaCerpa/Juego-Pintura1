import Phaser from 'phaser';
import type { IncompletePigment } from '../core/deadEnd';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, textStyle, UI, W } from '../ui/theme';
import { dim } from '../ui/transitions';
import type { LevelScene } from './LevelScene';

export interface DeadEndData {
  from: string;
  kind: 'noMoves' | 'unsolvable';
  incomplete: IncompletePigment[];
  canUndo: boolean;
  /** El frasco vacío extra está disponible y rescataría la partida. */
  offerExtraJar: boolean;
}

/**
 * Partida sin salida: avisa por qué (no quedan vertidos, o los colores ya no alcanzan para
 * llenar frascos tras una mezcla) y ofrece deshacer gratis, el frasco vacío o empezar de nuevo.
 */
export class DeadEndScene extends Phaser.Scene {
  private params!: DeadEndData;

  constructor() {
    super('DeadEnd');
  }

  init(data: DeadEndData): void {
    this.params = data;
  }

  create(): void {
    const { audio } = services();
    dim(this, 0.75);
    const p = this.params;
    const panelW = 860;
    const buttons = [p.canUndo, p.offerExtraJar, true].filter(Boolean).length;
    const panelH = 400 + buttons * 140;
    const x = (W - panelW) / 2;
    const y = 960 - panelH / 2;
    const g = this.add.graphics();
    g.fillStyle(COLORS.background, 1);
    g.fillRoundedRect(x, y, panelW, panelH, 40);
    g.lineStyle(4, COLORS.accent, 0.7);
    g.strokeRoundedRect(x, y, panelW, panelH, 40);
    this.add
      .text(W / 2, y + 90, t('deadEnd.title'), textStyle(58, UI.colors.accent))
      .setOrigin(0.5);

    let body = p.kind === 'noMoves' ? t('deadEnd.noMoves') : t('deadEnd.unsolvable');
    if (p.incomplete.length > 0) {
      const list = p.incomplete
        .map((i) => t('deadEnd.count', { pigment: t(`pigment.${i.pigment}`), n: i.count }))
        .join(', ');
      body += '\n' + t('deadEnd.incomplete', { list });
    }
    if (p.offerExtraJar) body += '\n' + t('deadEnd.extraJarHelps');
    this.add
      .text(W / 2, y + 160, body, {
        ...textStyle(32, UI.colors.textDim, '600'),
        wordWrap: { width: panelW - 120 },
        lineSpacing: 8,
      })
      .setOrigin(0.5, 0);

    const level = this.scene.get(this.params.from) as LevelScene;
    const close = (then: () => void) => {
      this.scene.stop();
      this.scene.resume(this.params.from);
      then();
    };
    let by = y + panelH - buttons * 140 + 30;
    const mk = (label: string, primary: boolean, onPress: () => void) => {
      const b = new Button(this, W / 2, by, label, {
        width: 660,
        height: 116,
        fontSize: 38,
        color: primary ? COLORS.accent : COLORS.backgroundLight,
        textColor: primary ? UI.colors.panel : UI.colors.text,
      });
      b.onPress = onPress;
      by += 140;
    };
    if (p.canUndo) mk(t('deadEnd.undo'), true, () => close(() => level.undoFromDeadEnd()));
    if (p.offerExtraJar)
      mk(t('deadEnd.extraJar'), !p.canUndo, () => close(() => level.requestExtraJar()));
    mk(t('deadEnd.restart'), !p.canUndo && !p.offerExtraJar, () => close(() => level.restart()));
    audio.play('error');
  }
}
