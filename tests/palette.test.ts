import { describe, expect, it } from 'vitest';
import { deltaE2000, hexToRgb, simulateDeuteranopia } from '../src/core/color';
import { pigmentsConfig } from '../src/core/pigments';

const cfg = pigmentsConfig;

describe('paleta legible (§10, B4)', () => {
  it('ΔE2000 de referencia: mismo color 0, blanco/negro ~100', () => {
    expect(deltaE2000([10, 20, 30], [10, 20, 30])).toBeCloseTo(0, 6);
    expect(deltaE2000([255, 255, 255], [0, 0, 0])).toBeGreaterThan(99);
  });

  it(`todos los pares de pigmentos con ΔE2000 ≥ ${cfg.minDeltaE} y ≥ ${cfg.minDeltaEDeuteranopia} con deuteranopia`, () => {
    const ps = cfg.pigments;
    const fails: string[] = [];
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = hexToRgb(ps[i].hex);
        const b = hexToRgb(ps[j].hex);
        const n = deltaE2000(a, b);
        const d = deltaE2000(simulateDeuteranopia(a), simulateDeuteranopia(b));
        if (n < cfg.minDeltaE || d < cfg.minDeltaEDeuteranopia) {
          fails.push(`${ps[i].id}/${ps[j].id} ΔE=${n.toFixed(1)} deut=${d.toFixed(1)}`);
        }
      }
    }
    expect(fails).toEqual([]);
  });
});
