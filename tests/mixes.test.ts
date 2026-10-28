import { describe, expect, it } from 'vitest';
import { buildMixTable, findMix, recipesUnlockedAt } from '../src/core/mixes';
import { createState, dilute, tickDrying, tryPour } from '../src/core/rules';
import { solve } from '../src/core/solver';
import type { LevelRules, LevelState } from '../src/core/types';

const MIX: LevelRules = { mixes: ['blue+yellow'], drying: [] };
const state = (jars: string[][], drying: Record<number, number> = {}): LevelState => ({
  jars,
  capacity: 4,
  moveCount: 0,
  drying,
});

describe('mezclas (§5.1)', () => {
  it('la tabla es simétrica y solo incluye recetas habilitadas', () => {
    const t = buildMixTable(['blue+yellow']);
    expect(findMix(t, 'blue', 'yellow')?.product).toBe('green');
    expect(findMix(t, 'yellow', 'blue')?.product).toBe('green');
    expect(findMix(t, 'red', 'yellow')).toBeUndefined();
  });

  it('desbloqueos por nivel (§5.2)', () => {
    expect(recipesUnlockedAt(5)).toHaveLength(0);
    expect(recipesUnlockedAt(6).map((r) => r.id)).toEqual(['blue+yellow']);
    expect(recipesUnlockedAt(14).map((r) => r.id)).toEqual(['blue+yellow', 'red+yellow']);
    expect(recipesUnlockedAt(18)).toHaveLength(3);
    expect(recipesUnlockedAt(90)).toHaveLength(8);
  });

  it('A sobre B con receta: consume 1 de A y 1 de B, produce 2 de P y detiene el vertido', () => {
    const s = state([['red', 'blue', 'blue'], ['yellow']]);
    const r = tryPour(s, 0, 1, MIX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.kind).toBe('mix');
    expect(r.product).toBe('green');
    expect(r.recipeId).toBe('blue+yellow');
    expect(r.next.jars).toEqual([
      ['red', 'blue'],
      ['green', 'green'],
    ]);
    expect(r.next.moveCount).toBe(1);
  });

  it('requiere al menos 1 espacio libre en el destino', () => {
    const s = state([['blue'], ['yellow', 'yellow', 'yellow', 'yellow']]);
    expect(tryPour(s, 0, 1, MIX)).toEqual({ ok: false, reason: 'full-target' });
    const s2 = state([['blue'], ['red', 'red', 'red', 'yellow']]);
    expect(tryPour(s2, 0, 1, MIX)).toEqual({ ok: false, reason: 'full-target' });
  });

  it('la mezcla es simétrica (B sobre A)', () => {
    const s = state([['yellow'], ['blue']]);
    const r = tryPour(s, 0, 1, MIX);
    expect(r.ok && r.next.jars).toEqual([[], ['green', 'green']]);
  });

  it('sin la receta habilitada no es válido', () => {
    const s = state([['blue'], ['yellow']]);
    expect(tryPour(s, 0, 1, { mixes: [], drying: [] })).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('el solver usa la mezcla cuando es óptimo y el par refleja 1 movimiento por mezcla', () => {
    // [green green blue] [yellow] [] → yellow sobre blue = 2 green en el frasco 0. Par 1.
    const def = { jars: [['green', 'green', 'blue'], ['yellow'], []], capacity: 4, rules: MIX };
    const r = solve(def, { withSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(1);
    expect(r.solution).toEqual([{ from: 1, to: 0 }]);
    expect(solve({ ...def, rules: { mixes: [], drying: [] } }).solvable).toBe(false);
  });

  it('un frasco lleno de reactivos sin mezclar también es victoria (§5.3)', () => {
    const def = {
      jars: [['blue', 'blue', 'blue'], ['blue', 'yellow'], ['yellow', 'yellow', 'yellow'], []],
      capacity: 4,
      rules: MIX,
    };
    const r = solve(def);
    expect(r.solvable).toBe(true);
    expect(r.par).toBe(2);
  });
});

describe('secado (§6)', () => {
  const DRY: LevelRules = { mixes: [], drying: [{ jar: 0, fuse: 2 }] };

  it('createState inicializa la mecha y cada movimiento la baja', () => {
    const s = createState({ jars: [['red', 'blue'], ['blue'], []], capacity: 4, rules: DRY });
    expect(s.drying).toEqual({ 0: 2 });
    const r = tryPour(s, 1, 2, DRY);
    expect(r.ok && r.next.drying).toEqual({ 0: 1 });
    expect(r.ok && r.dried).toEqual([]);
  });

  it('al llegar a 0 se seca (derrota)', () => {
    const s = state([['red', 'blue'], ['blue'], []], { 0: 1 });
    const r = tryPour(s, 1, 2, DRY);
    expect(r.ok && r.dried).toEqual([0]);
  });

  it('cuando el frasco queda resuelto, la mecha se apaga', () => {
    const s = state([['red', 'red', 'red'], ['red'], []], { 0: 1 });
    const r = tryPour(s, 1, 0, DRY);
    expect(r.ok && r.next.drying).toEqual({});
    expect(r.ok && r.dried).toEqual([]);
    const s2 = state([['blue'], ['blue'], []], { 0: 1 });
    const r2 = tryPour(s2, 0, 1, DRY);
    expect(r2.ok && r2.next.drying).toEqual({});
  });

  it('tickDrying y dilute', () => {
    const s = state([['red', 'blue'], []], { 0: 1 });
    expect(tickDrying(s)).toEqual([0]);
    expect(s.drying[0]).toBe(0);
    const d = dilute(s, DRY);
    expect(d.drying[0]).toBe(2);
  });

  it('el solver respeta la mecha: una mecha corta puede hacer el nivel irresoluble', () => {
    const jars = [['a', 'b', 'a', 'b'], ['b', 'a', 'b', 'a'], [], []];
    const free = solve({ jars, capacity: 4, rules: { mixes: [], drying: [] } });
    expect(free.par).toBe(7);
    const tight = solve({ jars, capacity: 4, rules: { mixes: [], drying: [{ jar: 0, fuse: 3 }] } });
    expect(tight.solvable).toBe(false);
    const ok = solve({ jars, capacity: 4, rules: { mixes: [], drying: [{ jar: 0, fuse: 12 }] } });
    expect(ok.solvable).toBe(true);
    expect(ok.par).toBe(7);
  });
});
