import Phaser from 'phaser';
import { getPigment } from '../core/pigments';
import type { PigmentId } from '../core/types';
import { COLORS, textStyle, UI } from '../ui/theme';
import {
  CORK_LIP_Y,
  corkKey,
  crustKey,
  cracksKey,
  glassBackKey,
  glassFlashKey,
  glassFrontKey,
  meniscusKey,
  paintCapKey,
  paintKey,
} from './paintTextures';
import { ensurePigmentTextures } from './pigmentTextures';
import { ensureSoftShadow } from './workshop';

interface Block {
  pigment: PigmentId;
  /** Altura en "capas" (suma de alturas visuales 0–1 de las capas del bloque). */
  height: number;
}

/**
 * Frasco de vidrio (B3, B5). La pintura se dibuja por **bloques** de capas contiguas del
 * mismo pigmento (sin líneas entre capas iguales): cuerpo con gradiente y brillo especular,
 * base redondeada y menisco curvo arriba. Encima, el vidrio frontal con reflejos.
 * Secado: anillo de progreso alrededor de la boca y costra que se forma en la superficie.
 * Todo son sprites de texturas generadas una vez; sin update(): los tweens llaman a `redraw`.
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
  private glassBack: Phaser.GameObjects.Image;
  private glassFront: Phaser.GameObjects.Image;
  private blockSprites: Phaser.GameObjects.Image[] = [];
  private capSprite: Phaser.GameObjects.Image;
  private dividerSprites: Phaser.GameObjects.Image[] = [];
  private meniscus: Phaser.GameObjects.Image;
  private crust: Phaser.GameObjects.Image;
  private cracks: Phaser.GameObjects.Image;
  private cork: Phaser.GameObjects.Image;
  private corked = false;
  private symbols: Phaser.GameObjects.Text[] = [];
  private symbolsVisible = false;
  private fuseRing: Phaser.GameObjects.Graphics;
  private fuseText: Phaser.GameObjects.Text;
  private fusePulse: Phaser.Tweens.Tween | null = null;
  /** 0 = recién abierto, 1 = seco. Controla la costra. */
  private dryness = 0;
  private ripple = 0;
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
    const w = this.jarWidth;
    const h = this.jarHeight;
    // Sombra proyectada hacia abajo-derecha (luz arriba-izquierda)
    this.shadow = scene.add.image(w * 0.22, h / 2 + 4, ensureSoftShadow(scene, w));
    this.glassBack = scene.add.image(0, 0, glassBackKey(scene, w, h));
    this.add([this.shadow, this.glassBack]);
    this.capSprite = scene.add.image(0, 0, 'px-dark').setOrigin(0.5, 1).setVisible(false);
    this.add(this.capSprite);
    for (let i = 0; i < capacity; i++) {
      const s = scene.add.image(0, 0, 'px-dark').setOrigin(0.5, 1).setVisible(false);
      this.blockSprites.push(s);
      this.add(s);
    }
    for (let i = 0; i < capacity; i++) {
      const d = scene.add.image(0, 0, 'px-dark').setOrigin(0.5, 0.5).setVisible(false);
      d.setAlpha(0.32);
      this.dividerSprites.push(d);
      this.add(d);
    }
    this.meniscus = scene.add.image(0, 0, 'px-dark').setOrigin(0.5, 0.5).setVisible(false);
    this.crust = scene.add.image(0, 0, crustKey(scene, this.innerW)).setOrigin(0.5, 0);
    this.cracks = scene.add.image(0, 0, cracksKey(scene, this.innerW)).setOrigin(0.5, 0);
    this.crust.setVisible(false);
    this.cracks.setVisible(false);
    this.add([this.meniscus, this.crust, this.cracks]);
    for (let i = 0; i < capacity; i++) {
      const s = scene.add
        .text(0, 0, '', textStyle(Math.round(width * 0.26), '#000000'))
        .setOrigin(0.5);
      s.setAlpha(0.55).setVisible(false);
      this.symbols.push(s);
      this.add(s);
    }
    this.glassFront = scene.add.image(0, 0, glassFrontKey(scene, w, h));
    this.add(this.glassFront);
    this.cork = scene.add
      .image(0, this.corkRestY(), corkKey(scene, w, 'red'))
      .setOrigin(0.5, CORK_LIP_Y)
      .setVisible(false);
    this.add(this.cork);
    this.fuseRing = scene.add.graphics();
    this.fuseText = scene.add
      .text(
        w / 2 + 10,
        -h / 2 - 22,
        '',
        textStyle(Math.round(Math.max(36, w * 0.26)), UI.colors.danger),
      )
      .setOrigin(0.5)
      .setVisible(false);
    this.fuseText.setStroke(UI.colors.panel, 6);
    this.add([this.fuseRing, this.fuseText]);

    // El área táctil la resuelve la escena contra la posición base (ver LevelScene.jarAt).
    this.setSize(this.jarWidth, this.jarHeight);
    scene.add.existing(this);
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
  private get capH(): number {
    return Math.round(this.jarWidth * 0.2);
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

  /** Altura del labio: el sello de cera del corcho se apoya ahí. */
  private corkRestY(): number {
    return -this.jarHeight / 2 + 9;
  }

  /** Capas llenas y de un solo pigmento (sin mirar alturas animadas). */
  private layersFullUniform(): boolean {
    return this.layers.length === this.capacity && this.layers.every((p) => p === this.layers[0]);
  }

  private isFullUniform(): boolean {
    if (this.layers.length !== this.capacity) return false;
    return this.layers.every((p) => p === this.layers[0]) && this.heights.every((h) => h >= 1);
  }

  /** Fija las capas sin animación (sincronización con el modelo). */
  setLayers(layers: PigmentId[]): void {
    this.layers = [...layers];
    this.heights = layers.map(() => 1);
    this.corked = this.isFullUniform();
    this.ripple = 0;
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

  /** Ondulación de la superficie al recibir pintura (B3: 200 ms). */
  rippleSurface(durationMs: number): Phaser.Tweens.Tween {
    const proxy = { t: 0 };
    return this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: durationMs,
      onUpdate: () => {
        this.ripple = Math.sin(proxy.t * Math.PI * 4) * (1 - proxy.t);
        this.redraw();
      },
      onComplete: () => {
        this.ripple = 0;
        this.redraw();
      },
    });
  }

  // ---------- secado (B5) ----------
  setFuse(remaining: number | null, max: number | null): void {
    const g = this.fuseRing;
    g.clear();
    this.fusePulse?.stop();
    this.fusePulse = null;
    this.fuseText.setScale(1);
    if (remaining === null || max === null) {
      this.fuseText.setVisible(false);
      this.dryness = 0;
      this.redraw();
      return;
    }
    const frac = Phaser.Math.Clamp(remaining / max, 0, 1);
    this.dryness = 1 - frac;
    // Anillo de progreso alrededor de la boca: elipse en perspectiva sobre el labio.
    const cy = -this.jarHeight / 2 + 9;
    const rx = this.jarWidth / 2 + 16;
    const ry = Math.max(14, this.jarWidth * 0.11);
    const color = frac > 0.5 ? COLORS.accent : frac > 0.25 ? 0xee8a2a : COLORS.danger;
    const ring = (from: number, to: number) => {
      const steps = 48;
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = from + ((to - from) * i) / steps;
        pts.push(new Phaser.Math.Vector2(Math.cos(a) * rx, cy + Math.sin(a) * ry));
      }
      return pts;
    };
    g.lineStyle(7, COLORS.panel, 0.65);
    g.strokePoints(ring(0, Math.PI * 2), false);
    if (frac > 0) {
      g.lineStyle(7, color, 1);
      // Empieza arriba (-π/2) y se consume en sentido horario.
      g.strokePoints(ring(-Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac), false);
    }
    // Movimientos que le quedan a la pintura antes de secarse: siempre a la vista; en los
    // últimos 3, rojo y con pulso.
    const urgent = remaining <= 3;
    this.fuseText
      .setText(String(Math.max(0, remaining)))
      .setColor(urgent ? UI.colors.danger : UI.colors.text)
      .setVisible(true);
    if (urgent) {
      this.fusePulse = this.scene.tweens.add({
        targets: this.fuseText,
        scale: { from: 1, to: 1.25 },
        duration: 380,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    this.redraw();
  }

  // ---------- dibujo ----------
  private blocks(): Block[] {
    const out: Block[] = [];
    for (let i = 0; i < this.layers.length; i++) {
      const h = this.heights[i] ?? 1;
      const last = out[out.length - 1];
      if (last && last.pigment === this.layers[i]) last.height += h;
      else out.push({ pigment: this.layers[i], height: h });
    }
    return out;
  }

  redraw(): void {
    const bottom = this.innerTop + this.innerH;
    const blocks = this.blocks();
    const capH = this.capH;
    let y = bottom;
    let visible = 0;
    for (let i = 0; i < this.blockSprites.length; i++) {
      const sprite = this.blockSprites[i];
      const divider = this.dividerSprites[i];
      const b = blocks[i];
      if (!b || b.height * this.layerH <= 0.5) {
        sprite.setVisible(false);
        divider.setVisible(false);
        if (i === 0) this.capSprite.setVisible(false);
        continue;
      }
      const hgt = b.height * this.layerH;
      if (i === 0) {
        // Base redondeada (altura fija) + cuerpo estirado encima.
        const ch = Math.min(capH, hgt);
        const capKey = paintCapKey(this.scene, this.jarWidth, this.innerW, capH, b.pigment);
        if (this.capSprite.texture.key !== capKey) this.capSprite.setTexture(capKey);
        this.capSprite.setVisible(true).setPosition(0, bottom).setDisplaySize(this.innerW, ch);
        const bodyH = hgt - ch;
        if (bodyH > 0.5) {
          const key = paintKey(this.scene, b.pigment);
          if (sprite.texture.key !== key) sprite.setTexture(key);
          // Solapa 3 px con la base para que no se vea la costura.
          sprite
            .setVisible(true)
            .setPosition(0, bottom - ch + 3)
            .setDisplaySize(this.innerW, bodyH + 3);
        } else sprite.setVisible(false);
        divider.setVisible(false);
      } else {
        const key = paintKey(this.scene, b.pigment);
        if (sprite.texture.key !== key) sprite.setTexture(key);
        sprite.setVisible(true).setPosition(0, y).setDisplaySize(this.innerW, hgt);
        // Separación solo cuando cambia el color.
        divider.setVisible(true).setPosition(0, y).setDisplaySize(this.innerW, 3);
      }
      y -= hgt;
      visible++;
    }
    // Menisco y costra sobre la superficie superior
    if (visible > 0) {
      const top = blocks[blocks.length - 1];
      const key = meniscusKey(this.scene, top.pigment);
      if (this.meniscus.texture.key !== key) this.meniscus.setTexture(key);
      const mh = Math.max(8, this.jarWidth * 0.1) * (1 + this.ripple * 0.6);
      this.meniscus
        .setVisible(true)
        .setPosition(this.ripple * 3, y + 1)
        .setDisplaySize(this.innerW, mh);
      const crustA = Phaser.Math.Clamp((this.dryness - 0.15) / 0.85, 0, 1) * 0.92;
      const crustH = Math.min(this.layerH * 0.7, Math.max(10, bottom - y));
      this.crust
        .setVisible(crustA > 0.02)
        .setAlpha(crustA)
        .setPosition(0, y - 2)
        .setDisplaySize(this.innerW, crustH);
      const crackA = Phaser.Math.Clamp((this.dryness - 0.6) / 0.35, 0, 1);
      this.cracks
        .setVisible(crackA > 0.02)
        .setAlpha(crackA)
        .setPosition(0, y - 1)
        .setDisplaySize(this.innerW, crustH);
    } else {
      this.meniscus.setVisible(false);
      this.crust.setVisible(false);
      this.cracks.setVisible(false);
    }
    // Corcho: solo mientras el frasco está lleno de un pigmento y ya se celebró.
    // (Solo las capas cuentan: mientras sube el nivel de la última capa el corcho no se pierde.)
    if (!this.layersFullUniform()) this.corked = false;
    if (this.corked && this.layers[0]) {
      this.cork.setTexture(corkKey(this.scene, this.jarWidth, this.layers[0]));
    }
    this.cork.setVisible(this.corked);
    // Símbolos de accesibilidad (por capa)
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
    this.shadow.setPosition(this.jarWidth * 0.22 + lift * 0.3, this.jarHeight / 2 + 4 + lift);
    this.shadow.setScale(1 + lift * 0.006).setAlpha(1 - lift * 0.02);
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
    this.scene.tweens.killTweensOf(this.cork);
    this.lifted = false;
    this.setPosition(this.baseX, this.baseY);
    this.setRotation(0);
    this.setScale(1);
    this.setDepth(0);
    this.setShadowLift(0);
    this.cork.setPosition(0, this.corkRestY()).setAngle(0).setAlpha(1);
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

  /** Frasco completado (§9.3, B3): el corcho cae sobre la boca, destello y pop. */
  celebrate(durationMs: number): Phaser.Tweens.Tween {
    const flash = this.scene.add
      .image(0, 0, glassFlashKey(this.scene, this.jarWidth, this.jarHeight))
      .setAlpha(0.55);
    this.addAt(flash, this.list.indexOf(this.glassFront) + 1);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      duration: durationMs * 1.4,
      onComplete: () => flash.destroy(),
    });
    this.corked = true;
    const restY = this.corkRestY();
    if (this.layers[0]) this.cork.setTexture(corkKey(this.scene, this.jarWidth, this.layers[0]));
    this.cork
      .setVisible(true)
      .setPosition(0, restY - this.jarHeight * 0.35)
      .setAngle(-14);
    this.scene.tweens.add({
      targets: this.cork,
      y: restY,
      angle: 0,
      duration: durationMs,
      ease: 'Bounce.Out',
    });
    return this.scene.tweens.add({
      targets: this,
      scale: { from: 1.06, to: 1 },
      duration: durationMs,
      ease: 'Back.Out',
    });
  }
}
