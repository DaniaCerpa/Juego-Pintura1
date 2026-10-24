import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

describe('rng', () => {
  it('misma semilla, misma secuencia', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('int dentro de rango y shuffle conserva elementos', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
    const arr = r.shuffle([1, 2, 3, 4, 5]);
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
