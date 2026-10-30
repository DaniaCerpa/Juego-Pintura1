import Phaser from 'phaser';
import { services } from '../services';
import { Button } from '../ui/Button';
import { getLang, t, type Lang } from '../ui/i18n';
import { COLORS, drawBackdrop, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';

export interface SettingsData {
  from: string;
  level?: number;
}

/** Ajustes (§9.1.8): sonido, música, vibración, idioma, símbolos de accesibilidad. */
export class SettingsScene extends Phaser.Scene {
  private params!: SettingsData;

  constructor() {
    super('Settings');
  }

  init(data: SettingsData): void {
    this.params = data ?? { from: 'Gallery' };
  }

  create(): void {
    const { state, audio } = services();
    drawBackdrop(this);
    this.add
      .text(W / 2, 180, t('settings.title'), textStyle(84, UI.colors.accentDark))
      .setOrigin(0.5);

    const rows: Array<{ key: string; label: string; get: () => string; toggle: () => void }> = [
      {
        key: 'sound',
        label: t('settings.sound'),
        get: () => (state.settings.sound ? t('common.on') : t('common.off')),
        toggle: () => state.updateSettings({ sound: !state.settings.sound }),
      },
      {
        key: 'music',
        label: t('settings.music'),
        get: () => (state.settings.music ? t('common.on') : t('common.off')),
        toggle: () => state.updateSettings({ music: !state.settings.music }),
      },
      {
        key: 'vibration',
        label: t('settings.vibration'),
        get: () => (state.settings.vibration ? t('common.on') : t('common.off')),
        toggle: () => state.updateSettings({ vibration: !state.settings.vibration }),
      },
      {
        key: 'language',
        label: t('settings.language'),
        get: () => (getLang() === 'es' ? 'Español' : 'English'),
        toggle: () => {
          const next: Lang = getLang() === 'es' ? 'en' : 'es';
          state.updateSettings({ lang: next });
          this.scene.restart(this.params);
        },
      },
      {
        key: 'accessibility',
        label: t('settings.accessibility'),
        get: () => (state.settings.accessibility ? t('common.on') : t('common.off')),
        toggle: () => state.updateSettings({ accessibility: !state.settings.accessibility }),
      },
    ];

    rows.forEach((row, i) => {
      const y = 400 + i * 190;
      const g = this.add.graphics();
      g.fillStyle(COLORS.panel, 0.55);
      g.fillRoundedRect(60, y - 70, W - 120, 140, 30);
      this.add.text(110, y, row.label, textStyle(40, UI.colors.text, '600')).setOrigin(0, 0.5);
      const btn = new Button(this, W - 230, y, row.get(), {
        width: 260,
        height: 96,
        fontSize: 34,
        color: COLORS.accent,
      });
      btn.onPress = () => {
        row.toggle();
        audio.play('tap');
        btn.setText(row.get());
      };
    });

    const back = new Button(this, W / 2, 1560, t('common.back'), {
      width: 520,
      height: 140,
      fontSize: 48,
    });
    back.onPress = () => {
      if (this.params.from === 'Level' && this.params.level)
        goTo(this, 'Level', { level: this.params.level });
      else goTo(this, 'Gallery');
    };
    this.add
      .text(
        W / 2,
        1760,
        t('settings.version', { v: __APP_VERSION__ }),
        textStyle(28, UI.colors.onWallDim, '600'),
      )
      .setOrigin(0.5);
    fadeIn(this);
  }
}
