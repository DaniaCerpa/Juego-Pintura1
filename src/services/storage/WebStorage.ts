import type { StorageService } from './StorageService';

/** localStorage con respaldo en memoria si el navegador lo bloquea (modo privado, cuota). */
export class WebStorage implements StorageService {
  private memory = new Map<string, string>();

  get(key: string): string | null {
    try {
      return localStorage.getItem(key) ?? this.memory.get(key) ?? null;
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  set(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sin cuota: se mantiene en memoria */
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* nada */
    }
  }
}
