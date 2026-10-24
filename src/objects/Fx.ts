import Phaser from 'phaser';
import type { PigmentId } from '../core/types';
import { UI } from '../ui/theme';
import { ensurePigmentTextures } from './pigmentTextures';

type EmitterCfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/**
 * Partículas con límite global (§14.3: máximo 200 vivas). Un emisor por pigmento
 * (texturas de color, válidas en WebGL y Canvas), creado bajo demanda. Nada en update().
 */
export class Fx {
  private splashEmitters = new Map<PigmentId, Phaser.GameObjects.Particles.ParticleEmitter>();
  private confettiEmitters = new Map<PigmentId, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor(private scene: Phaser.Scene) {
    ensurePigmentTextures(scene);
  }

  private get(
    map: Map<PigmentId, Phaser.GameObjects.Particles.ParticleEmitter>,
    pigment: PigmentId,
    texture: string,
    cfg: EmitterCfg,
    depth: number,
  ): Phaser.GameObjects.Particles.ParticleEmitter {
    let e = map.get(pigment);
    if (!e) {
      e = this.scene.add.particles(0, 0, texture, { ...cfg, emitting: false });
      e.setDepth(depth);
      map.set(pigment, e);
    }
    return e;
  }

  private splash(pigment: PigmentId): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.get(
      this.splashEmitters,
      pigment,
      `dot-${pigment}`,
      {
        lifespan: { min: 220, max: 420 },
        speed: { min: 60, max: 260 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.55, end: 0 },
        gravityY: 600,
      },
      50,
    );
  }

  private confetti(pigment: PigmentId): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.get(
      this.confettiEmitters,
      pigment,
      `conf-${pigment}`,
      {
        lifespan: { min: 900, max: 1400 },
        speed: { min: 250, max: 650 },
        angle: { min: 230, max: 310 },
        scale: { start: 1, end: 0.6 },
        rotate: { start: 0, end: 360 },
        gravityY: 900,
      },
      60,
    );
  }

  private alive(): number {
    let n = 0;
    for (const e of this.splashEmitters.values()) n += e.getAliveParticleCount();
    for (const e of this.confettiEmitters.values()) n += e.getAliveParticleCount();
    return n;
  }

  private budget(wanted: number): number {
    return Math.max(0, Math.min(wanted, UI.fx.particleCap - this.alive()));
  }

  /** Salpicadura de vertido en el punto de impacto. */
  pourSplash(x: number, y: number, pigment: PigmentId, count = UI.fx.pourParticles): void {
    const n = this.budget(count);
    if (n <= 0) return;
    const e = this.splash(pigment);
    e.setConfig({ angle: { min: 200, max: 340 }, speed: { min: 60, max: 260 } });
    e.explode(n, x, y);
  }

  /** Remolino de dos colores que converge en el producto (mezcla, §5.4). */
  swirl(x: number, y: number, a: PigmentId, b: PigmentId, product: PigmentId): void {
    const n = this.budget(UI.fx.mixParticles);
    if (n <= 0) return;
    const third = Math.floor(n / 3);
    const cfg = { angle: { min: 0, max: 360 }, speed: { min: 120, max: 340 } };
    const ea = this.splash(a);
    ea.setConfig(cfg);
    ea.explode(third, x - 20, y);
    const eb = this.splash(b);
    eb.setConfig(cfg);
    eb.explode(third, x + 20, y);
    const ep = this.splash(product);
    ep.setConfig(cfg);
    ep.explode(n - third * 2, x, y - 10);
  }

  /** Brillo al completar un frasco. */
  sparkle(x: number, y: number, pigment: PigmentId): void {
    const n = this.budget(12);
    if (n <= 0) return;
    const e = this.splash(pigment);
    e.setConfig({ angle: { min: 0, max: 360 }, speed: { min: 120, max: 300 } });
    e.explode(n, x, y);
  }

  /** Confeti de victoria. */
  confettiBurst(x: number, y: number, pigments: PigmentId[]): void {
    const n = this.budget(UI.fx.confettiParticles);
    if (n <= 0 || pigments.length === 0) return;
    const per = Math.max(1, Math.floor(n / pigments.length));
    for (const p of pigments) this.confetti(p).explode(per, x, y);
  }

  /** Detiene todo lo vivo (al salir de la escena o al saltar animaciones). */
  clear(): void {
    for (const e of this.splashEmitters.values()) e.killAll();
    for (const e of this.confettiEmitters.values()) e.killAll();
  }
}
