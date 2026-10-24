import adsData from '../data/ads.json';

export interface InterstitialConfig {
  minLevel: number;
  everyNWins: number;
  minSecondsSinceLastAd: number;
  notAfterRewarded: boolean;
}

export const interstitialConfig: InterstitialConfig = adsData.interstitial;

export interface AdContext {
  /** Nivel que se acaba de ganar. */
  level: number;
  /** Niveles ganados desde el último intersticial (incluido el actual). */
  winsSinceLastInterstitial: number;
  /** Segundos desde el último anuncio de cualquier tipo (Infinity si nunca). */
  secondsSinceLastAd: number;
  /** Se mostró un rewarded durante este nivel. */
  rewardedThisLevel: boolean;
  adsRemoved: boolean;
}

/** ¿Toca intersticial tras ganar? (§11.2). Lógica pura con tests. */
export function shouldShowInterstitial(
  ctx: AdContext,
  cfg: InterstitialConfig = interstitialConfig,
): boolean {
  if (ctx.adsRemoved) return false;
  if (ctx.level < cfg.minLevel) return false;
  if (ctx.winsSinceLastInterstitial < cfg.everyNWins) return false;
  if (ctx.secondsSinceLastAd < cfg.minSecondsSinceLastAd) return false;
  if (cfg.notAfterRewarded && ctx.rewardedThisLevel) return false;
  return true;
}
