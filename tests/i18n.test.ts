import { describe, expect, it } from 'vitest';
import es from '../src/data/i18n/es.json';
import en from '../src/data/i18n/en.json';
import { PAINTING_TITLE_COUNT } from '../src/core/painting';
import { mixesConfig } from '../src/core/mixes';
import { detectLang } from '../src/ui/i18n';
import { pigmentsConfig } from '../src/core/pigments';

describe('i18n', () => {
  it('es.json y en.json tienen exactamente las mismas claves', () => {
    const a = Object.keys(es).sort();
    const b = Object.keys(en).sort();
    const missingEn = a.filter((k) => !(k in en));
    const missingEs = b.filter((k) => !(k in es));
    expect(missingEn, 'faltan en en.json').toEqual([]);
    expect(missingEs, 'faltan en es.json').toEqual([]);
  });

  it('ninguna cadena está vacía y los parámetros {x} coinciden entre idiomas', () => {
    const params = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const k of Object.keys(es) as (keyof typeof es)[]) {
      expect((es[k] as string).length, k).toBeGreaterThan(0);
      expect((en[k] as string).length, k).toBeGreaterThan(0);
      expect(params(en[k] as string), k).toEqual(params(es[k] as string));
    }
  });

  it('existen las claves generadas por datos: títulos de cuadros, pigmentos', () => {
    for (let i = 0; i < PAINTING_TITLE_COUNT; i++) expect(es).toHaveProperty(`painting.title.${i}`);
    for (const p of pigmentsConfig.pigments) expect(es).toHaveProperty(`pigment.${p.id}`);
    for (const r of mixesConfig.recipes) {
      for (const x of [...r.reagents, r.product]) expect(es).toHaveProperty(`pigment.${x}`);
    }
  });

  it('detecta el idioma del dispositivo: es* → es, resto → en', () => {
    expect(detectLang('es-CL')).toBe('es');
    expect(detectLang('ES')).toBe('es');
    expect(detectLang('en-US')).toBe('en');
    expect(detectLang('pt-BR')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });
});
