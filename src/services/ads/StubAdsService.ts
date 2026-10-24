import adsData from '../../data/ads.json';
import type { AdsService, RewardedResult } from './AdsService';

/** Quien muestra el overlay "ANUNCIO (stub)" (una escena Phaser); resuelve al terminar. */
export type AdOverlay = (label: string, durationMs: number) => Promise<void>;

/**
 * Stub de F0/F1 (§11.4): muestra un overlay de 2 s y devuelve `completed`.
 * Los intersticiales no se muestran hasta F1 (adPolicy); aquí siempre devuelve false.
 */
export class StubAdsService implements AdsService {
  private removed = false;

  constructor(private overlay: AdOverlay | null = null) {}

  setOverlay(overlay: AdOverlay): void {
    this.overlay = overlay;
  }

  async isRewardedReady(): Promise<boolean> {
    return true;
  }

  async showRewarded(placement: string): Promise<RewardedResult> {
    if (!this.overlay) return 'completed';
    await this.overlay(placement, adsData.stubDurationMs);
    return 'completed';
  }

  async maybeShowInterstitial(): Promise<boolean> {
    void this.removed;
    return false;
  }

  setAdsRemoved(removed: boolean): void {
    this.removed = removed;
  }
}
