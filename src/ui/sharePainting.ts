import type { PaintingSpec, Shape } from '../core/painting';
import { t } from './i18n';
import { UI } from './theme';
import { drawWordmark2D } from './wordmark';

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

/** Lo que se comparte: un cuadro que sabe dibujarse en un rectángulo. */
export interface ShareSource {
  id: number;
  title: string;
  /** Línea secundaria (p. ej. autor y año de la obra). */
  subtitle?: string;
  /** Ancho / alto del cuadro. */
  aspect: number;
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void;
}

/** Fuente de un cuadro procedural (respaldo cuando no hay obras descargadas). */
export function shareSourceFromSpec(spec: PaintingSpec): ShareSource {
  return {
    id: spec.id,
    title: t(spec.titleKey),
    aspect: 880 / 680,
    draw: (ctx, x, y, w, h) => paintSpecTo2D(ctx, spec, x, y, w, h),
  };
}

/**
 * Imagen para compartir (A5): PNG 1080×1350 con el cuadro enmarcado, el título,
 * "Pintado en Pigmento" y la URL del juego. Todo dibujado en un canvas 2D fuera de pantalla.
 */
export async function renderShareImage(src: ShareSource): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d no disponible');
  // Fondo de taller con luz cálida
  const bg = ctx.createRadialGradient(W * 0.3, H * 0.2, 80, W / 2, H / 2, H * 0.8);
  bg.addColorStop(0, UI.colors.wall);
  bg.addColorStop(1, UI.colors.wallShade);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Marco (el cuadro se ajusta a la caja respetando su proporción)
  let pw = 880;
  let ph = pw / src.aspect;
  if (ph > 680) {
    ph = 680;
    pw = ph * src.aspect;
  }
  const px = (W - pw) / 2;
  const py = 230 + (680 - ph) / 2;
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
  src.draw(ctx, px, py, pw, ph);

  // Textos
  const font = `"${UI.font.family}", ${UI.font.fallback}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = UI.colors.onWall;
  ctx.font = `800 ${src.title.length > 30 ? 46 : 60}px ${font}`;
  ctx.fillText(src.title, W / 2, 1010);
  ctx.fillStyle = UI.colors.onWallDim;
  ctx.font = `600 36px ${font}`;
  ctx.fillText(
    src.subtitle ? `${src.subtitle} · ${t('share.caption')}` : t('share.caption'),
    W / 2,
    1072,
  );
  drawWordmark2D(ctx, W / 2, 130, 120);
  ctx.fillStyle = UI.colors.accentDark;
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
