import Phaser from 'phaser';
import { t } from '../ui/i18n';
import { COLORS, H, textStyle, UI, W } from '../ui/theme';
import { dim } from '../ui/transitions';

export interface AdOverlayData {
  label: string;
  durationMs: number;
  onDone: () => void;
}

/** Overlay "ANUNCIO (stub)" del StubAdsService (§11.4). Cuenta atrás y cierra solo. */
export class AdOverlayScene extends Phaser.Scene {
  constructor() {
    super('AdOverlay');
  }

  create(data: AdOverlayData): void {
    dim(this, 0.92);
    const g = this.add.graphics();
    g.fillStyle(COLORS.backgroundLight, 1);
    g.fillRoundedRect(W / 2 - 400, H / 2 - 260, 800, 520, 40);
    const secs = Math.ceil(data.durationMs / 1000);
    const txt = this.add
      .text(W / 2, H / 2 - 40, t('ad.stub', { s: secs }), textStyle(52, UI.colors.text))
      .setOrigin(0.5);
    this.add
      .text(W / 2, H / 2 + 80, data.label, textStyle(32, UI.colors.textDim, '600'))
      .setOrigin(0.5);
    let remaining = secs;
    this.time.addEvent({
      delay: 1000,
      repeat: secs - 1,
      callback: () => {
        remaining--;
        txt.setText(t('ad.stub', { s: Math.max(0, remaining) }));
      },
    });
    this.time.delayedCall(data.durationMs, () => {
      this.scene.stop();
      data.onDone();
    });
  }
}
