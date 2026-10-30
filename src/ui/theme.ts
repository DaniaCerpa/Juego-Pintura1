import Phaser from 'phaser';
import uiData from '../data/ui.json';
import { ensureWorkshopLight } from '../objects/workshop';

export const UI = uiData;
export const W = uiData.canvas.width;
export const H = uiData.canvas.height;

export function hexToNum(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export const COLORS = {
  background: hexToNum(uiData.colors.background),
  wall: hexToNum(uiData.colors.wall),
  wallShade: hexToNum(uiData.colors.wallShade),
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

/** Fondo de taller: pared clara + textura de lienzo sutil + luz cálida. */
export function drawBackdrop(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Pared clara con un degradado suave hacia abajo (la mesa queda más en sombra).
  g.fillGradientStyle(COLORS.wall, COLORS.wall, COLORS.wallShade, COLORS.wallShade, 1);
  g.fillRect(0, 0, W, H);
  // Con el renderer Canvas (respaldo) cada imagen a pantalla completa es un drawImage de
  // 2 MP por frame; se omite la textura de lienzo y se deja solo la viñeta.
  const webgl = scene.sys.game.renderer.type === Phaser.WEBGL;
  if (webgl && scene.textures.exists('canvas-noise')) {
    const noise = scene.add.tileSprite(W / 2, H / 2, W, H, 'canvas-noise');
    noise.setAlpha(0.16);
  }
  // Luz cálida de taller desde arriba a la izquierda + viñeta (B2).
  scene.add.image(W / 2, H / 2, ensureWorkshopLight(scene)).setDisplaySize(W, H);
}
