import Phaser from 'phaser';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, textStyle, UI, W } from '../ui/theme';
import { dim } from '../ui/transitions';

export interface OfferData {
  from: string;
  title: string;
  placement: string;
  coinCost: number;
  onResult: (paidWith: 'rewarded' | 'coins' | null) => void;
}

/** Elección de pago de una ayuda (§3.5 F1+): ver anuncio o gastar monedas. Overlay. */
export class OfferScene extends Phaser.Scene {
  private params!: OfferData;

  constructor() {
    super('Offer');
  }

  init(data: OfferData): void {
    this.params = data;
  }

  create(): void {
    const { ads, state, analytics, audio } = services();
    dim(this, 0.7);
    const panelW = 760;
    const panelH = 640;
    const x = (W - panelW) / 2;
    const y = 600;
    const g = this.add.graphics();
    g.fillStyle(COLORS.background, 1);
    g.fillRoundedRect(x, y, panelW, panelH, 40);
    g.lineStyle(3, COLORS.accent, 0.5);
    g.strokeRoundedRect(x, y, panelW, panelH, 40);
    this.add.text(W / 2, y + 80, this.params.title, textStyle(48, UI.colors.accent)).setOrigin(0.5);
    this.add
      .text(W / 2, y + 150, t('offer.title'), textStyle(32, UI.colors.textDim, '600'))
      .setOrigin(0.5);

    const close = (paidWith: 'rewarded' | 'coins' | null) => {
      this.scene.stop();
      this.scene.resume(this.params.from);
      this.params.onResult(paidWith);
    };
    const mk = (yy: number, label: string, primary: boolean) =>
      new Button(this, W / 2, yy, label, {
        width: 600,
        height: 120,
        fontSize: 38,
        color: primary ? COLORS.accent : COLORS.backgroundLight,
        textColor: primary ? UI.colors.onAccent : UI.colors.text,
      });
    const adBtn = mk(y + 270, t('offer.ad'), true);
    adBtn.onPress = async () => {
      adBtn.setEnabledState(false);
      const ready = await ads.isRewardedReady(this.params.placement);
      if (!ready) {
        close(null);
        return;
      }
      const res = await ads.showRewarded(this.params.placement);
      if (res === 'completed') analytics.log('ad_rewarded', { placement: this.params.placement });
      close(res === 'completed' ? 'rewarded' : null);
    };
    const coinsBtn = mk(y + 410, t('offer.coins', { n: this.params.coinCost }), false);
    coinsBtn.setEnabledState(state.coins >= this.params.coinCost);
    coinsBtn.onPress = () => {
      if (!state.spendCoins(this.params.coinCost)) {
        audio.play('error');
        return;
      }
      close('coins');
    };
    const cancel = mk(y + 550, t('offer.cancel'), false);
    cancel.onPress = () => close(null);
  }
}
