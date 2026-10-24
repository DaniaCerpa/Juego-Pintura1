import type { PostHog } from 'posthog-js';
import type { StorageService } from '../storage/StorageService';
import { ConsoleAnalytics } from './ConsoleAnalytics';
import type { AnalyticsService } from './AnalyticsService';

/**
 * PostHog (plan gratuito, host US) con `posthog-js`, cargado bajo demanda para no engordar el
 * arranque. Sin PII: `distinct_id` anónimo generado en el dispositivo; sin autocapture ni
 * pageviews ni grabación de sesión. Mientras la librería carga o no hay red, los eventos
 * quedan en el buffer local (`ConsoleAnalytics`) y se reenvían con su timestamp original.
 */
export class PostHogAnalytics implements AnalyticsService {
  private buffer: ConsoleAnalytics;
  private client: PostHog | null = null;
  private flushing = false;

  constructor(
    storage: StorageService,
    private distinctId: string,
    private apiKey: string,
    private host = 'https://us.i.posthog.com',
    private verbose = false,
  ) {
    this.buffer = new ConsoleAnalytics(storage, distinctId, verbose);
    void this.init();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flush());
    }
  }

  private async init(): Promise<void> {
    try {
      const { default: posthog } = await import('posthog-js');
      posthog.init(this.apiKey, {
        api_host: this.host,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        // Sin configuración remota ni feature flags: menos peticiones y nada que cargar de fuera.
        advanced_disable_flags: true,
        advanced_disable_feature_flags: true,
        disable_external_dependency_loading: true,
        persistence: 'localStorage',
        person_profiles: 'identified_only',
        bootstrap: { distinctID: this.distinctId },
        loaded: () => this.flush(),
      });
      this.client = posthog;
      this.flush();
    } catch (e) {
      if (this.verbose) console.warn('[analytics] posthog-js no disponible', e);
    }
  }

  log(event: string, params: Record<string, unknown> = {}): void {
    this.buffer.log(event, params);
    this.flush();
  }

  /** Envía el buffer en orden. Si no hay cliente o no hay red, espera. */
  flush(): void {
    if (!this.client || this.flushing) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const pending = this.buffer.pending();
    if (pending.length === 0) return;
    this.flushing = true;
    try {
      for (const e of pending) {
        this.client.capture(
          e.event,
          { ...e.params, $lib_custom: 'pigmento-web' },
          {
            timestamp: new Date(e.ts),
          },
        );
      }
      this.buffer.flush();
    } finally {
      this.flushing = false;
    }
  }
}
