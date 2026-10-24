import Phaser from 'phaser';
import { pigmentsConfig } from '../core/pigments';
import type { PigmentId } from '../core/types';
import { hexToNum, shade } from '../ui/theme';

/**
 * Texturas por pigmento generadas una vez (el tint es solo WebGL; con texturas de color
 * el juego se ve igual con el renderer Canvas de respaldo).
 *  - px-<id>: 2×2 del color (capas rectangulares)
 *  - dot-<id>: círculo 24 px (partículas, muestras)
 *  - surf-<id>: círculo más claro (superficie del líquido)
 *  - conf-<id>: rectángulo de confeti
 *  - lb-<w>-<id>: capa inferior con esquinas redondeadas, por ancho de frasco
 */
export function ensurePigmentTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (tex.exists('px-dark')) return;
  const mk = (
    key: string,
    w: number,
    h: number,
    draw: (g: Phaser.GameObjects.Graphics) => void,
  ) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    draw(g);
    g.generateTexture(key, w, h);
    g.destroy();
  };
  mk('px-dark', 2, 2, (g) => {
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, 2, 2);
  });
  for (const p of pigmentsConfig.pigments) {
    const c = hexToNum(p.hex);
    mk(`px-${p.id}`, 2, 2, (g) => {
      g.fillStyle(c, 1);
      g.fillRect(0, 0, 2, 2);
    });
    mk(`dot-${p.id}`, 24, 24, (g) => {
      g.fillStyle(c, 1);
      g.fillCircle(12, 12, 12);
    });
    mk(`surf-${p.id}`, 24, 24, (g) => {
      g.fillStyle(shade(c, 0.35), 1);
      g.fillCircle(12, 12, 12);
    });
    mk(`conf-${p.id}`, 22, 14, (g) => {
      g.fillStyle(c, 1);
      g.fillRoundedRect(0, 0, 22, 14, 3);
    });
  }
}

/** Capa inferior redondeada de un pigmento para un ancho de frasco dado. */
export function ensureBottomLayerTexture(
  scene: Phaser.Scene,
  width: number,
  innerW: number,
  layerH: number,
  pigment: PigmentId,
): string {
  const key = `lb-${width}-${pigment}`;
  if (scene.textures.exists(key)) return key;
  const lh = Math.max(4, Math.round(layerH));
  const r = Math.min(width * 0.18, lh / 2 - 1);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const p = pigmentsConfig.pigments.find((x) => x.id === pigment);
  g.fillStyle(p ? hexToNum(p.hex) : 0xffffff, 1);
  g.fillRoundedRect(0, 0, innerW, lh, { tl: 0, tr: 0, bl: r, br: r });
  g.generateTexture(key, innerW, lh);
  g.destroy();
  return key;
}
