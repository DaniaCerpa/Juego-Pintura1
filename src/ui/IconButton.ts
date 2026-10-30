import Phaser from 'phaser';
import { canvasTexture, roundRectPath, rgba, shadeHexStr } from '../objects/canvasTex';
import { iconKey, type IconName } from './icons';
import { textStyle, UI } from './theme';

export interface IconButtonOptions {
  size?: number;
  label?: string;
  /** Color de fondo (hex con #). */
  color?: string;
  iconColor?: string;
  labelColor?: string;
}

/**
 * Botón de ícono (B7): fondo redondeado con relieve, ícono vectorial, etiqueta opcional
 * debajo e insignia de cantidad o punto de aviso. Inactivo = 40 % de opacidad.
 */
export class IconButton extends Phaser.GameObjects.Container {
  private badge: Phaser.GameObjects.Container;
  private badgeText: Phaser.GameObjects.Text;
  private dot: Phaser.GameObjects.Arc;
  private enabledState = true;
  onPress: (() => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    icon: IconName,
    opts: IconButtonOptions = {},
  ) {
    super(scene, x, y);
    const size = opts.size ?? 132;
    const color = opts.color ?? UI.colors.backgroundLight;
    const bgKey = canvasTexture(scene, `iconbtn-${size}-${color}`, size + 4, size + 14, (ctx) => {
      roundRectPath(ctx, 2, 10, size, size, size * 0.28);
      ctx.fillStyle = shadeHexStr(color, -0.45);
      ctx.fill();
      roundRectPath(ctx, 2, 2, size, size, size * 0.28);
      const g = ctx.createLinearGradient(0, 2, 0, size);
      g.addColorStop(0, shadeHexStr(color, 0.14));
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = rgba(UI.colors.accent, 0.18);
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    const bg = scene.add.image(0, 4, bgKey);
    const ic = scene.add
      .image(0, 0, iconKey(scene, icon, opts.iconColor ?? UI.colors.text))
      .setDisplaySize(size * 0.62, size * 0.62);
    this.add([bg, ic]);
    if (opts.label) {
      this.add(
        scene.add
          .text(
            0,
            size / 2 + 34,
            opts.label,
            textStyle(26, opts.labelColor ?? UI.colors.onWall, '600'),
          )
          .setOrigin(0.5),
      );
    }
    // Insignia de cantidad (arriba a la derecha)
    const br = size * 0.2;
    const badgeBg = scene.add.circle(
      0,
      0,
      br,
      Phaser.Display.Color.HexStringToColor(UI.colors.accent).color,
    );
    badgeBg.setStrokeStyle(4, Phaser.Display.Color.HexStringToColor(UI.colors.panel).color);
    this.badgeText = scene.add
      .text(0, -1, '', textStyle(Math.round(br * 1.2), UI.colors.panel))
      .setOrigin(0.5);
    this.badge = scene.add.container(size / 2 - br * 0.4, -size / 2 + br * 0.4, [
      badgeBg,
      this.badgeText,
    ]);
    this.badge.setVisible(false);
    this.dot = scene.add.circle(
      size / 2 - 10,
      -size / 2 + 10,
      13,
      Phaser.Display.Color.HexStringToColor(UI.colors.danger).color,
    );
    this.dot
      .setStrokeStyle(4, Phaser.Display.Color.HexStringToColor(UI.colors.panel).color)
      .setVisible(false);
    this.add([this.badge, this.dot]);
    this.setSize(size + 20, size + 20);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      if (!this.enabledState) return;
      scene.tweens.killTweensOf(this);
      this.setScale(0.92);
      scene.tweens.add({ targets: this, scale: 1, duration: 140, ease: 'Back.Out' });
      this.onPress?.();
    });
    scene.add.existing(this);
  }

  /** Muestra un número en la insignia; null la oculta. */
  setBadge(value: number | string | null): this {
    if (value === null) this.badge.setVisible(false);
    else {
      this.badgeText.setText(String(value));
      this.badge.setVisible(true);
    }
    return this;
  }

  /** Punto rojo de aviso (p. ej., regalo disponible). */
  setDot(on: boolean): this {
    this.dot.setVisible(on);
    return this;
  }

  setEnabledState(on: boolean): this {
    this.enabledState = on;
    this.setAlpha(on ? 1 : 0.4);
    return this;
  }
}
