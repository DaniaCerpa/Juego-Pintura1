import type { StorageService } from '../services/storage/StorageService';
import { loadSave, persistSave, type SaveData, type Settings } from './save';

export type GameEvent = 'change' | 'coins' | 'level' | 'settings';
type Listener = (data: SaveData) => void;

export interface LevelResult {
  level: number;
  moves: number;
  par: number;
  isNewBest: boolean;
  firstClear: boolean;
}

/**
 * Progreso del jugador (monedas, nivel, ajustes). Las escenas observan y renderizan.
 * Guarda tras cada cambio relevante.
 */
export class GameState {
  readonly data: SaveData;
  private listeners = new Map<GameEvent, Set<Listener>>();

  constructor(
    private storage: StorageService,
    fallbackSettings?: Settings,
  ) {
    this.data = loadSave(storage, fallbackSettings);
    this.save();
  }

  on(event: GameEvent, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)!.delete(fn);
  }

  private emit(event: GameEvent): void {
    this.listeners.get(event)?.forEach((fn) => fn(this.data));
    if (event !== 'change') this.listeners.get('change')?.forEach((fn) => fn(this.data));
  }

  save(): void {
    persistSave(this.storage, this.data);
  }

  get currentLevel(): number {
    return this.data.level;
  }

  get coins(): number {
    return this.data.coins;
  }

  get settings(): Settings {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.data.settings, patch);
    this.save();
    this.emit('settings');
  }

  addCoins(amount: number): void {
    if (amount === 0) return;
    this.data.coins = Math.max(0, this.data.coins + amount);
    this.save();
    this.emit('coins');
  }

  spendCoins(amount: number): boolean {
    if (this.data.coins < amount) return false;
    this.addCoins(-amount);
    return true;
  }

  hasSeenTip(id: string): boolean {
    return this.data.seenTips.includes(id);
  }

  markTipSeen(id: string): void {
    if (this.hasSeenTip(id)) return;
    this.data.seenTips.push(id);
    this.save();
  }

  /** Registra la victoria de un nivel y avanza el progreso. */
  completeLevel(level: number, moves: number, par: number): LevelResult {
    const key = String(level);
    const prev = this.data.bestMoves[key];
    const firstClear = prev === undefined;
    const isNewBest = firstClear || moves < prev;
    if (isNewBest) this.data.bestMoves[key] = moves;
    if (level >= this.data.level) this.data.level = level + 1;
    this.save();
    this.emit('level');
    return { level, moves, par, isNewBest, firstClear };
  }
}
