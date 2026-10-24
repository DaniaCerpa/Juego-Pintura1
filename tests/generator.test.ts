import { describe, expect, it } from 'vitest';
import { generateLevel, pickPigments, rejectReason } from '../src/core/generator';
import { difficultyConfig, paramsForLevel } from '../src/core/difficulty';
import { createRng } from '../src/core/rng';
import { solve } from '../src/core/solver';
import { isDistinguishableSet } from '../src/core/pigments';

const LEVELS_PER_ROW = 50;

describe('generador (§4.2) — propiedades', () => {
  it('es determinista: el mismo nivel produce el mismo tablero', () => {
    const a = generateLevel(37);
    const b = generateLevel(37);
    expect(a.def).toEqual(b.def);
  });

  it('rejectReason detecta los tres rechazos del GDD', () => {
    expect(rejectReason([['a', 'a', 'a', 'a'], ['b']], 4)).toBe('frasco inicial uniforme');
    expect(rejectReason([[], []], 4)).toBe('ya resuelto');
    expect(
      rejectReason(
        [
          ['a', 'b'],
          ['a', 'b'],
        ],
        4,
      ),
    ).toBe('dos frascos idénticos');
    expect(
      rejectReason(
        [
          ['a', 'b'],
          ['b', 'a'],
        ],
        4,
      ),
    ).toBeNull();
  });

  it('pickPigments respeta accesibilidad (no red+green con C ≤ 6)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const chosen = pickPigments(createRng(seed), 6, [
        'red',
        'green',
        'blue',
        'yellow',
        'white',
        'purple',
        'orange',
        'pink',
      ]);
      expect(chosen).toHaveLength(6);
      expect(new Set(chosen).size).toBe(6);
      expect(isDistinguishableSet(chosen)).toBe(true);
    }
  });

  // Filas de la tabla §4.3 sin mezclas ni secado (F0). Las filas con esas reglas se
  // cubren en F1; aquí se generan como sort puro para verificar resolubilidad y rango de par.
  const rows = difficultyConfig.rows.filter((r) => r.from !== r.to && r.to <= 300);
  for (const row of rows) {
    it(`fila ${row.from}–${row.to}: ${LEVELS_PER_ROW} niveles resolubles con par en rango`, () => {
      const span = row.to - row.from + 1;
      let outOfRange = 0;
      for (let k = 0; k < LEVELS_PER_ROW; k++) {
        const level = row.from + (k % span);
        const g = generateLevel(level);
        const params = paramsForLevel(level);
        expect(g.solver.solvable).toBe(true);
        expect(rejectReason(g.def.jars, g.def.capacity)).toBeNull();
        expect(g.def.jars.length).toBe(
          new Set(g.def.jars.flat()).size + g.def.jars.filter((j) => j.length === 0).length,
        );
        const inRange = g.def.par >= params.par[0] && g.def.par <= params.par[1];
        if (!inRange) outOfRange++;
        const check = solve(g.def);
        expect(check.solvable).toBe(true);
        expect(check.par).toBe(g.def.par);
      }
      expect(outOfRange).toBe(0);
    });
  }
});
