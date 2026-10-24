import type { StorageService } from '../storage/StorageService';
import { ConsoleAnalytics } from './ConsoleAnalytics';
import type { AnalyticsService } from './AnalyticsService';

/**
 * PostHog (plan gratuito) por HTTP directo al endpoint `/capture`, sin SDK (bundle mínimo).
 * Sin PII: `distinct_id` anónimo generado en el dispositivo. Los eventos pasan primero por
 * el buffer local (`ConsoleAnalytics`) y se envían en lotes cuando hay red; si falla el
 * envío, quedan en el buffer para el próximo intento.
 */
export class PostHogAnalytics implements AnalyticsService {
  private buffer: ConsoleAnalytics;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;

  constructor(
    storage: StorageService,
    private distinctId: string,
    private apiKey: string,
    private host = 'https://us.i.posthog.com',
    verbose = false,
  ) {
    this.buffer = new ConsoleAnalytics(storage, distinctId, verbose);
    this.scheduleFlush(3000);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.scheduleFlush(500));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void this.flush(true);
      });
    }
  }

  log(event: string, params: Record<string, unknown> = {}): void {
    this.buffer.log(event, params);
    this.scheduleFlush(2500);
  }

  private scheduleFlush(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(false), ms);
  }

  /** Envía el buffer en un lote. Con `beacon`, usa sendBeacon (cierre de pestaña). */
  async flush(beacon: boolean): Promise<void> {
    if (this.sending) return;
    const pending = this.buffer.pending();
    if (pending.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const body = JSON.stringify({
      api_key: this.apiKey,
      batch: pending.map((e) => ({
        event: e.event,
        distinct_id: this.distinctId,
        timestamp: new Date(e.ts).toISOString(),
        properties: { ...e.params, $lib: 'pigmento-web' },
      })),
    });
    const url = `${this.host}/batch/`;
    this.sending = true;
    try {
      if (beacon && navigator.sendBeacon) {
        if (navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))) {
          this.buffer.flush();
        }
        return;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: beacon,
      });
      if (res.ok) this.buffer.flush();
    } catch {
      /* sin red: se reintenta más tarde */
    } finally {
      this.sending = false;
    }
  }
}
