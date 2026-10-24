import Phaser from 'phaser';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, textStyle, UI, W } from '../ui/theme';
import { dim } from '../ui/transitions';
import type { LevelScene } from './LevelScene';

export interface PauseData {
  from: string;
  level: number;
}

/** Pausa (§9.1.6) como overlay sobre la escena de nivel. */
export class PauseScene extends Phaser.Scene {
  private params!: PauseData;

  constructor() {
    super('Pause');
  }

  init(data: PauseData): void {
    this.params = data;
  }

  create(): void {
    dim(this);
    const panelW = 760;
    const panelH = 820;
    const x = (W - panelW) / 2;
    const y = 500;
    const g = this.add.graphics();
    g.fillStyle(COLORS.background, 1);
    g.fillRoundedRect(x, y, panelW, panelH, 40);
    g.lineStyle(3, COLORS.accent, 0.5);
    g.strokeRoundedRect(x, y, panelW, panelH, 40);
    this.add.text(W / 2, y + 90, t('pause.title'), textStyle(64, UI.colors.accent)).setOrigin(0.5);

    const level = this.scene.get(this.params.from) as LevelScene;
    const resume = () => {
      this.scene.stop();
      this.scene.resume(this.params.from);
    };
    const mk = (yy: number, label: string, primary: boolean) =>
      new Button(this, W / 2, yy, label, {
        width: 600,
        height: 120,
        fontSize: 40,
        color: primary ? COLORS.accent : COLORS.backgroundLight,
        textColor: primary ? UI.colors.panel : UI.colors.text,
      });
    mk(y + 230, t('pause.continue'), true).onPress = resume;
    mk(y + 380, t('pause.restart'), false).onPress = () => {
      resume();
      (level as unknown as { restart: () => void }).restart();
    };
    mk(y + 530, t('pause.settings'), false).onPress = () => {
      this.scene.stop(this.params.from);
      this.scene.start('Settings', { from: 'Level', level: this.params.level });
    };
    mk(y + 680, t('pause.exit'), false).onPress = () => {
      this.scene.stop();
      this.scene.resume(this.params.from);
      level.quitToGallery();
    };
    services().audio.play('tap');
  }
}
