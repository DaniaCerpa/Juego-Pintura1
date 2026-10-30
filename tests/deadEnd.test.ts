import { describe, expect, it } from 'vitest';
import {
  analyzeDeadEnd,
  countsCanComplete,
  hasAnyMove,
  incompletePigments,
} from '../src/core/deadEnd';
import { addExtraJar, tryPour } from '../src/core/rules';
import { EMPTY_RULES, type LevelRules, type LevelState } from '../src/core/types';

function state(jars: string[][], capacity = 4): LevelState {
  return { jars, capacity, moveCount: 0, drying: {} };
}

const MIX: LevelRules = { mixes: ['blue+yellow'], drying: [] };

describe('hasAnyMove', () => {
  it('detecta que no queda ningún vertido válido', () => {
    const s = state([
      ['red', 'blue', 'red', 'blue'],
      ['blue', 'red', 'blue', 'red'],
    ]);
    expect(hasAnyMove(s, EMPTY_RULES)).toBe(false);
  });

  it('un frasco vacío siempre permite mover', () => {
    const s = state([['red', 'blue'], []]);
    expect(hasAnyMove(s, EMPTY_RULES)).toBe(true);
  });
});

describe('analyzeDeadEnd', () => {
  it('sin problema en un tablero resoluble', () => {
    const s = state([['red', 'red', 'red', 'blue'], ['blue', 'blue', 'blue'], ['red']]);
    expect(analyzeDeadEnd(s, EMPTY_RULES).kind).toBe('none');
  });

  it('sin movimientos → noMoves', () => {
    const s = state([
      ['red', 'blue', 'red', 'blue'],
      ['blue', 'red', 'blue', 'red'],
    ]);
    expect(analyzeDeadEnd(s, EMPTY_RULES).kind).toBe('noMoves');
  });

  it('mezcla accidental: los colores ya no completan frascos → unsolvable con detalle', () => {
    // Tras mezclar de más: 3 azules y 1 amarillo. Solo cabe 1 mezcla más y quedan 2 azules
    // que nunca llenarán un frasco.
    const s = state([
      ['blue', 'blue', 'blue'],
      ['yellow'],
      ['green', 'green', 'green', 'green'],
      ['green', 'green'],
      [],
    ]);
    const r = analyzeDeadEnd(s, MIX);
    expect(r.kind).toBe('unsolvable');
    if (r.kind === 'none') return;
    expect(r.incomplete).toEqual(
      expect.arrayContaining([
        { pigment: 'blue', count: 3 },
        { pigment: 'yellow', count: 1 },
        { pigment: 'green', count: 6 },
      ]),
    );
  });

  it('colores incompletos que aún se pueden mezclar no son sin salida', () => {
    const s = state([
      ['blue', 'blue', 'blue'],
      ['yellow', 'yellow', 'yellow'],
      ['green', 'green'],
      [],
    ]);
    expect(analyzeDeadEnd(s, MIX).kind).toBe('none');
  });

  it('informa si un frasco vacío extra salvaría la partida', () => {
    const s = state([
      ['red', 'blue', 'red', 'blue'],
      ['blue', 'red', 'blue', 'red'],
    ]);
    const r = analyzeDeadEnd(s, EMPTY_RULES, { checkExtraJar: true });
    expect(r.kind).toBe('noMoves');
    if (r.kind === 'none') return;
    expect(r.extraJarHelps).toBe(true);
  });

  it('no declara sin salida si no alcanzó a verificar', () => {
    const s = state([['red', 'blue', 'red', 'blue'], ['blue', 'red', 'blue', 'red'], [], []]);
    const r = analyzeDeadEnd(s, EMPTY_RULES, { maxStates: 1 });
    expect(r.kind).toBe('none');
  });
});

describe('countsCanComplete', () => {
  it('sin mezclas, cantidades que no llenan frascos son imposibles', () => {
    expect(countsCanComplete(state([['red', 'red', 'red'], ['blue']]), EMPTY_RULES)).toBe(false);
    expect(countsCanComplete(state([['red', 'red', 'red', 'red'], []]), EMPTY_RULES)).toBe(true);
  });

  it('con mezclas busca alguna cantidad de mezclas que cuadre', () => {
    // 3 azules + 3 amarillos + 2 verdes: 3 mezclas → 8 verdes. Posible.
    const ok = state([
      ['blue', 'blue', 'blue'],
      ['yellow', 'yellow', 'yellow'],
      ['green', 'green'],
    ]);
    expect(countsCanComplete(ok, MIX)).toBe(true);
    // 3 azules + 1 amarillo + 6 verdes: ninguna cantidad de mezclas cuadra.
    const bad = state(
      [
        ['blue', 'blue', 'blue'],
        ['yellow'],
        ['green', 'green', 'green', 'green', 'green', 'green'],
      ],
      8,
    );
    expect(countsCanComplete({ ...bad, capacity: 4 }, MIX)).toBe(false);
  });
});

describe('incompletePigments', () => {
  it('lista los pigmentos cuya cantidad no llena frascos', () => {
    const s = state([['red', 'red', 'red', 'red'], ['blue', 'blue', 'blue'], ['green']]);
    expect(incompletePigments(s)).toEqual([
      { pigment: 'blue', count: 3 },
      { pigment: 'green', count: 1 },
    ]);
  });
});

describe('frasco extra conserva el historial (regresión)', () => {
  it('addExtraJar aplicado al historial deja todos los estados con el mismo número de frascos', () => {
    const s0 = state([['red', 'blue'], ['blue', 'red'], []]);
    const r = tryPour(s0, 0, 2, EMPTY_RULES);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const history = [s0].map(addExtraJar);
    const current = addExtraJar(r.next);
    expect(history[0].jars.length).toBe(current.jars.length);
  });
});
