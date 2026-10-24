import uiData from '../data/ui.json';

export type HapticKind = 'complete' | 'mix' | 'error';

/** navigator.vibrate en web; en Capacitor (F2) se cambia por el plugin Haptics. */
export class HapticsService {
  private enabled = true;

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  vibrate(kind: HapticKind): void {
    if (!this.enabled) return;
    const ms = uiData.haptics[`${kind}Ms` as keyof typeof uiData.haptics];
    if (!ms) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* no soportado */
    }
  }
}
