import Phaser from 'phaser';
import uiData from '../data/ui.json';

export const UI = uiData;
export const W = uiData.canvas.width;
export const H = uiData.canvas.height;

export function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export const COLORS = {
  background: hexToNum(uiData.colors.background),
  backgroundLight: hexToNum(uiData.colors.backgroundLight),
  panel: hexToNum(uiData.colors.panel),
  text: hexToNum(uiData.colors.text),
  textDim: hexToNum(uiData.colors.textDim),
  accent: hexToNum(uiData.colors.accent),
  accentDark: hexToNum(uiData.colors.accentDark),
  glass: hexToNum(uiData.colors.glass),
  danger: hexToNum(uiData.colors.danger),
  success: hexToNum(uiData.colors.success),
};

export const FONT = `"${uiData.font.family}", ${uiData.font.fallback}`;

export function textStyle(
  size: number,
  color: string = uiData.colors.text,
  weight: '600' | '800' = '800',
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: weight === '800' ? 'bold' : 'normal',
    color,
    align: 'center',
  };
}

/** Aclara u oscurece un color (factor > 0 aclara, < 0 oscurece). */
export function shade(color: number, factor: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const f = Math.abs(factor);
  const target = factor > 0 ? 255 : 0;
  const r = Math.round(c.red + (target - c.red) * f);
  const g = Math.round(c.green + (target - c.green) * f);
  const b = Math.round(c.blue + (target - c.blue) * f);
  return Phaser.Display.Color.GetColor(r, g, b);
}

/** Fondo de taller: color base + textura de lienzo sutil + viñeta cálida. */
export function drawBackdrop(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.background, 1);
  g.fillRect(0, 0, W, H);
  if (scene.textures.exists('canvas-noise')) {
    const noise = scene.add.tileSprite(W / 2, H / 2, W, H, 'canvas-noise');
    noise.setAlpha(0.16);
  }
  if (scene.textures.exists('vignette')) {
    scene.add
      .image(W / 2, H / 2, 'vignette')
      .setDisplaySize(W, H)
      .setAlpha(0.55);
  }
}
