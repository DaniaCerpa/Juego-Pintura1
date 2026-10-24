import Phaser from 'phaser';
import { COLORS, UI } from './theme';

let transitioning = false;

/** Fundido de salida y arranque de otra escena. Ignora llamadas repetidas mientras dura. */
export function goTo(scene: Phaser.Scene, key: string, data?: object): void {
  if (transitioning) return;
  transitioning = true;
  const ms = UI.anim.sceneFadeMs;
  scene.cameras.main.fadeOut(ms, 42, 38, 33);
  scene.time.delayedCall(ms, () => {
    transitioning = false;
    scene.scene.start(key, data);
  });
}

export function fadeIn(scene: Phaser.Scene): void {
  scene.cameras.main.fadeIn(UI.anim.sceneFadeMs, 42, 38, 33);
}

/** Panel oscuro semitransparente que cubre toda la pantalla (para overlays). */
export function dim(scene: Phaser.Scene, alpha = 0.72): Phaser.GameObjects.Rectangle {
  const r = scene.add.rectangle(0, 0, UI.canvas.width, UI.canvas.height, COLORS.panel, alpha);
  r.setOrigin(0).setInteractive();
  return r;
}
