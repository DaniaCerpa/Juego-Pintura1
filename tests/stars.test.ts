import { describe, expect, it } from 'vitest';
import { starsFor } from '../src/core/stars';

describe('estrellas (§7.1)', () => {
  it('umbrales par+2 y par+6', () => {
    expect(starsFor(10, 10)).toBe(3);
    expect(starsFor(12, 10)).toBe(3);
    expect(starsFor(13, 10)).toBe(2);
    expect(starsFor(16, 10)).toBe(2);
    expect(starsFor(17, 10)).toBe(1);
    expect(starsFor(99, 10)).toBe(1);
  });
});
