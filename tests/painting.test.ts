import { describe, expect, it } from 'vitest';
import {
  generatePainting,
  paintingIndexFor,
  REGION_ORDER,
  regionBoundsPx,
  regionsRevealed,
  revealPercent,
  shadeHex,
} from '../src/core/painting';

describe('cuadros procedurales (§7.3)', () => {
  it('determinista por índice y paleta', () => {
    const a = generatePainting(3, ['red', 'blue', 'yellow']);
    const b = generatePainting(3, ['red', 'blue', 'yellow']);
    expect(a).toEqual(b);
    expect(generatePainting(4, ['red', 'blue', 'yellow'])).not.toEqual(a);
  });
  it('formas dentro del lienzo, colores hex válidos y 10 regiones con sentido', () => {
    const p = generatePainting(0, ['green', 'orange', 'purple', 'white']);
    expect(p.shapes.length).toBeGreaterThan(8);
    for (const s of p.shapes) {
      expect(s.x).toBeGreaterThanOrEqual(-0.2);
      expect(s.x).toBeLessThanOrEqual(1.2);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(1.05);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(p.regions.map((r) => r.key)).toEqual(REGION_ORDER);
    expect(p.regions).toHaveLength(10);
    for (const r of p.regions) {
      expect(r.shapes.length, r.key).toBeGreaterThan(0);
      const b = regionBoundsPx(r, 560, 440);
      expect(b.x1 - b.x0, r.key).toBeGreaterThan(4);
      expect(b.y1 - b.y0, r.key).toBeGreaterThan(4);
    }
    expect(p.shapes.length).toBe(p.regions.reduce((a, r) => a + r.shapes.length, 0));
  });
  it('mapeo nivel → cuadro y revelado por 10 %', () => {
    expect(paintingIndexFor(1)).toBe(0);
    expect(paintingIndexFor(10)).toBe(0);
    expect(paintingIndexFor(11)).toBe(1);
    expect(revealPercent(0)).toBe(0);
    expect(revealPercent(3)).toBe(30);
    expect(revealPercent(10)).toBe(100);
  });
  it('cada 10 % revela una región; el Encargo (100 %) completa las 10', () => {
    expect(regionsRevealed(0)).toBe(0);
    expect(regionsRevealed(10)).toBe(1);
    expect(regionsRevealed(90)).toBe(9);
    expect(regionsRevealed(100)).toBe(10);
  });
  it('shadeHex aclara y oscurece', () => {
    expect(shadeHex('#808080', 1)).toBe('#ffffff');
    expect(shadeHex('#808080', -1)).toBe('#000000');
    expect(shadeHex('#ff0000', 0)).toBe('#ff0000');
  });
  it('tolera paleta vacía', () => {
    expect(generatePainting(2, []).shapes.length).toBeGreaterThan(0);
  });
});
