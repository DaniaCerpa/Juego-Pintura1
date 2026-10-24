import { describe, expect, it } from 'vitest';
import { solve } from '../src/core/solver';
import { tryPour, isSolved, createState } from '../src/core/rules';
import { EMPTY_RULES } from '../src/core/types';

const lvl = (jars: string[][]) => ({ jars, capacity: 4, rules: EMPTY_RULES });

describe('solver (§4.1)', () => {
  it('nivel ya resuelto: par 0', () => {
    const r = solve(lvl([['a', 'a', 'a', 'a'], []]));
    expect(r).toMatchObject({ solvable: true, par: 0 });
  });

  it('2 pigmentos, par 2', () => {
    // [a a a b] [b b b] [a] → b al 1, a al 0 = 2 movimientos
    const r = solve(lvl([['a', 'a', 'a', 'b'], ['b', 'b', 'b'], ['a']]));
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(2);
  });

  it('2 pigmentos, par 3 y par 7', () => {
    // [a a a b] [b b b a] [] → b fuera, a al 0, b al 1 = 3
    const r = solve(lvl([['a', 'a', 'a', 'b'], ['b', 'b', 'b', 'a'], []]));
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(3);
    const r7 = solve(lvl([['a', 'b', 'a', 'b'], ['b', 'a', 'b', 'a'], [], []]));
    expect(r7.par).toBe(7);
  });

  it('3 pigmentos con par conocido y solución válida según rules', () => {
    const def = lvl([['a', 'b', 'c', 'a'], ['b', 'c', 'a', 'b'], ['c', 'a', 'b', 'c'], [], []]);
    const r = solve(def, { withSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.par).toBeGreaterThan(0);
    expect(r.solution).toHaveLength(r.par);
    let s = createState(def);
    for (const m of r.solution!) {
      const t = tryPour(s, m.from, m.to, EMPTY_RULES);
      expect(t.ok).toBe(true);
      if (t.ok) s = t.next;
    }
    expect(isSolved(s)).toBe(true);
  });

  it('4 y 5 pigmentos se resuelven y el par es estable', () => {
    const r4 = solve(
      lvl([
        ['a', 'b', 'c', 'd'],
        ['b', 'c', 'd', 'a'],
        ['c', 'd', 'a', 'b'],
        ['d', 'a', 'b', 'c'],
        [],
        [],
      ]),
    );
    expect(r4.solvable).toBe(true);
    expect(r4.par).toBeGreaterThanOrEqual(8);
    const r5 = solve(
      lvl([
        ['a', 'b', 'c', 'd'],
        ['e', 'c', 'd', 'a'],
        ['c', 'd', 'e', 'b'],
        ['d', 'a', 'b', 'e'],
        ['e', 'a', 'b', 'c'],
        [],
        [],
      ]),
    );
    expect(r5.solvable).toBe(true);
    expect(r5.par).toBeGreaterThanOrEqual(10);
  });

  it('nivel irresoluble (sin frascos vacíos)', () => {
    const r = solve(
      lvl([
        ['a', 'b', 'a', 'b'],
        ['b', 'a', 'b', 'a'],
      ]),
    );
    expect(r.solvable).toBe(false);
    expect(r.verified).toBe(true);
    expect(r.par).toBe(-1);
  });

  it('límite de estados → no verificable', () => {
    const r = solve(
      lvl([
        ['a', 'b', 'c', 'd'],
        ['e', 'c', 'd', 'a'],
        ['c', 'd', 'e', 'b'],
        ['d', 'a', 'b', 'e'],
        ['e', 'a', 'b', 'c'],
        [],
        [],
      ]),
      { maxStates: 5 },
    );
    expect(r.solvable).toBe(false);
    expect(r.verified).toBe(false);
  });

  it('acepta un LevelState como entrada', () => {
    const s = createState(lvl([['a', 'a', 'a', 'b'], ['b', 'b', 'b', 'a'], []]));
    expect(solve(s).par).toBe(3);
  });
});
