import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/services/storage/MemoryStorage';
import { CURRENT_SCHEMA, SAVE_KEY, loadSave, persistSave } from '../src/state/save';
import { GameState } from '../src/state/gameState';

describe('save.ts', () => {
  it('crea un guardado nuevo con distinctId cuando no hay nada', () => {
    const s = new MemoryStorage();
    const data = loadSave(s);
    expect(data.schema).toBe(CURRENT_SCHEMA);
    expect(data.level).toBe(1);
    expect(data.distinctId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('persiste y recarga el mismo contenido', () => {
    const s = new MemoryStorage();
    const data = loadSave(s);
    data.level = 12;
    data.coins = 340;
    persistSave(s, data);
    const again = loadSave(s);
    expect(again.level).toBe(12);
    expect(again.coins).toBe(340);
    expect(again.distinctId).toBe(data.distinctId);
  });

  it('tolera JSON corrupto y campos faltantes', () => {
    const s = new MemoryStorage();
    s.set(SAVE_KEY, '{not json');
    expect(loadSave(s).level).toBe(1);
    s.set(SAVE_KEY, JSON.stringify({ schema: 1, level: 5 }));
    const d = loadSave(s);
    expect(d.level).toBe(5);
    expect(d.coins).toBe(0);
    expect(d.settings.sound).toBe(true);
    expect(d.mixes).toEqual([]);
  });

  it('usa la clave única pigmento.save.v1', () => {
    const s = new MemoryStorage();
    new GameState(s);
    expect(s.get(SAVE_KEY)).not.toBeNull();
  });
});

describe('GameState', () => {
  it('completeLevel avanza y guarda el mejor resultado', () => {
    const s = new MemoryStorage();
    const g = new GameState(s);
    const r = g.completeLevel(1, 5, 2);
    expect(r.firstClear).toBe(true);
    expect(g.currentLevel).toBe(2);
    const r2 = g.completeLevel(1, 3, 2);
    expect(r2.isNewBest).toBe(true);
    expect(g.currentLevel).toBe(2);
    expect(new GameState(s).data.bestMoves['1']).toBe(3);
  });

  it('monedas: no baja de cero y spend falla sin saldo', () => {
    const g = new GameState(new MemoryStorage());
    expect(g.spendCoins(10)).toBe(false);
    g.addCoins(50);
    expect(g.spendCoins(30)).toBe(true);
    expect(g.coins).toBe(20);
  });

  it('emite eventos de cambio', () => {
    const g = new GameState(new MemoryStorage());
    let n = 0;
    g.on('change', () => n++);
    g.addCoins(1);
    g.updateSettings({ sound: false });
    expect(n).toBe(2);
    expect(g.settings.sound).toBe(false);
  });
});
