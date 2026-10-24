import economyData from '../data/economy.json';

export interface EconomyConfig {
  stars: { three: number; two: number };
  rewards: {
    win: number;
    perStar: number;
    firstThreeStars: number;
    commission: number;
    discoverMix: number;
    rewardedCoins: number;
    dailyGift: number[];
  };
  costs: { extraJar: number; undoPack: number; dilute: number };
  helpers: {
    undoFreePerLevel: number;
    undoRewardedPack: number;
    undoHistoryMax: number;
    extraJarsPerLevel: number;
  };
  startingCoins: number;
}

export const economyConfig: EconomyConfig = economyData as EconomyConfig;

export interface WinRewardInput {
  stars: 1 | 2 | 3;
  /** Mejor cantidad de estrellas previa en este nivel (0 si nunca se ganó). */
  previousStars: number;
  isCommission: boolean;
}

export interface WinRewardBreakdown {
  base: number;
  stars: number;
  firstThree: number;
  commission: number;
  total: number;
}

/**
 * Monedas por ganar un nivel (§7.4). Rejugar paga solo la diferencia por estrellas nuevas:
 * la base, el bono de Encargo y el bono de primera vez ★★★ se cobran una sola vez.
 */
export function winReward(
  input: WinRewardInput,
  cfg: EconomyConfig = economyConfig,
): WinRewardBreakdown {
  const first = input.previousStars === 0;
  const newStars = Math.max(0, input.stars - input.previousStars);
  const base = first ? cfg.rewards.win : 0;
  const stars = newStars * cfg.rewards.perStar;
  const firstThree = input.stars === 3 && input.previousStars < 3 ? cfg.rewards.firstThreeStars : 0;
  const commission = first && input.isCommission ? cfg.rewards.commission : 0;
  return { base, stars, firstThree, commission, total: base + stars + firstThree + commission };
}

/** Fecha local YYYY-MM-DD, para el regalo diario. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DailyGiftState {
  lastClaim: string | null;
  streak: number;
}

export interface DailyGiftOffer {
  claimable: boolean;
  /** Día de racha que se cobraría (1–7). */
  day: number;
  amount: number;
}

/**
 * Regalo diario (§7.4): racha 1→7; si se salta un día vuelve a 1; el día 7 se mantiene.
 * `today` es la clave del día actual (`dayKey`).
 */
export function dailyGiftOffer(
  state: DailyGiftState,
  today: string,
  cfg: EconomyConfig = economyConfig,
): DailyGiftOffer {
  const gifts = cfg.rewards.dailyGift;
  if (state.lastClaim === today) {
    const day = Math.min(Math.max(1, state.streak), gifts.length);
    return { claimable: false, day, amount: gifts[day - 1] };
  }
  const yesterday = dayKey(new Date(new Date(today + 'T12:00:00').getTime() - 86_400_000));
  const day = state.lastClaim === yesterday ? Math.min(state.streak + 1, gifts.length) : 1;
  return { claimable: true, day, amount: gifts[day - 1] };
}

export function claimDailyGift(
  state: DailyGiftState,
  today: string,
  cfg = economyConfig,
): DailyGiftState {
  const offer = dailyGiftOffer(state, today, cfg);
  if (!offer.claimable) return state;
  return { lastClaim: today, streak: offer.day };
}
