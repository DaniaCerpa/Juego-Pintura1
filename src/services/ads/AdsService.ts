export type RewardedResult = 'completed' | 'skipped' | 'failed';

export interface AdsService {
  isRewardedReady(placement: string): Promise<boolean>;
  showRewarded(placement: string): Promise<RewardedResult>;
  maybeShowInterstitial(context: string): Promise<boolean>; // aplica adPolicy
  setAdsRemoved(removed: boolean): void;
}
