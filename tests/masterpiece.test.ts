import { describe, expect, it } from 'vitest';
import {
  assignSegments,
  availableMasterpieces,
  decadeSlots,
  levelPigments,
  masterpiecesConfig,
  segmentCountFor,
  segmentImage,
  seedFor,
} from '../src/core/masterpiece';

/** Imagen sintética: mitad superior azul cielo, mitad inferior amarillo trigo. */
function twoTone(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const top = y < h / 2;
      px[i] = top ? 40 : 230;
      px[i + 1] = top ? 90 : 190;
      px[i + 2] = top ? 200 : 40;
      px[i + 3] = 255;
    }
  return px;
}

describe('segmentImage', () => {
  it('separa zonas de color distintas y es determinista', () => {
    const w = 40;
    const h = 30;
    const a = segmentImage(twoTone(w, h), w, h, 2, 7);
    const b = segmentImage(twoTone(w, h), w, h, 2, 7);
    expect(Array.from(a.labels)).toEqual(Array.from(b.labels));
    expect(a.colors.length).toBe(2);
    expect(a.labels[0]).not.toBe(a.labels[w * h - 1]);
    expect(a.areas.reduce((s, v) => s + v, 0)).toBe(w * h);
  });

  it('cubre toda la imagen con etiquetas compactas', () => {
    const w = 30;
    const h = 20;
    const s = segmentImage(twoTone(w, h), w, h, 8, 1);
    const max = Math.max(...s.labels);
    expect(max).toBe(s.colors.length - 1);
  });
});

describe('assignSegments', () => {
  it('cada ranura recibe al menos una mancha, por parecido de color', () => {
    const colors: [number, number, number][] = [
      [40, 90, 200],
      [230, 190, 40],
      [200, 30, 30],
      [35, 80, 190],
    ];
    const slots: [number, number, number][] = [
      [220, 40, 40], // rojo
      [50, 100, 210], // azul
      [240, 200, 50], // amarillo
    ];
    const out = Array.from(assignSegments(colors, [10, 10, 10, 10], slots));
    expect(out[2]).toBe(0);
    expect(out[1]).toBe(2);
    expect(new Set(out)).toEqual(new Set([0, 1, 2]));
    expect(out[0]).toBe(1);
    expect(out[3]).toBe(1);
  });
});

describe('reparto por niveles', () => {
  it('cada nivel pinta una porción parecida del cuadro', () => {
    // 40 manchas de colores variados y áreas distintas; 5 niveles con 2 pigmentos cada uno.
    const colors: [number, number, number][] = [];
    const areas: number[] = [];
    for (let i = 0; i < 40; i++) {
      colors.push([(i * 53) % 256, (i * 97) % 256, (i * 31) % 256]);
      areas.push(5 + ((i * 7) % 23));
    }
    const slotColors: [number, number, number][] = [];
    const group: number[] = [];
    for (let l = 0; l < 5; l++) {
      slotColors.push([200, 40, 40], [40, 60, 200]);
      group.push(l, l);
    }
    const out = assignSegments(colors, areas, slotColors, group);
    const total = areas.reduce((a, v) => a + v, 0);
    const per = new Array(5).fill(0);
    out.forEach((s, c) => (per[group[s]] += areas[c]));
    for (const a of per) expect(a / total).toBeLessThan(0.32);
    expect(new Set(Array.from(out)).size).toBe(10);
  });
});

describe('ranuras de nivel', () => {
  it('el nivel que enseña la mezcla incluye el producto', () => {
    const p = levelPigments(6);
    expect(p).toContain('blue');
    expect(p).toContain('yellow');
    expect(p).toContain('green');
  });

  it('la primera decena tiene ranuras para los 10 niveles', () => {
    const slots = decadeSlots(0, 10);
    expect(new Set(slots.map((s) => s.level)).size).toBe(10);
    const k = segmentCountFor(slots.length);
    expect(k).toBeGreaterThanOrEqual(masterpiecesConfig.segments.min);
    expect(k).toBeLessThanOrEqual(masterpiecesConfig.segments.max);
  });
});

describe('catálogo', () => {
  it('solo cuenta obras con imagen y la semilla es estable', () => {
    const list = masterpiecesConfig.paintings;
    expect(availableMasterpieces(list, { [list[0].id]: {} }).map((m) => m.id)).toEqual([
      list[0].id,
    ]);
    expect(seedFor('gran-ola')).toBe(seedFor('gran-ola'));
    expect(seedFor('gran-ola')).not.toBe(seedFor('beso'));
  });
});
