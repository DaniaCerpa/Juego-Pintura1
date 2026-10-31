import Phaser from 'phaser';
import { canvasTexture, roundRectPath } from '../objects/canvasTex';
import { textStyle, UI } from './theme';

/**
 * Moneda en 3D: canto visible (grosor), cara con degradado metálico, aro en relieve,
 * estrella grabada y brillo especular. Textura generada una vez por tamaño.
 */
export function coinKey(scene: Phaser.Scene, d: number): string {
  const size = Math.round(d);
  const depth = Math.max(3, Math.round(size * 0.1));
  return canvasTexture(scene, `coin3d-${size}`, size + 4, size + depth + 4, (ctx) => {
    const cx = size / 2 + 2;
    const cy = size / 2 + 2;
    const r = size / 2;
    // Sombra suave
    ctx.fillStyle = 'rgba(60,30,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + depth + 1, r, r * 0.96, 0, 0, Math.PI * 2);
    ctx.fill();
    // Canto (el grosor de la moneda)
    const edge = ctx.createLinearGradient(0, cy, 0, cy + depth + r);
    edge.addColorStop(0, '#C07A08');
    edge.addColorStop(1, '#8A5200');
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.ellipse(cx, cy + depth, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
    // Estrías del canto
    ctx.strokeStyle = 'rgba(255,220,120,0.35)';
    ctx.lineWidth = 1;
    for (let a = 0.15; a < Math.PI - 0.15; a += 0.18) {
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + depth);
      ctx.stroke();
    }
    // Cara
    const face = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    face.addColorStop(0, '#FFF4B0');
    face.addColorStop(0.45, UI.colors.gold);
    face.addColorStop(1, UI.colors.goldDark);
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Aro en relieve
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeStyle = 'rgba(160,95,0,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.strokeStyle = 'rgba(255,250,210,0.7)';
    ctx.beginPath();
    ctx.arc(cx - 0.8, cy - 0.8, r * 0.78, Math.PI * 0.9, Math.PI * 1.75);
    ctx.stroke();
    // Estrella grabada (sombra + cara)
    const star = (ox: number, oy: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? r * 0.46 : r * 0.2;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = cx + ox + Math.cos(a) * rr;
        const y = cy + oy + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };
    star(size * 0.025, size * 0.03, 'rgba(150,85,0,0.6)');
    star(0, 0, '#FFE27A');
    // Brillo especular
    const shine = ctx.createLinearGradient(cx - r, cy - r, cx, cy);
    shine.addColorStop(0, 'rgba(255,255,255,0.75)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.42, r * 0.42, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  });
}

function pillKey(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTexture(scene, `coinpill-${w}x${h}`, w + 8, h + 12, (ctx) => {
    // Sombra
    ctx.fillStyle = 'rgba(30,20,60,0.22)';
    roundRectPath(ctx, 4, 8, w, h, h / 2);
    ctx.fill();
    // Cuerpo con degradado claro
    const g = ctx.createLinearGradient(0, 2, 0, h + 2);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(1, '#F1EBFF');
    ctx.fillStyle = g;
    roundRectPath(ctx, 4, 2, w, h, h / 2);
    ctx.fill();
    // Borde y brillo superior
    ctx.strokeStyle = 'rgba(70,58,133,0.35)';
    ctx.lineWidth = 3;
    roundRectPath(ctx, 5.5, 3.5, w - 3, h - 3, (h - 3) / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    roundRectPath(ctx, h * 0.5, 6, w - h * 0.6, h * 0.22, h * 0.11);
    ctx.fill();
  });
}

export interface CoinCounter {
  container: Phaser.GameObjects.Container;
  setValue(n: number, pop?: boolean): void;
}

/**
 * Contador de monedas: píldora clara con la moneda 3D saliendo por la izquierda y el
 * número en negrita. `x, y` es el centro de la píldora.
 */
export function addCoinCounter(
  scene: Phaser.Scene,
  x: number,
  y: number,
  value: number,
  opts: { width?: number; height?: number } = {},
): CoinCounter {
  const w = opts.width ?? 230;
  const h = opts.height ?? 76;
  const c = scene.add.container(x, y);
  const pill = scene.add.image(0, 3, pillKey(scene, w, h));
  const coinD = Math.round(h * 1.25);
  const coin = scene.add.image(-w / 2 + coinD * 0.32, 0, coinKey(scene, coinD));
  // El número va centrado en la parte de la píldora que queda a la derecha de la moneda.
  const left = -w / 2 + coinD * 0.66;
  const right = w / 2 - 16;
  const label = scene.add
    .text((left + right) / 2, 0, String(value), {
      ...textStyle(Math.round(h * 0.6), UI.colors.onWall),
      fontStyle: 'bold',
    })
    .setOrigin(0.5);
  c.add([pill, coin, label]);
  return {
    container: c,
    setValue(n: number, pop = true) {
      label.setText(String(n));
      if (!pop) return;
      scene.tweens.add({
        targets: coin,
        scale: { from: 1.25, to: 1 },
        duration: 260,
        ease: 'Back.Out',
      });
    },
  };
}
