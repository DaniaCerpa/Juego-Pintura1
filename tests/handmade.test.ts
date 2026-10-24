import { describe, expect, it } from 'vitest';
import { handmadeLevels, getLevelDef, MAX_PRECOMPUTED_LEVEL } from '../src/core/levels';
import { rejectReason } from '../src/core/generator';
import { solve } from '../src/core/solver';

describe('niveles hechos a mano (§4.4) y precalculados', () => {
  it('todos son resolubles y su par coincide con el solver', () => {
    for (const l of handmadeLevels()) {
      const r = solve(l);
      expect(r.solvable, `nivel ${l.id}`).toBe(true);
      expect(r.par, `par nivel ${l.id}`).toBe(l.par);
      expect(l.handmade).toBe(true);
    }
  });

  it('el nivel 21 enseña la mezcla: irresoluble sin mezclar (§4.4)', () => {
    const l = getLevelDef(21)!;
    expect(l.handmade).toBe(true);
    expect(l.rules.mixes).toEqual(['blue+yellow']);
    expect(solve(l).solvable).toBe(true);
    expect(solve({ ...l, rules: { mixes: [], drying: [] } }).solvable).toBe(false);
  });

  it('el nivel 51 enseña el secado con mecha 12 (§6, §8)', () => {
    const l = getLevelDef(51)!;
    expect(l.handmade).toBe(true);
    expect(l.rules.drying).toEqual([{ jar: 1, fuse: 12 }]);
    expect(solve(l).solvable).toBe(true);
  });

  it('niveles 1–3 según §8: frascos y par', () => {
    expect(getLevelDef(1)!.jars).toHaveLength(3);
    expect(getLevelDef(1)!.par).toBe(2);
    expect(getLevelDef(2)!.jars).toHaveLength(4);
    expect(getLevelDef(2)!.par).toBe(3);
    expect(getLevelDef(3)).toBeDefined();
  });

  it('los 500 niveles precalculados existen, son resolubles y tienen los campos del GDD', () => {
    expect(MAX_PRECOMPUTED_LEVEL).toBeGreaterThanOrEqual(500);
    for (let n = 1; n <= 500; n++) {
      const l = getLevelDef(n)!;
      expect(l, `nivel ${n}`).toBeDefined();
      expect(Object.keys(l).sort()).toEqual(
        ['capacity', 'difficulty', 'handmade', 'id', 'jars', 'par', 'rules', 'seed'].sort(),
      );
      if (!l.handmade) expect(rejectReason(l.jars, l.capacity)).toBeNull();
    }
  });

  it('el solver resuelve el nivel 50 en menos de 1 s', () => {
    const l = getLevelDef(50)!;
    const t = performance.now();
    const r = solve(l);
    const ms = performance.now() - t;
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(l.par);
    expect(ms).toBeLessThan(1000);
  });

  it('muestra de niveles precalculados: el par guardado es el del solver', () => {
    for (const n of [4, 10, 21, 33, 50, 77, 120, 250, 400, 500]) {
      const l = getLevelDef(n)!;
      const r = solve(l);
      expect(r.solvable, `nivel ${n}`).toBe(true);
      expect(r.par, `nivel ${n}`).toBe(l.par);
    }
  });
});
