import Phaser from 'phaser';
import { economyConfig } from '../core/economy';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, textStyle, UI, W } from '../ui/theme';
import { dim } from '../ui/transitions';
import type { LevelScene } from './LevelScene';

export interface DefeatData {
  from: string;
  level: number;
}

/** Derrota por secado (§6, §9.1.5): "Diluir (ver anuncio)" o "Lienzo nuevo". Overlay. */
export class DefeatScene extends Phaser.Scene {
  private params!: DefeatData;

  constructor() {
    super('Defeat');
  }

  init(data: DefeatData): void {
    this.params = data;
  }

  create(): void {
    const { ads, state, analytics, audio } = services();
    dim(this, 0.8);
    const panelW = 800;
    const panelH = 860;
    const x = (W - panelW) / 2;
    const y = 480;
    const g = this.add.graphics();
    g.fillStyle(COLORS.background, 1);
    g.fillRoundedRect(x, y, panelW, panelH, 40);
    g.lineStyle(4, COLORS.danger, 0.7);
    g.strokeRoundedRect(x, y, panelW, panelH, 40);
    this.add
      .text(W / 2, y + 100, t('defeat.title'), textStyle(60, UI.colors.danger))
      .setOrigin(0.5);
    this.add
      .text(W / 2, y + 190, t('defeat.body'), textStyle(32, UI.colors.textDim, '600'))
      .setOrigin(0.5)
      .setWordWrapWidth(680);
    // Mancha seca decorativa
    const blot = this.add.graphics();
    blot.fillStyle(0x6b5a4a, 1);
    blot.fillEllipse(W / 2, y + 300, 220, 70);
    blot.fillStyle(0x4a3d32, 1);
    blot.fillEllipse(W / 2 - 30, y + 296, 120, 40);

    const level = this.scene.get(this.params.from) as LevelScene;
    const resume = () => {
      this.scene.stop();
      this.scene.resume(this.params.from);
    };
    const mk = (yy: number, label: string, primary: boolean) =>
      new Button(this, W / 2, yy, label, {
        width: 640,
        height: 120,
        fontSize: 38,
        color: primary ? COLORS.accent : COLORS.backgroundLight,
        textColor: primary ? UI.colors.onAccent : UI.colors.text,
      });
    mk(y + 430, t('defeat.dilute'), true).onPress = async () => {
      const res = await ads.showRewarded('rw_dilute');
      if (res !== 'completed') return;
      analytics.log('ad_rewarded', { placement: 'rw_dilute' });
      analytics.log('booster_used', { type: 'dilute', paid_with: 'rewarded' });
      resume();
      level.dilute();
    };
    const cost = economyConfig.costs.dilute;
    const coinsBtn = mk(y + 570, t('defeat.diluteCoins', { n: cost }), false);
    coinsBtn.setEnabledState(state.coins >= cost);
    coinsBtn.onPress = () => {
      if (!state.spendCoins(cost)) return;
      analytics.log('booster_used', { type: 'dilute', paid_with: 'coins' });
      resume();
      level.dilute();
    };
    mk(y + 710, t('defeat.restart'), false).onPress = () => {
      resume();
      level.restart();
    };
    audio.play('error');
  }
}
