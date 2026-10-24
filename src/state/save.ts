import type { StorageService } from '../services/storage/StorageService';

export const SAVE_KEY = 'pigmento.save.v1';
export const CURRENT_SCHEMA = 1;

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  lang: 'es' | 'en';
  accessibility: boolean;
}

export interface DailyState {
  lastClaim: string | null; // YYYY-MM-DD
  streak: number;
}

export interface SaveData {
  schema: number;
  level: number; // próximo nivel a jugar
  coins: number;
  stars: Record<string, number>; // id de nivel → mejor cantidad de estrellas
  bestMoves: Record<string, number>; // id de nivel → mejor cantidad de movimientos
  mixes: string[]; // recetas descubiertas
  paintings: Record<string, number>; // id de cuadro → % pintado
  settings: Settings;
  adsRemoved: boolean;
  daily: DailyState;
  distinctId: string;
  seenTips: string[];
}

export function defaultSettings(lang: 'es' | 'en' = 'es', accessibility = false): Settings {
  return { sound: true, music: false, vibration: true, lang, accessibility };
}

export function createDefaultSave(distinctId: string, settings = defaultSettings()): SaveData {
  return {
    schema: CURRENT_SCHEMA,
    level: 1,
    coins: 0,
    stars: {},
    bestMoves: {},
    mixes: [],
    paintings: {},
    settings,
    adsRemoved: false,
    daily: { lastClaim: null, streak: 0 },
    distinctId,
    seenTips: [],
  };
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** Migraciones por número de esquema: migrations[n] lleva de n a n+1. */
const migrations: Record<number, Migration> = {};

function generateId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Carga el guardado; si no existe o está corrupto devuelve uno nuevo. Aplica migraciones. */
export function loadSave(storage: StorageService, fallbackSettings?: Settings): SaveData {
  const fresh = createDefaultSave(generateId(), fallbackSettings);
  const raw = storage.get(SAVE_KEY);
  if (!raw) return fresh;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fresh;
  }
  if (!parsed || typeof parsed !== 'object') return fresh;
  let schema = typeof parsed.schema === 'number' ? parsed.schema : 0;
  while (schema < CURRENT_SCHEMA) {
    const m = migrations[schema];
    if (!m) return fresh;
    parsed = m(parsed);
    schema++;
  }
  // Completar campos que falten con los valores por defecto (tolerante a guardados parciales).
  const merged: SaveData = {
    ...fresh,
    ...(parsed as Partial<SaveData>),
    schema: CURRENT_SCHEMA,
    settings: { ...fresh.settings, ...((parsed.settings as Partial<Settings>) ?? {}) },
    daily: { ...fresh.daily, ...((parsed.daily as Partial<DailyState>) ?? {}) },
  };
  if (!Number.isInteger(merged.level) || merged.level < 1) merged.level = 1;
  if (!Number.isFinite(merged.coins) || merged.coins < 0) merged.coins = 0;
  if (!Array.isArray(merged.mixes)) merged.mixes = [];
  if (!Array.isArray(merged.seenTips)) merged.seenTips = [];
  if (typeof merged.distinctId !== 'string' || !merged.distinctId)
    merged.distinctId = fresh.distinctId;
  return merged;
}

export function persistSave(storage: StorageService, data: SaveData): void {
  storage.set(SAVE_KEY, JSON.stringify(data));
}
