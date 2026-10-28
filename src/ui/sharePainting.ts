import type { PaintingSpec, Shape } from '../core/painting';
import { t } from './i18n';
import { UI } from './theme';

const W = 1080;
const H = 1350;

function drawShape2D(ctx: CanvasRenderingContext2D, s: Shape, w: number, h: number): void {
  const cx = s.x * w;
  const cy = s.y * h;
  const sw = s.w * w;
  const sh = s.h * h;
  ctx.fillStyle = s.color;
  ctx.globalAlpha = s.alpha ?? 1;
  switch (s.kind) {
    case 'rect':
      ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
      break;
    case 'circle':
      ctx.beginPath();
      ctx.arc(cx, cy, sw / 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(cx - sw / 2, cy + sh / 2);
      ctx.lineTo(cx + sw / 2, cy + sh / 2);
      ctx.lineTo(cx, cy - sh / 2);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.globalAlpha = 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pinta el cuadro completo en un contexto 2D dentro del rectángulo dado (sin marco). */
export function paintSpecTo2D(
  ctx: CanvasRenderingContext2D,
  spec: PaintingSpec,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  ctx.fillStyle = spec.background;
  ctx.fillRect(0, 0, w, h);
  for (const s of spec.shapes) drawShape2D(ctx, s, w, h);
  ctx.restore();
}

/** URL pública del juego (origen + base de Vite). */
export function gameUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${location.origin}${base}`;
}

/**
 * Imagen para compartir (A5): PNG 1080×1350 con el cuadro enmarcado, el título,
 * "Pintado en Pigmento" y la URL del juego. Todo dibujado en un canvas 2D fuera de pantalla.
 */
export async function renderShareImage(
  spec: PaintingSpec,
  drawWordmark?: (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d no disponible');
  // Fondo de taller con luz cálida
  const bg = ctx.createRadialGradient(W * 0.3, H * 0.2, 80, W / 2, H / 2, H * 0.8);
  bg.addColorStop(0, UI.colors.backgroundLight);
  bg.addColorStop(1, UI.colors.background);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Marco
  const pw = 880;
  const ph = 680;
  const px = (W - pw) / 2;
  const py = 230;
  const fw = 34;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, px - fw + 10, py - fw + 16, pw + fw * 2, ph + fw * 2, 14);
  ctx.fill();
  ctx.fillStyle = UI.colors.accentDark;
  roundRect(ctx, px - fw, py - fw, pw + fw * 2, ph + fw * 2, 14);
  ctx.fill();
  ctx.fillStyle = UI.colors.accent;
  roundRect(ctx, px - fw + 10, py - fw + 10, pw + fw * 2 - 20, ph + fw * 2 - 20, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(px - 6, py - 6, pw + 12, ph + 12);
  paintSpecTo2D(ctx, spec, px, py, pw, ph);

  // Textos
  const font = `"${UI.font.family}", ${UI.font.fallback}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = UI.colors.text;
  ctx.font = `800 64px ${font}`;
  ctx.fillText(t(spec.titleKey), W / 2, 1010);
  ctx.fillStyle = UI.colors.textDim;
  ctx.font = `600 38px ${font}`;
  ctx.fillText(t('share.caption'), W / 2, 1075);
  if (drawWordmark) drawWordmark(ctx, W / 2, 150, 110);
  else {
    ctx.fillStyle = UI.colors.accent;
    ctx.font = `800 110px ${font}`;
    ctx.fillText('Pigmento', W / 2, 160);
  }
  ctx.fillStyle = UI.colors.accent;
  ctx.font = `600 34px ${font}`;
  ctx.fillText(gameUrl().replace(/^https?:\/\//, ''), W / 2, 1250);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falló'))), 'image/png');
  });
}

export type ShareMethod = 'share' | 'download' | 'failed';

/** Comparte con `navigator.share` (archivo) si se puede; si no, descarga el PNG. */
export async function shareBlob(blob: Blob, filename: string, title: string): Promise<ShareMethod> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title, text: title, url: gameUrl() });
      return 'share';
    }
  } catch (e) {
    // Cancelado por el usuario o no permitido: caer a descarga salvo cancelación explícita.
    if ((e as Error).name === 'AbortError') return 'failed';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'download';
  } catch {
    return 'failed';
  }
}
