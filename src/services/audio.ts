/**
 * Audio sintetizado con WebAudio (sin assets): glug ×3, error, frasco completo (escala
 * ascendente), victoria, selección y swirl de mezcla. Se desbloquea tras el primer toque.
 */
export type SfxName = 'select' | 'pour' | 'error' | 'complete' | 'victory' | 'swirl' | 'tap';

export class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private noiseBuffer: AudioBuffer | null = null;
  /** Índice de la nota ascendente por frascos resueltos en la sesión (do, re, mi…). */
  private scaleIndex = 0;
  private pourVariant = 0;

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  /** Llamar en el primer pointerdown: crea/reanuda el contexto (requisito móvil). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  resetScale(): void {
    this.scaleIndex = 0;
  }

  play(name: SfxName): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'tap':
        this.tone(880, 0.03, 'sine', 0.12, t, 1200);
        break;
      case 'select':
        this.tone(660, 0.06, 'triangle', 0.14, t, 900);
        break;
      case 'pour':
        this.glug(t);
        break;
      case 'error':
        this.tone(140, 0.12, 'square', 0.08, t, 110);
        break;
      case 'complete':
        this.completeNote(t);
        break;
      case 'victory':
        this.arpeggio(t);
        break;
      case 'swirl':
        this.swirl(t);
        break;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    t: number,
    freqEnd?: number,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Tres variantes de "glug": burbujas descendentes con un leve subtono. */
  private glug(t: number): void {
    const variants = [
      [520, 170],
      [440, 150],
      [600, 200],
    ];
    const [f0, f1] = variants[this.pourVariant % variants.length];
    this.pourVariant++;
    this.tone(f0, 0.13, 'sine', 0.22, t, f1);
    this.tone(f0 * 0.5, 0.18, 'sine', 0.1, t + 0.05, f1 * 0.6);
    this.tone(f0 * 1.3, 0.09, 'sine', 0.12, t + 0.12, f1 * 0.9);
  }

  /** Nota ascendente por cada frasco resuelto: do, re, mi, fa, sol, la, si, do… */
  private completeNote(t: number): void {
    const scale = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];
    const f =
      scale[this.scaleIndex % scale.length] * (1 + Math.floor(this.scaleIndex / scale.length));
    this.scaleIndex++;
    this.tone(f, 0.35, 'triangle', 0.2, t);
    this.tone(f * 2, 0.25, 'sine', 0.08, t + 0.02);
  }

  private arpeggio(t: number): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      this.tone(f, 0.4, 'triangle', 0.16, t + i * 0.09);
      this.tone(f / 2, 0.5, 'sine', 0.06, t + i * 0.09);
    });
  }

  private swirl(t: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuffer) {
      const len = Math.floor(ctx.sampleRate * 0.5);
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuffer.getChannelData(0);
      let seed = 1234567;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        d[i] = (seed / 4294967296) * 2 - 1;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2400, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + 0.45);
    this.tone(392, 0.4, 'sine', 0.1, t + 0.1, 784);
  }
}
