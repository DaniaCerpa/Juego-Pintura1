import Phaser from 'phaser';
import { COLORS, shade, textStyle, UI } from './theme';

export interface ButtonOptions {
  width?: number;
  height?: number;
  color?: number;
  textColor?: string;
  fontSize?: number;
  icon?: string; // texto/emoji opcional a la izquierda
  /** Textura de ícono (ui/icons) a la izquierda del texto. */
  iconKey?: string;
  radius?: number;
  outline?: boolean;
}

/**
 * Botón táctil con sombra y pulsación por tween; responde a `pointerdown` (sin click, §14.3).
 * El fondo se genera una vez como textura por (tamaño, color, estilo) y se reutiliza.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private opts: Required<Omit<ButtonOptions, 'icon' | 'iconKey'>> & { icon?: string };
  private dot: Phaser.GameObjects.Arc | null = null;
  private enabledState = true;
  onPress: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    options: ButtonOptions = {},
  ) {
    super(scene, x, y);
    this.opts = {
      width: options.width ?? 420,
      height: options.height ?? 120,
      color: options.color ?? COLORS.accent,
      textColor: options.textColor ?? UI.colors.panel,
      fontSize: options.fontSize ?? 44,
      radius: options.radius ?? 28,
      outline: options.outline ?? false,
      icon: options.icon,
    };
    const key = Button.ensureTexture(scene, this.opts);
    this.bg = scene.add.image(0, 0, key);
    const full = this.opts.icon ? `${this.opts.icon}  ${text}` : text;
    this.label = scene.add
      .text(0, -3, full, textStyle(this.opts.fontSize, this.opts.textColor))
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    if (options.iconKey) {
      const isz = Math.round(this.opts.fontSize * 1.35);
      const gapPx = 16;
      const totalW = isz + gapPx + this.label.width;
      const ic = scene.add
        .image(-totalW / 2 + isz / 2, -3, options.iconKey)
        .setDisplaySize(isz, isz);
      this.label.setX(-totalW / 2 + isz + gapPx + this.label.width / 2);
      this.add(ic);
    }
    this.setSize(this.opts.width, this.opts.height + 8);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this.enabledState) return;
      scene.tweens.killTweensOf(this);
      this.setScale(0.94);
      scene.tweens.add({ targets: this, scale: 1, duration: 140, ease: 'Back.Out' });
      this.onPress?.();
    });
    scene.add.existing(this);
  }

  private static ensureTexture(
    scene: Phaser.Scene,
    o: Required<Omit<ButtonOptions, 'icon' | 'iconKey'>>,
  ): string {
    const key = `btn-${o.width}x${o.height}-${o.color.toString(16)}-${o.radius}-${o.outline ? 'o' : 'f'}`;
    if (scene.textures.exists(key)) return key;
    const { width, height, color, radius, outline } = o;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const pad = 2;
    const totalH = height + 8 + pad * 2;
    const x0 = pad;
    const y0 = pad;
    if (outline) {
      g.fillStyle(COLORS.panel, 0.35);
      g.fillRoundedRect(x0, y0 + 4, width, height, radius);
      g.lineStyle(4, color, 0.9);
      g.strokeRoundedRect(x0, y0 + 4, width, height, radius);
    } else {
      g.fillStyle(shade(color, -0.45), 1);
      g.fillRoundedRect(x0, y0 + 8, width, height, radius);
      g.fillStyle(color, 1);
      g.fillRoundedRect(x0, y0, width, height - 6, radius);
      g.fillStyle(shade(color, 0.25), 0.6);
      g.fillRoundedRect(x0 + 10, y0 + 8, width - 20, height * 0.28, radius * 0.6);
    }
    g.generateTexture(key, width + pad * 2, totalH);
    g.destroy();
    return key;
  }

  setText(text: string): this {
    this.label.setText(this.opts.icon ? `${this.opts.icon}  ${text}` : text);
    return this;
  }

  /** Punto rojo de aviso en la esquina superior derecha. */
  setDot(on: boolean): this {
    if (!this.dot) {
      this.dot = this.scene.add.circle(
        this.opts.width / 2 - 14,
        -this.opts.height / 2 + 10,
        14,
        Phaser.Display.Color.HexStringToColor(UI.colors.danger).color,
      );
      this.dot.setStrokeStyle(4, Phaser.Display.Color.HexStringToColor(UI.colors.panel).color);
      this.add(this.dot);
    }
    this.dot.setVisible(on);
    return this;
  }

  setEnabledState(on: boolean): this {
    this.enabledState = on;
    this.setAlpha(on ? 1 : 0.45);
    return this;
  }
}
