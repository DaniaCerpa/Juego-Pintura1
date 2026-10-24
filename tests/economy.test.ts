import { describe, expect, it } from 'vitest';
import {
  claimDailyGift,
  dailyGiftOffer,
  dayKey,
  winReward,
  type DailyGiftState,
} from '../src/core/economy';

describe('economía (§7.4)', () => {
  it('primera victoria: base + estrellas (+ bono ★★★)', () => {
    expect(winReward({ stars: 2, previousStars: 0, isCommission: false }).total).toBe(25 + 20);
    expect(winReward({ stars: 3, previousStars: 0, isCommission: false }).total).toBe(25 + 30 + 20);
  });
  it('encargo paga 150 extra solo la primera vez', () => {
    expect(winReward({ stars: 1, previousStars: 0, isCommission: true }).total).toBe(25 + 10 + 150);
    expect(winReward({ stars: 1, previousStars: 1, isCommission: true }).total).toBe(0);
  });
  it('rejugar paga solo la diferencia por estrellas nuevas', () => {
    expect(winReward({ stars: 3, previousStars: 1, isCommission: false }).total).toBe(20 + 20);
    expect(winReward({ stars: 2, previousStars: 3, isCommission: false }).total).toBe(0);
    expect(winReward({ stars: 2, previousStars: 2, isCommission: false }).total).toBe(0);
  });
  it('regalo diario: racha 1→7, se reinicia si se salta un día, no se cobra dos veces', () => {
    let s = { lastClaim: null as string | null, streak: 0 };
    const d1 = dailyGiftOffer(s, '2026-10-24');
    expect(d1).toEqual({ claimable: true, day: 1, amount: 50 });
    s = claimDailyGift(s, '2026-10-24');
    expect(dailyGiftOffer(s, '2026-10-24').claimable).toBe(false);
    s = claimDailyGift(s, '2026-10-25');
    expect(s.streak).toBe(2);
    expect(dailyGiftOffer(s, '2026-10-26').amount).toBe(75);
    // Salta un día
    expect(dailyGiftOffer(s, '2026-10-27')).toEqual({ claimable: true, day: 1, amount: 50 });
    // Tope en 7
    let t: DailyGiftState = { lastClaim: '2026-10-30', streak: 7 };
    t = claimDailyGift(t, '2026-10-31');
    expect(t.streak).toBe(7);
    expect(dailyGiftOffer(t, '2026-11-01').amount).toBe(200);
  });
  it('dayKey usa fecha local', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
