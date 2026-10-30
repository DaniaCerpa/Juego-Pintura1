import { ConsoleAnalytics } from './analytics/ConsoleAnalytics';
import { PostHogAnalytics } from './analytics/PostHogAnalytics';
import type { AnalyticsService } from './analytics/AnalyticsService';
import { StubAdsService } from './ads/StubAdsService';
import { StubIapService } from './iap/StubIapService';
import { WebStorage } from './storage/WebStorage';
import { AudioService } from './audio';
import { HapticsService } from './haptics';
import { GameState } from '../state/gameState';
import { defaultSettings } from '../state/save';
import { detectLang, setLang, type Lang } from '../ui/i18n';
import { UI } from '../ui/theme';

/** Contenedor de servicios (una sola instancia por juego). */
export interface Services {
  storage: WebStorage;
  state: GameState;
  analytics: AnalyticsService;
  ads: StubAdsService;
  iap: StubIapService;
  audio: AudioService;
  haptics: HapticsService;
}

let instance: Services | null = null;

export function services(): Services {
  if (instance) return instance;
  const storage = new WebStorage();
  const prefersSymbols =
    window.matchMedia?.('(prefers-contrast: more)').matches ||
    window.matchMedia?.('(forced-colors: active)').matches;
  const state = new GameState(
    storage,
    defaultSettings(
      UI.lang.autoDetect ? detectLang(navigator.language) : (UI.lang.default as Lang),
      prefersSymbols,
    ),
  );
  setLang(state.settings.lang);
  const audio = new AudioService();
  const haptics = new HapticsService();
  const applySettings = () => {
    audio.setEnabled(state.settings.sound);
    haptics.setEnabled(state.settings.vibration);
    setLang(state.settings.lang);
  };
  applySettings();
  state.on('settings', applySettings);
  // PostHog si hay clave en el entorno (VITE_POSTHOG_KEY); si no, consola + buffer local.
  const phKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const analytics: AnalyticsService = phKey
    ? new PostHogAnalytics(
        storage,
        state.data.distinctId,
        phKey,
        (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || undefined,
        import.meta.env.DEV,
      )
    : new ConsoleAnalytics(storage, state.data.distinctId, import.meta.env.DEV);
  // session_end (§12.2): al ocultar/cerrar la pestaña, con duración y niveles jugados.
  const sessionStart = Date.now();
  let levelsPlayed = 0;
  state.on('level', () => levelsPlayed++);
  let ended = false;
  const endSession = () => {
    if (ended) return;
    ended = true;
    analytics.log('session_end', {
      duration_s: Math.round((Date.now() - sessionStart) / 1000),
      levels_played: levelsPlayed,
    });
  };
  window.addEventListener('pagehide', endSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') endSession();
    else ended = false;
  });
  const ads = new StubAdsService();
  ads.setAnalytics((e, p) => analytics.log(e, p));
  instance = {
    storage,
    state,
    analytics,
    ads,
    iap: new StubIapService(),
    audio,
    haptics,
  };
  return instance;
}
