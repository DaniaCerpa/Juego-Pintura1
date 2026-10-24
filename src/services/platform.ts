export type Platform = 'web' | 'android' | 'ios';

/** Detecta la plataforma. Capacitor (F2) expondrá window.Capacitor. */
export function detectPlatform(): Platform {
  const w = globalThis as unknown as { Capacitor?: { getPlatform?: () => string } };
  const p = w.Capacitor?.getPlatform?.();
  if (p === 'android' || p === 'ios') return p;
  return 'web';
}

export function isStandalone(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}
