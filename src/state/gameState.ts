import galleryData from '../data/gallery.json';
import {
  claimDailyGift,
  dailyGiftOffer,
  dayKey,
  economyConfig,
  winReward,
  type DailyGiftOffer,
  type WinRewardBreakdown,
} from '../core/economy';
import { mixesConfig } from '../core/mixes';
import { paintingIndexFor, revealPercent } from '../core/painting';
import { starsFor } from '../core/stars';
import type { StorageService } from '../services/storage/StorageService';
import { loadSave, persistSave, type SaveData, type Settings } from './save';

export type GameEvent = 'change' | 'coins' | 'level' | 'settings' | 'mix';
type Listener = (data: SaveData) => void;

export interface LevelResult {
  level: number;
  moves: number;
  par: number;
  stars: 1 | 2 | 3;
  previousStars: number;
  isNewBest: boolean;
  firstClear: boolean;
  isCommission: boolean;
  reward: WinRewardBreakdown;
  paintingIndex: number;
  /** % del cuadro antes y después de esta victoria. */
  paintingBefore: number;
  paintingAfter: number;
  paintingCompleted: boolean;
}

export interface MixDiscovery {
  recipeId: string;
  isNew: boolean;
  coins: number;
  paletteCompleted: boolean;
}

/**
 * Progreso del jugador (monedas, nivel, estrellas, recetas, cuadros, ajustes).
 * Las escenas observan y renderizan. Guarda tras cada cambio relevante.
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

  starsOf(level: number): number {
    return this.data.stars[String(level)] ?? 0;
  }

  /** Niveles ganados dentro de la decena del cuadro `index`. */
  /** Niveles ganados de la decena de un cuadro (para saber qué manchas ya están pintadas). */
  wonLevelsInPainting(index: number): number[] {
    const per = galleryData.levelsPerPainting;
    const out: number[] = [];
    for (let l = index * per + 1; l <= (index + 1) * per; l++) if (this.starsOf(l) > 0) out.push(l);
    return out;
  }

  levelsWonInPainting(index: number): number {
    const per = galleryData.levelsPerPainting;
    let n = 0;
    for (let l = index * per + 1; l <= (index + 1) * per; l++) if (this.starsOf(l) > 0) n++;
    return n;
  }

  paintingPercent(index: number): number {
    return this.data.paintings[String(index)] ?? revealPercent(this.levelsWonInPainting(index));
  }

  /** Registra la victoria de un nivel: estrellas, monedas, cuadro y avance (§7). */
  completeLevel(level: number, moves: number, par: number): LevelResult {
    const key = String(level);
    const prevMoves = this.data.bestMoves[key];
    const firstClear = prevMoves === undefined;
    const isNewBest = firstClear || moves < prevMoves;
    if (isNewBest) this.data.bestMoves[key] = moves;
    const stars = starsFor(moves, par);
    const previousStars = this.starsOf(level);
    if (stars > previousStars) this.data.stars[key] = stars;
    const isCommission = level % galleryData.levelsPerPainting === 0;
    const reward = winReward({ stars, previousStars, isCommission });
    const paintingIndex = paintingIndexFor(level);
    const paintingBefore = this.data.paintings[String(paintingIndex)] ?? 0;
    const paintingAfter = revealPercent(this.levelsWonInPainting(paintingIndex));
    this.data.paintings[String(paintingIndex)] = paintingAfter;
    if (level >= this.data.level) this.data.level = level + 1;
    this.data.coins += reward.total;
    this.save();
    this.emit('level');
    if (reward.total > 0) this.emit('coins');
    return {
      level,
      moves,
      par,
      stars,
      previousStars,
      isNewBest,
      firstClear,
      isCommission,
      reward,
      paintingIndex,
      paintingBefore,
      paintingAfter,
      paintingCompleted: paintingAfter >= 100 && paintingBefore < 100,
    };
  }

  /** Registra el uso de una receta; si es la primera vez, la descubre y premia (§5.4). */
  useMix(recipeId: string, now = new Date()): MixDiscovery {
    const stats = this.data.mixStats[recipeId];
    if (stats) {
      stats.uses += 1;
      this.save();
      return { recipeId, isNew: false, coins: 0, paletteCompleted: false };
    }
    this.data.mixStats[recipeId] = { first: dayKey(now), uses: 1 };
    if (!this.data.mixes.includes(recipeId)) this.data.mixes.push(recipeId);
    let coins = mixesConfig.discoverReward;
    const paletteCompleted =
      this.data.mixes.length >= mixesConfig.recipes.length && !this.hasSeenTip('palette-complete');
    if (paletteCompleted) {
      this.data.seenTips.push('palette-complete');
      coins += mixesConfig.completePaletteReward;
    }
    this.data.coins += coins;
    this.save();
    this.emit('mix');
    this.emit('coins');
    return { recipeId, isNew: true, coins, paletteCompleted };
  }

  dailyOffer(now = new Date()): DailyGiftOffer {
    return dailyGiftOffer(this.data.daily, dayKey(now));
  }

  /** Cobra el regalo diario si está disponible; devuelve las monedas obtenidas. */
  claimDaily(now = new Date()): number {
    const offer = this.dailyOffer(now);
    if (!offer.claimable) return 0;
    this.data.daily = claimDailyGift(this.data.daily, dayKey(now));
    this.data.coins += offer.amount;
    this.save();
    this.emit('coins');
    return offer.amount;
  }

  get economy() {
    return economyConfig;
  }
}
