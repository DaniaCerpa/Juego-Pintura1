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

  it('migración v1 → v2: deja el juego en español conservando el progreso', () => {
    const s = new MemoryStorage();
    s.set(
      SAVE_KEY,
      JSON.stringify({ schema: 1, level: 9, coins: 40, settings: { lang: 'en', sound: false } }),
    );
    const d = loadSave(s);
    expect(d.schema).toBe(2);
    expect(d.settings.lang).toBe('es');
    expect(d.settings.sound).toBe(false);
    expect(d.level).toBe(9);
    expect(d.coins).toBe(40);
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

describe('GameState F1: estrellas, cuadros, recetas y regalo diario', () => {
  it('completeLevel calcula estrellas, monedas y % del cuadro', () => {
    const g = new GameState(new MemoryStorage());
    const r = g.completeLevel(1, 2, 2);
    expect(r.stars).toBe(3);
    expect(r.reward.total).toBe(25 + 30 + 20);
    expect(r.paintingAfter).toBe(10);
    expect(g.coins).toBe(75);
    const again = g.completeLevel(1, 9, 2);
    expect(again.stars).toBe(1);
    expect(again.reward.total).toBe(0);
    expect(g.starsOf(1)).toBe(3);
    expect(g.paintingPercent(0)).toBe(10);
  });
  it('el encargo completa el cuadro y paga 150', () => {
    const g = new GameState(new MemoryStorage());
    for (let l = 1; l <= 9; l++) g.completeLevel(l, 99, 2);
    const r = g.completeLevel(10, 99, 2);
    expect(r.isCommission).toBe(true);
    expect(r.paintingCompleted).toBe(true);
    expect(r.paintingAfter).toBe(100);
    expect(r.reward.commission).toBe(150);
  });
  it('useMix descubre una vez y cuenta usos', () => {
    const g = new GameState(new MemoryStorage());
    const a = g.useMix('blue+yellow');
    expect(a.isNew).toBe(true);
    expect(a.coins).toBe(100);
    const b = g.useMix('blue+yellow');
    expect(b.isNew).toBe(false);
    expect(g.data.mixStats['blue+yellow'].uses).toBe(2);
    expect(g.data.mixes).toEqual(['blue+yellow']);
  });
  it('completar la paleta paga 1000 extra', () => {
    const g = new GameState(new MemoryStorage());
    const ids = [
      'blue+yellow',
      'red+yellow',
      'red+blue',
      'red+white',
      'blue+white',
      'blue+green',
      'yellow+white',
    ];
    for (const id of ids) g.useMix(id);
    const last = g.useMix('orange+purple');
    expect(last.paletteCompleted).toBe(true);
    expect(last.coins).toBe(1100);
  });
  it('regalo diario', () => {
    const g = new GameState(new MemoryStorage());
    const d = new Date(2026, 9, 24);
    expect(g.dailyOffer(d).claimable).toBe(true);
    expect(g.claimDaily(d)).toBe(50);
    expect(g.claimDaily(d)).toBe(0);
    expect(g.claimDaily(new Date(2026, 9, 25))).toBe(60);
  });
});
