import Phaser from 'phaser';
import uiData from './data/ui.json';
import { BootScene } from './scenes/BootScene';
import { GalleryScene } from './scenes/GalleryScene';
import { LevelScene } from './scenes/LevelScene';
import { PauseScene } from './scenes/PauseScene';
import { SettingsScene } from './scenes/SettingsScene';
import { VictoryScene } from './scenes/VictoryScene';
import { AdOverlayScene } from './scenes/AdOverlayScene';
import { PaletteScene } from './scenes/PaletteScene';
import { DefeatScene } from './scenes/DefeatScene';
import { OfferScene } from './scenes/OfferScene';
import { services } from './services';
import { registerSW } from 'virtual:pwa-register';
import { solve } from './core/solver';

registerSW({ immediate: true });

// `?renderer=canvas` fuerza Canvas (pruebas E2E y respaldo en dispositivos sin WebGL).
const forceCanvas = new URLSearchParams(location.search).get('renderer') === 'canvas';

const config: Phaser.Types.Core.GameConfig = {
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: uiData.canvas.width,
  height: uiData.canvas.height,
  backgroundColor: uiData.colors.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance',
  },
  input: {
    activePointers: 2,
  },
  fps: { target: 60, smoothStep: true },
  disableContextMenu: true,
  scene: [
    BootScene,
    GalleryScene,
    LevelScene,
    VictoryScene,
    PauseScene,
    SettingsScene,
    PaletteScene,
    DefeatScene,
    OfferScene,
    AdOverlayScene,
  ],
};

const game = new Phaser.Game(config);

// El stub de anuncios muestra su overlay como escena por encima de la activa (§11.4).
services().ads.setOverlay(
  (label, durationMs) =>
    new Promise<void>((resolve) => {
      game.scene.start('AdOverlay', { label, durationMs, onDone: resolve });
    }),
);

// Gancho de depuración/pruebas E2E: acceso al juego y al solver desde la consola.
declare global {
  interface Window {
    __pigmento?: { game: Phaser.Game; solve: typeof solve };
  }
}
window.__pigmento = { game, solve };
