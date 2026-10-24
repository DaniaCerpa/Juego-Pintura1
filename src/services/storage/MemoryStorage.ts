import type { StorageService } from './StorageService';

/** Almacenamiento en memoria para tests y entornos sin localStorage. */
export class MemoryStorage implements StorageService {
  private map = new Map<string, string>();
  get(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
}
