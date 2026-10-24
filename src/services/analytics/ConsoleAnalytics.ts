import type { StorageService } from '../storage/StorageService';
import type { AnalyticsService } from './AnalyticsService';

const BUFFER_KEY = 'pigmento.analytics.buffer';
const BUFFER_MAX = 500;

export interface AnalyticsEvent {
  event: string;
  params: Record<string, unknown>;
  ts: number;
  distinctId: string;
}

/**
 * Analytics de F0: registra en consola (solo en desarrollo) y guarda un buffer
 * en storage para poder enviarlo cuando haya red o un backend (PostHog en F1).
 */
export class ConsoleAnalytics implements AnalyticsService {
  private buffer: AnalyticsEvent[];

  constructor(
    private storage: StorageService,
    private distinctId: string,
    private verbose = false,
  ) {
    this.buffer = this.load();
  }

  log(event: string, params: Record<string, unknown> = {}): void {
    const entry: AnalyticsEvent = { event, params, ts: Date.now(), distinctId: this.distinctId };
    this.buffer.push(entry);
    if (this.buffer.length > BUFFER_MAX) this.buffer.splice(0, this.buffer.length - BUFFER_MAX);
    this.persist();
    if (this.verbose) console.info('[analytics]', event, params);
  }

  /** Eventos pendientes de envío. */
  pending(): AnalyticsEvent[] {
    return [...this.buffer];
  }

  flush(): void {
    this.buffer = [];
    this.persist();
  }

  private load(): AnalyticsEvent[] {
    try {
      const raw = this.storage.get(BUFFER_KEY);
      return raw ? (JSON.parse(raw) as AnalyticsEvent[]) : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    this.storage.set(BUFFER_KEY, JSON.stringify(this.buffer));
  }
}
