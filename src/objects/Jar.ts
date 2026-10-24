import Phaser from 'phaser';
import { getPigment } from '../core/pigments';
import type { PigmentId } from '../core/types';
import { COLORS, hexToNum, shade, textStyle, UI } from '../ui/theme';
import { ensureBottomLayerTexture, ensurePigmentTextures } from './pigmentTextures';

/**
 * Frasco de vidrio. El cuerpo (vidrio, borde, reflejo, sombra) se genera una vez como
 * textura por ancho y se reutiliza como Image; las capas de líquido son sprites tintados
 * escalados. Así el costo por frame es el de unos pocos sprites, sin Graphics dinámicos.
 * Sin update(): el nivel se anima con tweens que llaman a `redraw`.
 */
export class Jar extends Phaser.GameObjects.Container {
  readonly index: number;
  readonly jarWidth: number;
  readonly jarHeight: number;
  private readonly capacity: number;
  private layers: PigmentId[] = [];
  /** Altura visual (0–1) de cada capa; permite animar subida/bajada del nivel. */
  private heights: number[] = [];
  private shadow: Phaser.GameObjects.Image;
  private glass: Phaser.GameObjects.Image;
  private layerSprites: Phaser.GameObjects.Image[] = [];
  private dividerSprites: Phaser.GameObjects.Image[] = [];
  private surface: Phaser.GameObjects.Image;
  private symbols: Phaser.GameObjects.Text[] = [];
  private symbolsVisible = false;
  private fuseRing: Phaser.GameObjects.Graphics;
  private fuseText: Phaser.GameObjects.Text;
  private lifted = false;
  baseX: number;
  baseY: number;

  constructor(
    scene: Phaser.Scene,
    index: number,
    x: number,
    y: number,
    width: number,
    capacity: number,
  ) {
    super(scene, x, y);
    this.index = index;
    this.baseX = x;
    this.baseY = y;
    this.jarWidth = Math.round(width);
    this.jarHeight = Math.round(width * UI.board.jarAspect);
    this.capacity = capacity;

    ensurePigmentTextures(scene);
    Jar.ensureTextures(scene, this.jarWidth, this.jarHeight);
    this.shadow = scene.add.image(0, this.jarHeight / 2 + 10, `jar-shadow-${this.jarWidth}`);
    this.add(this.shadow);
    // Capas de líquido (de abajo hacia arriba) + divisores
    for (let i = 0; i < capacity; i++) {
      const s = scene.add.image(0, 0, 'px-dark').setOrigin(0.5, 1).setVisible(false);
      this.layerSprites.push(s);
      this.add(s);
      const d = scene.add.image(0, 0, 'px-dark').setOrigin(0.5, 1).setVisible(false);
      d.setAlpha(0.22);
      this.dividerSprites.push(d);
      this.add(d);
    }
    this.surface = scene.add.image(0, 0, 'px-dark').setVisible(false).setAlpha(0.7);
    this.add(this.surface);
    this.glass = scene.add.image(0, 0, `jar-glass-${this.jarWidth}`);
    this.add(this.glass);
    this.fuseRing = scene.add.graphics();
    this.fuseText = scene.add.text(0, 0, '', textStyle(26, UI.colors.text)).setOrigin(0.5);
    this.fuseText.setVisible(false);
    this.add([this.fuseRing, this.fuseText]);
    for (let i = 0; i < capacity; i++) {
      const s = scene.add
        .text(0, 0, '', textStyle(Math.round(width * 0.26), '#000000'))
        .setOrigin(0.5);
      s.setAlpha(0.55).setVisible(false);
      this.symbols.push(s);
      this.add(s);
    }

    // El área táctil la resuelve la escena contra la posición base (ver LevelScene.jarAt).
    this.setSize(this.jarWidth, this.jarHeight);
    scene.add.existing(this);
  }

  // ---------- texturas compartidas ----------
  private static ensureTextures(scene: Phaser.Scene, w: number, h: number): void {
    const tex = scene.textures;
    if (!tex.exists(`jar-glass-${w}`)) {
      const pad = 12;
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const r = w * 0.22;
      const ox = pad + w / 2;
      const oy = pad + h / 2;
      // Cuerpo translúcido
      g.fillStyle(COLORS.glass, 0.1);
      g.fillRoundedRect(ox - w / 2, oy - h / 2 + 10, w, h - 10, { tl: 10, tr: 10, bl: r, br: r });
      // Borde del vidrio
      g.lineStyle(4, COLORS.glass, 0.55);
      g.strokeRoundedRect(ox - w / 2, oy - h / 2 + 10, w, h - 10, { tl: 10, tr: 10, bl: r, br: r });
      // Cuello / labio superior
      g.fillStyle(shade(COLORS.glass, -0.1), 0.35);
      g.fillRoundedRect(ox - w / 2 - 6, oy - h / 2, w + 12, 18, 8);
      g.lineStyle(3, COLORS.glass, 0.7);
      g.strokeRoundedRect(ox - w / 2 - 6, oy - h / 2, w + 12, 18, 8);
      // Reflejo vertical izquierdo
      g.fillStyle(0xffffff, 0.22);
      g.fillRoundedRect(ox - w / 2 + 10, oy - h / 2 + 34, w * 0.12, h * 0.58, 8);
      // Brillo pequeño inferior derecho
      g.fillStyle(0xffffff, 0.1);
      g.fillRoundedRect(ox + w / 2 - 22, oy + h / 2 - h * 0.28, w * 0.08, h * 0.16, 6);
      g.generateTexture(`jar-glass-${w}`, w + pad * 2, h + pad * 2);
      g.destroy();
    }
    if (!tex.exists(`jar-shadow-${w}`)) {
      const g = scene.make.graphics({ x: 0, y: 0 }, false);
      const sw = Math.round(w * 1.1);
      const sh = Math.round(w * 0.3);
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(sw / 2, sh / 2, sw - 4, sh - 4);
      g.generateTexture(`jar-shadow-${w}`, sw, sh);
      g.destroy();
    }
  }

  // ---------- geometría ----------
  private get innerW(): number {
    return this.jarWidth - 14;
  }
  private get innerH(): number {
    return this.jarHeight - 26;
  }
  private get innerTop(): number {
    return -this.jarHeight / 2 + 18;
  }
  private get layerH(): number {
    return this.innerH / this.capacity;
  }
  /** Punto (local) de la boca del frasco, para el chorro de vertido. */
  mouthPoint(): { x: number; y: number } {
    return { x: 0, y: -this.jarHeight / 2 };
  }
  /** Altura local donde está la superficie del líquido. */
  surfaceY(): number {
    const filled = this.heights.reduce((a, b) => a + b, 0);
    return this.innerTop + this.innerH - filled * this.layerH;
  }

  // ---------- estado ----------
  getLayers(): PigmentId[] {
    return [...this.layers];
  }

  /** Fija las capas sin animación (sincronización con el modelo). */
  setLayers(layers: PigmentId[]): void {
    this.layers = [...layers];
    this.heights = layers.map(() => 1);
    this.redraw();
  }

  setSymbolsVisible(on: boolean): void {
    this.symbolsVisible = on;
    this.redraw();
  }

  /** Agrega `count` capas de `pigment` que suben desde 0 hasta su altura. Devuelve el tween. */
  animateAdd(pigment: PigmentId, count: number, durationMs: number): Phaser.Tweens.Tween {
    for (let i = 0; i < count; i++) {
      this.layers.push(pigment);
      this.heights.push(0);
    }
    const from = this.heights.length - count;
    const proxy = { v: 0 };
    return this.scene.tweens.add({
      targets: proxy,
      v: 1,
      duration: durationMs,
      ease: 'Sine.Out',
      onUpdate: () => {
        for (let i = 0; i < count; i++) {
          // Las capas suben una tras otra dentro de la misma duración.
          this.heights[from + i] = Phaser.Math.Clamp(proxy.v * count - i, 0, 1);
        }
        this.redraw();
      },
      onComplete: () => {
        for (let i = 0; i < count; i++) this.heights[from + i] = 1;
        this.redraw();
      },
    });
  }

  /** Quita `count` capas del tope bajando su nivel hasta 0. */
  animateRemove(count: number, durationMs: number): Phaser.Tweens.Tween {
    const total = this.layers.length;
    const proxy = { v: 1 };
    return this.scene.tweens.add({
      targets: proxy,
      v: 0,
      duration: durationMs,
      ease: 'Sine.In',
      onUpdate: () => {
        for (let i = 0; i < count; i++) {
          const idx = total - 1 - i;
          const t = Phaser.Math.Clamp(proxy.v * count - (count - 1 - i), 0, 1);
          if (idx >= 0) this.heights[idx] = t;
        }
        this.redraw();
      },
      onComplete: () => {
        this.layers.splice(total - count, count);
        this.heights.splice(total - count, count);
        this.redraw();
      },
    });
  }

  /** Reemplaza las capas superiores (mezcla): `remove` capas salen y entran `add` de `product`. */
  replaceTop(remove: number, product: PigmentId, add: number): void {
    this.layers.splice(this.layers.length - remove, remove);
    this.heights.splice(this.heights.length - remove, remove);
    for (let i = 0; i < add; i++) {
      this.layers.push(product);
      this.heights.push(1);
    }
    this.redraw();
  }

  // ---------- mecha de secado (F1) ----------
  setFuse(remaining: number | null, max: number | null): void {
    this.fuseRing.clear();
    if (remaining === null || max === null) {
      this.fuseText.setVisible(false);
      return;
    }
    const r = this.jarWidth * 0.3;
    const cx = 0;
    const cy = this.jarHeight / 2 + r + 16;
    const frac = Phaser.Math.Clamp(remaining / max, 0, 1);
    const color = frac > 0.5 ? COLORS.accent : frac > 0.25 ? hexToNum('#F08A24') : COLORS.danger;
    this.fuseRing.lineStyle(6, COLORS.panel, 0.8);
    this.fuseRing.strokeCircle(cx, cy, r);
    this.fuseRing.lineStyle(7, color, 1);
    this.fuseRing.beginPath();
    this.fuseRing.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
    this.fuseRing.strokePath();
    this.fuseText.setPosition(cx, cy).setText(String(remaining)).setVisible(true);
    this.fuseText.setColor(frac > 0.25 ? UI.colors.text : UI.colors.danger);
  }

  // ---------- dibujo ----------
  redraw(): void {
    const bottom = this.innerTop + this.innerH;
    let y = bottom;
    for (let i = 0; i < this.capacity; i++) {
      const sprite = this.layerSprites[i];
      const divider = this.dividerSprites[i];
      if (i >= this.layers.length) {
        sprite.setVisible(false);
        divider.setVisible(false);
        continue;
      }
      const hgt = this.layerH * (this.heights[i] ?? 1);
      if (hgt <= 0.5) {
        sprite.setVisible(false);
        divider.setVisible(false);
        continue;
      }
      const pid = this.layers[i];
      const key =
        i === 0
          ? ensureBottomLayerTexture(this.scene, this.jarWidth, this.innerW, this.layerH, pid)
          : `px-${pid}`;
      if (sprite.texture.key !== key) sprite.setTexture(key);
      sprite.setVisible(true).setPosition(0, y).setDisplaySize(this.innerW, hgt);
      // Sombra sutil en el borde inferior de cada capa (excepto la primera)
      if (i > 0) {
        divider.setVisible(true).setPosition(0, y).setDisplaySize(this.innerW, 3);
      } else {
        divider.setVisible(false);
      }
      y -= hgt;
    }
    // Superficie del líquido (elipse más clara)
    if (this.layers.length > 0) {
      const key = `surf-${this.layers[this.layers.length - 1]}`;
      if (this.surface.texture.key !== key) this.surface.setTexture(key);
      this.surface
        .setVisible(true)
        .setPosition(0, y)
        .setDisplaySize(this.innerW - 4, 10);
    } else {
      this.surface.setVisible(false);
    }
    // Símbolos de accesibilidad
    for (let i = 0; i < this.symbols.length; i++) {
      const s = this.symbols[i];
      if (!this.symbolsVisible || i >= this.layers.length || (this.heights[i] ?? 1) < 0.6) {
        s.setVisible(false);
        continue;
      }
      s.setText(getPigment(this.layers[i]).symbol);
      s.setPosition(0, bottom - this.layerH * (i + 0.5));
      s.setVisible(true);
    }
  }

  private setShadowLift(lift: number): void {
    this.shadow.setPosition(0, this.jarHeight / 2 + 10 + lift);
    this.shadow.setScale(1 + lift * 0.004).setAlpha(1 - lift * 0.012);
  }

  // ---------- animaciones de estado ----------
  setLifted(on: boolean, durationMs: number): void {
    if (this.lifted === on) return;
    this.lifted = on;
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      y: on ? this.baseY - UI.anim.liftPx : this.baseY,
      duration: durationMs,
      ease: on ? 'Quad.Out' : 'Quad.In',
    });
    this.setShadowLift(on ? UI.anim.liftPx : 0);
  }

  /** Vuelve a posición y rotación base de inmediato. */
  resetTransform(): void {
    this.scene.tweens.killTweensOf(this);
    this.lifted = false;
    this.setPosition(this.baseX, this.baseY);
    this.setRotation(0);
    this.setScale(1);
    this.setDepth(0);
    this.setShadowLift(0);
  }

  /** Rebote inválido (§3.2): sacudida horizontal breve. */
  bounce(durationMs: number): Phaser.Tweens.Tween {
    this.lifted = false;
    this.setShadowLift(0);
    this.scene.tweens.killTweensOf(this);
    this.setPosition(this.baseX, this.baseY);
    return this.scene.tweens.add({
      targets: this,
      x: { from: this.baseX - 10, to: this.baseX },
      duration: durationMs,
      ease: 'Elastic.Out',
      easeParams: [2, 0.5],
    });
  }

  /** Frasco completado (§9.3): brillo + pop. */
  celebrate(durationMs: number): Phaser.Tweens.Tween {
    const glow = this.scene.add
      .image(0, 0, `jar-glass-${this.jarWidth}`)
      .setTintFill(0xffffff)
      .setAlpha(0.6);
    this.addAt(glow, this.list.indexOf(this.glass) + 1);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0,
      duration: durationMs,
      onComplete: () => glow.destroy(),
    });
    return this.scene.tweens.add({
      targets: this,
      scale: { from: 1.08, to: 1 },
      duration: durationMs,
      ease: 'Back.Out',
    });
  }
}
