import { describe, expect, it } from 'vitest';
import { dryingExtraFor, estimateDifficulty, paramsForLevel } from '../src/core/difficulty';

describe('curva de dificultad (§4.3)', () => {
  it('mapea niveles a filas', () => {
    expect(paramsForLevel(1).pigments).toEqual([2, 2]);
    expect(paramsForLevel(4).pigments).toEqual([3, 3]);
    expect(paramsForLevel(11).par).toEqual([8, 14]);
    expect(paramsForLevel(8).mixes).toEqual([1, 1]);
    expect(paramsForLevel(22).mixes).toEqual([1, 2]);
    expect(paramsForLevel(999).pigments).toEqual([9, 12]);
  });
  it('respiro cada 5 y encargo cada 10', () => {
    expect(paramsForLevel(15).breather).toBe(true);
    expect(paramsForLevel(15).pigments).toEqual([4, 4]);
    // El nivel 5 no tiene fila anterior usable (1–3 es a mano): sin respiro.
    expect(paramsForLevel(5).breather).toBe(false);
    expect(paramsForLevel(5).pigments).toEqual([3, 3]);
    expect(paramsForLevel(20).commission).toBe(true);
    expect(paramsForLevel(20).breather).toBe(false);
    expect(paramsForLevel(14).breather).toBe(false);
  });
  it('el respiro conserva las reglas de su fila (mezclas/secado)', () => {
    expect(paramsForLevel(35).mixes).toEqual([1, 2]);
    expect(paramsForLevel(35).drying).toEqual([1, 1]);
    expect(paramsForLevel(55).drying).toEqual([1, 1]);
  });
  it('margen de secado por nivel (F1.5): +2 hasta el 80, +1 desde el 81', () => {
    expect(dryingExtraFor(30)).toBe(2);
    expect(dryingExtraFor(80)).toBe(2);
    expect(dryingExtraFor(81)).toBe(1);
    expect(dryingExtraFor(400)).toBe(1);
  });
  it('rechaza niveles inválidos', () => {
    expect(() => paramsForLevel(0)).toThrow();
  });
  it('estimateDifficulty es monótona y acotada', () => {
    expect(estimateDifficulty(2, 0, 0)).toBe(1);
    expect(estimateDifficulty(70, 3, 2)).toBe(10);
    expect(estimateDifficulty(20, 0, 0)).toBeLessThan(estimateDifficulty(40, 0, 0));
  });
});
