import Phaser from 'phaser';
import { COLORS, textStyle, W } from './theme';

/** Mensaje breve de una línea (tooltips de ayudas, "¡Nueva mezcla!", etc.). */
export function showToast(scene: Phaser.Scene, text: string, y = 1540, durationMs = 2200): void {
  const padding = 28;
  const label = scene.add.text(0, 0, text, textStyle(34, '#F4EDE1', '600')).setOrigin(0.5);
  const w = Math.min(W - 80, label.width + padding * 2);
  const h = label.height + padding;
  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.panel, 0.92);
  bg.fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  bg.lineStyle(2, COLORS.accent, 0.5);
  bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
  const c = scene.add
    .container(W / 2, y + 30, [bg, label])
    .setAlpha(0)
    .setDepth(1000);
  scene.tweens.add({ targets: c, alpha: 1, y, duration: 180, ease: 'Quad.Out' });
  scene.tweens.add({
    targets: c,
    alpha: 0,
    y: y - 20,
    delay: durationMs,
    duration: 220,
    onComplete: () => c.destroy(),
  });
}
