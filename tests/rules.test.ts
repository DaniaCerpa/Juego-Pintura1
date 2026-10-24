import { describe, expect, it } from 'vitest';
import {
  addExtraJar,
  createState,
  isJarResolved,
  isSolved,
  topRun,
  tryPour,
} from '../src/core/rules';
import { EMPTY_RULES, type LevelState } from '../src/core/types';

function state(jars: string[][], capacity = 4): LevelState {
  return { jars, capacity, moveCount: 0, drying: {} };
}

describe('tryPour (§3.2)', () => {
  it('vierte a un destino vacío todas las capas contiguas del tope', () => {
    const s = state([['red', 'blue', 'blue'], []]);
    const r = tryPour(s, 0, 1, EMPTY_RULES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.jars).toEqual([['red'], ['blue', 'blue']]);
    expect(r.layers).toBe(2);
    expect(r.pigment).toBe('blue');
    expect(r.next.moveCount).toBe(1);
  });

  it('vierte sobre el mismo pigmento en destino parcial', () => {
    const s = state([['blue', 'red'], ['red']]);
    const r = tryPour(s, 0, 1, EMPTY_RULES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.jars).toEqual([['blue'], ['red', 'red']]);
  });

  it('rechaza destino lleno', () => {
    const s = state([['red'], ['red', 'red', 'red', 'red']]);
    const r = tryPour(s, 0, 1, EMPTY_RULES);
    expect(r).toEqual({ ok: false, reason: 'full-target' });
  });

  it('vertido parcial: solo cabe lo que queda libre (ejemplo del GDD)', () => {
    const s = state([
      ['blue', 'red', 'red', 'red'],
      ['red', 'red', 'red'],
    ]);
    const r = tryPour(s, 0, 1, EMPTY_RULES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layers).toBe(1);
    expect(r.next.jars).toEqual([
      ['blue', 'red', 'red'],
      ['red', 'red', 'red', 'red'],
    ]);
  });

  it('rechaza origen vacío', () => {
    const s = state([[], ['red']]);
    expect(tryPour(s, 0, 1, EMPTY_RULES)).toEqual({ ok: false, reason: 'empty-source' });
  });

  it('rechaza pigmentos distintos', () => {
    const s = state([['red'], ['blue']]);
    expect(tryPour(s, 0, 1, EMPTY_RULES)).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('mismo frasco = deseleccionar, no es movimiento', () => {
    const s = state([['red'], ['blue']]);
    expect(tryPour(s, 0, 0, EMPTY_RULES)).toEqual({ ok: false, reason: 'same' });
  });

  it('rechaza índices fuera de rango', () => {
    const s = state([['red'], ['blue']]);
    expect(tryPour(s, 0, 5, EMPTY_RULES)).toEqual({ ok: false, reason: 'out-of-range' });
  });

  it('no muta el estado original', () => {
    const s = state([['red', 'blue'], []]);
    const snapshot = JSON.stringify(s);
    tryPour(s, 0, 1, EMPTY_RULES);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('isSolved (§3.3)', () => {
  it('victoria con frascos llenos uniformes o vacíos', () => {
    expect(
      isSolved(state([['red', 'red', 'red', 'red'], [], ['blue', 'blue', 'blue', 'blue']])),
    ).toBe(true);
  });
  it('un frasco uniforme pero parcial no cuenta', () => {
    expect(isSolved(state([['red', 'red', 'red'], ['red']]))).toBe(false);
  });
  it('isJarResolved y topRun', () => {
    expect(isJarResolved([], 4)).toBe(true);
    expect(isJarResolved(['a', 'a', 'a', 'a'], 4)).toBe(true);
    expect(isJarResolved(['a', 'a', 'b', 'a'], 4)).toBe(false);
    expect(topRun(['a', 'b', 'b'])).toBe(2);
    expect(topRun([])).toBe(0);
  });
});

describe('estado y frasco extra', () => {
  it('createState copia los frascos y no comparte referencias', () => {
    const def = { jars: [['red'], []], capacity: 4, rules: EMPTY_RULES };
    const s = createState(def);
    s.jars[0].push('blue');
    expect(def.jars[0]).toEqual(['red']);
  });
  it('addExtraJar agrega un frasco vacío al final', () => {
    const s = addExtraJar(state([['red']]));
    expect(s.jars).toEqual([['red'], []]);
  });
});
