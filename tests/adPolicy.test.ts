import { describe, expect, it } from 'vitest';
import { shouldShowInterstitial } from '../src/core/adPolicy';

const ok = {
  level: 12,
  winsSinceLastInterstitial: 3,
  secondsSinceLastAd: 1000,
  rewardedThisLevel: false,
  adsRemoved: false,
};

describe('adPolicy (§11.2)', () => {
  it('caso base: toca', () => expect(shouldShowInterstitial(ok)).toBe(true));
  it('nunca antes del nivel 8', () => {
    expect(shouldShowInterstitial({ ...ok, level: 7 })).toBe(false);
    expect(shouldShowInterstitial({ ...ok, level: 8 })).toBe(true);
  });
  it('máximo 1 cada 3 niveles ganados', () => {
    expect(shouldShowInterstitial({ ...ok, winsSinceLastInterstitial: 2 })).toBe(false);
  });
  it('mínimo 90 s desde el último ad', () => {
    expect(shouldShowInterstitial({ ...ok, secondsSinceLastAd: 89 })).toBe(false);
    expect(shouldShowInterstitial({ ...ok, secondsSinceLastAd: 90 })).toBe(true);
  });
  it('nunca justo después de un rewarded', () => {
    expect(shouldShowInterstitial({ ...ok, rewardedThisLevel: true })).toBe(false);
  });
  it('sin ads si se compró remove_ads', () => {
    expect(shouldShowInterstitial({ ...ok, adsRemoved: true })).toBe(false);
  });
});
