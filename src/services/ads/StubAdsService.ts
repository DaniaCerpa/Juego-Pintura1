import adsData from '../../data/ads.json';
import { shouldShowInterstitial } from '../../core/adPolicy';
import type { AdsService, RewardedResult } from './AdsService';

/** Quien muestra el overlay "ANUNCIO (stub)" (una escena Phaser); resuelve al terminar. */
export type AdOverlay = (label: string, durationMs: number) => Promise<void>;

/**
 * Stub de F0/F1 (§11.4): muestra un overlay de 2 s y devuelve `completed`.
 * Lleva el contexto de la política de intersticiales (§11.2) y delega la decisión en
 * `core/adPolicy.ts`.
 */
export class StubAdsService implements AdsService {
  private removed = false;
  private overlay: AdOverlay | null = null;
  private lastAdAt = -Infinity;
  private winsSinceInterstitial = 0;
  private currentLevel = 0;
  private rewardedThisLevel = false;
  private analytics: ((event: string, params: Record<string, unknown>) => void) | null = null;

  setOverlay(overlay: AdOverlay): void {
    this.overlay = overlay;
  }

  setAnalytics(log: (event: string, params: Record<string, unknown>) => void): void {
    this.analytics = log;
  }

  /** La escena de nivel lo llama al empezar cada nivel. */
  onLevelStart(level: number): void {
    this.currentLevel = level;
    this.rewardedThisLevel = false;
  }

  async isRewardedReady(_placement: string): Promise<boolean> {
    void _placement;
    return true;
  }

  async showRewarded(placement: string): Promise<RewardedResult> {
    this.rewardedThisLevel = true;
    this.lastAdAt = Date.now();
    this.analytics?.('ad_shown', { type: 'rewarded', placement });
    if (this.overlay) await this.overlay(placement, adsData.stubDurationMs);
    return 'completed';
  }

  async maybeShowInterstitial(context: string): Promise<boolean> {
    if (context === 'level_win') this.winsSinceInterstitial += 1;
    const show = shouldShowInterstitial({
      level: this.currentLevel,
      winsSinceLastInterstitial: this.winsSinceInterstitial,
      secondsSinceLastAd: (Date.now() - this.lastAdAt) / 1000,
      rewardedThisLevel: this.rewardedThisLevel,
      adsRemoved: this.removed,
    });
    if (!show) return false;
    this.winsSinceInterstitial = 0;
    this.lastAdAt = Date.now();
    this.analytics?.('ad_shown', { type: 'interstitial', placement: context });
    if (this.overlay) await this.overlay('interstitial', adsData.stubDurationMs);
    return true;
  }

  setAdsRemoved(removed: boolean): void {
    this.removed = removed;
  }
}
