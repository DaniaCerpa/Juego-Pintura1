import Phaser from 'phaser';
import galleryData from '../data/gallery.json';
import {
  creditFor,
  masterpieceFor,
  masterpiecesConfig,
  planDecade,
  segmentCountFor,
  decadeSlots,
  segmentImage,
  seedFor,
  type DecadePlan,
  type Masterpiece,
  type Segmentation,
} from '../core/masterpiece';
import { getPigment } from '../core/pigments';
import type { PigmentId } from '../core/types';
import { getLang } from '../ui/i18n';
import { COLORS, UI } from '../ui/theme';
import type { ShareSource } from '../ui/sharePainting';
import { canvasTexture, roundRectPath } from './canvasTex';

/**
 * Cuadro de verdad (obra de dominio público) que se va pintando "por manchas".
 * Lo no pintado se ve como boceto a lápiz sobre papel; las manchas del nivel en curso
 * llevan un velo del color del pigmento que las pinta ("pinta por números"). Al completar
 * un frasco, sus manchas se pintan con un barrido de pincel.
 *
 * Todo el trabajo pesado (k-means, boceto) se hace una vez por obra y se cachea.
 */

const PAPER: [number, number, number] = [243, 236, 223];
const GRAPHITE: [number, number, number] = [88, 78, 70];

const segCache = new Map<string, Segmentation>();
const planCache = new Map<number, DecadePlan>();
let instanceCounter = 0;

export function paintingUrl(id: string): string {
  return `${import.meta.env.BASE_URL}paintings/${id}.jpg`;
}

export function textureKeyFor(id: string): string {
  return `mp-${id}`;
}

/** Carga (una vez) la imagen de una obra como textura de Phaser. */
export function ensurePaintingTexture(scene: Phaser.Scene, id: string): Promise<string> {
  const key = textureKeyFor(id);
  if (scene.textures.exists(key)) return Promise.resolve(key);
  return new Promise((resolve, reject) => {
    const onDone = (k: string) => {
      if (k !== key) return;
      cleanup();
      resolve(key);
    };
    const onError = (file: Phaser.Loader.File) => {
      if (file.key !== key) return;
      cleanup();
      reject(new Error(`No se pudo cargar ${id}`));
    };
    const cleanup = () => {
      scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onDone);
      scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    };
    scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, onDone);
    scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
    scene.load.image(key, paintingUrl(id));
    if (!scene.load.isLoading()) scene.load.start();
  });
}

export function masterpieceTitle(m: Masterpiece): string {
  return getLang() === 'en' ? m.title.en : m.title.es;
}

/** Tamaño que ocupa una obra dentro de una caja, respetando su proporción. */
export function fitSize(m: Masterpiece, maxW: number, maxH: number): { w: number; h: number } {
  const c = creditFor(m.id);
  const aspect = c ? c.width / c.height : 4 / 3;
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w: Math.round(w), h: Math.round(h) };
}

export interface MasterpieceCanvasOptions {
  frame?: boolean;
  /** Niveles de la decena ya ganados: sus manchas se ven pintadas. */
  revealedLevels?: Iterable<number>;
  /** Nivel en curso: sus manchas pendientes llevan el velo del color que las pinta. */
  hintLevel?: number;
  /** Cuadro terminado: se muestra la obra completa sin análisis. */
  complete?: boolean;
}

export class MasterpieceCanvas extends Phaser.GameObjects.Container {
  readonly masterpiece: Masterpiece;
  readonly paintingIndex: number;
  readonly pw: number;
  readonly ph: number;
  private readonly opts: MasterpieceCanvasOptions;
  private texKey: string | null = null;
  private image: Phaser.GameObjects.Image | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private colorPx: Uint8ClampedArray | null = null;
  private sketchPx: Uint8ClampedArray | null = null;
  /** Mancha de cada píxel de pantalla. */
  private labels: Uint16Array | null = null;
  /** Píxeles de cada mancha, ordenados para el barrido del pincel. */
  private segPixels: Int32Array[] = [];
  private segBounds: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private plan: DecadePlan | null = null;
  private revealed: Uint8Array = new Uint8Array(0);
  private hint: Int32Array = new Int32Array(0);
  private brush: Phaser.GameObjects.Image | null = null;
  private tweensActive: Phaser.Tweens.Tween[] = [];
  private queue: (() => void)[] = [];
  private isReady = false;
  private signed = false;
  readonly ready: Promise<void>;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    maxW: number,
    maxH: number,
    paintingIndex: number,
    options: MasterpieceCanvasOptions = {},
  ) {
    super(scene, x, y);
    const m = masterpieceFor(paintingIndex);
    if (!m) throw new Error('No hay obras disponibles');
    this.masterpiece = m;
    this.paintingIndex = paintingIndex;
    this.opts = options;
    const { w, h } = fitSize(m, maxW, maxH);
    this.pw = w;
    this.ph = h;
    if (options.frame ?? true) this.add(scene.add.image(0, 0, frameKey(scene, w, h)));
    this.add(scene.add.image(0, 0, paperKey(scene, w, h)));
    scene.add.existing(this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      for (const tw of this.tweensActive) tw.stop();
      if (this.texKey && scene.textures.exists(this.texKey)) scene.textures.remove(this.texKey);
    });
    this.ready = ensurePaintingTexture(scene, m.id)
      .then(() => {
        if (!this.scene) return;
        this.build();
        this.isReady = true;
        for (const fn of this.queue) fn();
        this.queue = [];
      })
      .catch(() => {
        /* sin imagen: queda el papel; el juego sigue */
      });
  }

  /** Porcentaje de manchas pintadas (por área). */
  percent(): number {
    if (!this.labels) return 0;
    let done = 0;
    for (let s = 0; s < this.revealed.length; s++)
      if (this.revealed[s]) done += this.segPixels[s].length;
    return Math.round((done / this.labels.length) * 100);
  }

  private whenReady(fn: () => void): void {
    if (this.isReady) fn();
    else this.queue.push(fn);
  }

  private build(): void {
    const scene = this.scene;
    const m = this.masterpiece;
    const src = scene.textures.get(textureKeyFor(m.id)).getSourceImage() as HTMLImageElement;
    const w = this.pw;
    const h = this.ph;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, w, h);
    const colorData = ctx.getImageData(0, 0, w, h);
    this.colorPx = new Uint8ClampedArray(colorData.data);
    this.ctx = ctx;
    this.texKey = `mpc-${m.id}-${w}x${h}-${++instanceCounter}`;
    scene.textures.addCanvas(this.texKey, canvas);
    this.image = scene.add.image(0, 0, this.texKey);
    this.add(this.image);

    if (this.opts.complete) {
      // Obra terminada: la imagen tal cual.
      ctx.putImageData(colorData, 0, 0);
      this.refreshTexture();
      return;
    }

    // Análisis de manchas (a baja resolución, cacheado por obra y cantidad de manchas).
    const per = galleryData.levelsPerPainting;
    const k = segmentCountFor(decadeSlots(this.paintingIndex, per).length);
    const seg = analyse(src, m, k);
    let plan = planCache.get(this.paintingIndex);
    if (!plan || plan.segmentSlot.length !== seg.colors.length) {
      plan = planDecade(seg, this.paintingIndex, per);
      planCache.set(this.paintingIndex, plan);
    }
    this.plan = plan;
    this.labels = upsampleLabels(seg, this.colorPx, w, h);
    this.sketchPx = makeSketch(this.colorPx, w, h);
    this.indexSegments(seg.colors.length);

    const revealedLevels = new Set(this.opts.revealedLevels ?? []);
    this.revealed = new Uint8Array(seg.colors.length);
    this.hint = new Int32Array(seg.colors.length).fill(-1);
    for (let s = 0; s < seg.colors.length; s++) {
      const slot = plan.slots[plan.segmentSlot[s]];
      if (!slot) continue;
      if (revealedLevels.has(slot.level)) this.revealed[s] = 1;
      else if (slot.level === this.opts.hintLevel)
        this.hint[s] = parseInt(getPigment(slot.pigment).hex.replace('#', ''), 16);
    }
    this.imageData = ctx.createImageData(w, h);
    this.composeAll();
  }

  private indexSegments(count: number): void {
    const labels = this.labels!;
    const w = this.pw;
    const sizes = new Int32Array(count);
    for (let i = 0; i < labels.length; i++) sizes[labels[i]]++;
    this.segPixels = Array.from({ length: count }, (_, s) => new Int32Array(sizes[s]));
    this.segBounds = Array.from({ length: count }, () => ({
      x0: Infinity,
      y0: Infinity,
      x1: -1,
      y1: -1,
    }));
    const fill = new Int32Array(count);
    for (let i = 0; i < labels.length; i++) {
      const s = labels[i];
      this.segPixels[s][fill[s]++] = i;
      const x = i % w;
      const y = (i / w) | 0;
      const b = this.segBounds[s];
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
    // Orden de barrido: diagonal (arriba-izquierda → abajo-derecha), como una pincelada.
    for (const arr of this.segPixels) {
      const keyOf = (i: number) => (i % w) + ((i / w) | 0) * 0.6;
      const sorted = Array.from(arr).sort((a, b) => keyOf(a) - keyOf(b));
      arr.set(sorted);
    }
  }

  private writePixel(i: number, s: number): void {
    const out = this.imageData!.data;
    const o = i * 4;
    if (this.revealed[s]) {
      out[o] = this.colorPx![o];
      out[o + 1] = this.colorPx![o + 1];
      out[o + 2] = this.colorPx![o + 2];
    } else {
      let r = this.sketchPx![o];
      let g = this.sketchPx![o + 1];
      let b = this.sketchPx![o + 2];
      const hint = this.hint[s];
      if (hint >= 0) {
        const a = 0.34;
        r = r * (1 - a) + ((hint >> 16) & 255) * a;
        g = g * (1 - a) + ((hint >> 8) & 255) * a;
        b = b * (1 - a) + (hint & 255) * a;
      }
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
    out[o + 3] = 255;
  }

  private composeAll(): void {
    if (!this.labels || !this.imageData || !this.ctx) return;
    const labels = this.labels;
    for (let i = 0; i < labels.length; i++) this.writePixel(i, labels[i]);
    // Contorno tenue de las manchas pendientes del nivel (pinta por números).
    const out = this.imageData.data;
    const w = this.pw;
    for (let i = 0; i < labels.length; i++) {
      const s = labels[i];
      if (this.revealed[s] || this.hint[s] < 0) continue;
      const x = i % w;
      const right = x + 1 < w ? labels[i + 1] : s;
      const down = i + w < labels.length ? labels[i + w] : s;
      if (right !== s || down !== s) {
        const o = i * 4;
        out[o] = out[o] * 0.55 + GRAPHITE[0] * 0.45;
        out[o + 1] = out[o + 1] * 0.55 + GRAPHITE[1] * 0.45;
        out[o + 2] = out[o + 2] * 0.55 + GRAPHITE[2] * 0.45;
      }
    }
    this.ctx.putImageData(this.imageData, 0, 0);
    this.refreshTexture();
  }

  private refreshTexture(): void {
    if (!this.texKey) return;
    const tex = this.scene.textures.get(this.texKey) as Phaser.Textures.CanvasTexture;
    tex.refresh();
  }

  /** Manchas de un (nivel, pigmento) aún sin pintar. */
  private pendingSegments(level: number, pigment: PigmentId | null): number[] {
    if (!this.plan) return [];
    const out: number[] = [];
    for (let s = 0; s < this.revealed.length; s++) {
      if (this.revealed[s]) continue;
      const slot = this.plan.slots[this.plan.segmentSlot[s]];
      if (!slot || slot.level !== level) continue;
      if (pigment !== null && slot.pigment !== pigment) continue;
      out.push(s);
    }
    return out;
  }

  /** Pinta las manchas de un pigmento en un nivel con un barrido de pincel. */
  revealPigment(level: number, pigment: PigmentId, durationMs = UI.anim.brushMs): void {
    this.whenReady(() => this.animateReveal(this.pendingSegments(level, pigment), durationMs));
  }

  /** Pinta todo lo que queda del nivel (al ganar). */
  revealLevel(level: number, durationMs = UI.anim.brushMs): void {
    this.whenReady(() => this.animateReveal(this.pendingSegments(level, null), durationMs));
  }

  /** ¿Quedan manchas sin pintar de este pigmento en el nivel? */
  hasPending(level: number, pigment: PigmentId): boolean {
    return this.pendingSegments(level, pigment).length > 0;
  }

  /** Vuelve a dejar sin pintar las manchas del nivel (lienzo nuevo). */
  resetLevel(level: number): void {
    this.whenReady(() => {
      this.finishAnimations();
      if (!this.plan) return;
      for (let s = 0; s < this.revealed.length; s++) {
        const slot = this.plan.slots[this.plan.segmentSlot[s]];
        if (slot && slot.level === level) {
          this.revealed[s] = 0;
          this.hint[s] = parseInt(getPigment(slot.pigment).hex.replace('#', ''), 16);
        }
      }
      this.composeAll();
    });
  }

  finishAnimations(): void {
    const tws = this.tweensActive;
    this.tweensActive = [];
    for (const tw of tws) tw.complete();
  }

  private animateReveal(segments: number[], durationMs: number): void {
    if (segments.length === 0 || !this.imageData || !this.ctx) return;
    // Lista de píxeles del barrido (todas las manchas, en orden diagonal global).
    const w = this.pw;
    const total = segments.reduce((a, s) => a + this.segPixels[s].length, 0);
    const pixels = new Int32Array(total);
    let k = 0;
    for (const s of segments) {
      pixels.set(this.segPixels[s], k);
      k += this.segPixels[s].length;
    }
    const order = Array.from({ length: total }, (_, i) => i);
    const keyOf = (i: number) => (pixels[i] % w) + ((pixels[i] / w) | 0) * 0.6;
    order.sort((a, b) => keyOf(a) - keyOf(b));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (const s of segments) {
      const b = this.segBounds[s];
      x0 = Math.min(x0, b.x0);
      y0 = Math.min(y0, b.y0);
      x1 = Math.max(x1, b.x1);
      y1 = Math.max(y1, b.y1);
      this.revealed[s] = 1; // el modelo queda pintado ya; la animación solo lo muestra
    }
    // Hasta que el pincel pase, se dibuja como pendiente: se recompone desde el boceto.
    const brush = this.ensureBrush();
    let done = 0;
    const out = this.imageData.data;
    const paintUpTo = (n: number) => {
      for (; done < n; done++) {
        const i = pixels[order[done]];
        const o = i * 4;
        out[o] = this.colorPx![o];
        out[o + 1] = this.colorPx![o + 1];
        out[o + 2] = this.colorPx![o + 2];
        out[o + 3] = 255;
      }
      this.ctx!.putImageData(this.imageData!, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
      this.refreshTexture();
    };
    const proxy = { p: 0 };
    const tw = this.scene.tweens.add({
      targets: proxy,
      p: 1,
      duration: durationMs,
      ease: 'Sine.InOut',
      onStart: () => brush.setVisible(true),
      onUpdate: () => {
        const n = Math.floor(proxy.p * total);
        paintUpTo(n);
        if (n > 0) {
          const i = pixels[order[Math.min(total - 1, n - 1)]];
          brush.setPosition(-this.pw / 2 + (i % w) + 6, -this.ph / 2 + ((i / w) | 0) + 10);
        }
      },
      onComplete: () => {
        paintUpTo(total);
        brush.setVisible(false);
        const idx = this.tweensActive.indexOf(tw);
        if (idx >= 0) this.tweensActive.splice(idx, 1);
      },
    });
    this.tweensActive.push(tw);
  }

  private ensureBrush(): Phaser.GameObjects.Image {
    if (!this.brush) {
      this.brush = this.scene.add
        .image(0, 0, brushKey(this.scene))
        .setOrigin(0.5, 1)
        .setAngle(28)
        .setVisible(false);
      this.brush.setScale(Phaser.Math.Clamp(this.ph / 500, 0.4, 1));
      this.add(this.brush);
    }
    return this.brush;
  }

  /** Para compartir: la obra completa con su título y autor. */
  shareSource(): ShareSource {
    const m = this.masterpiece;
    const img = this.scene.textures.exists(textureKeyFor(m.id))
      ? (this.scene.textures.get(textureKeyFor(m.id)).getSourceImage() as HTMLImageElement)
      : null;
    return {
      id: this.paintingIndex,
      title: masterpieceTitle(m),
      subtitle: `${m.artist}, ${m.year}`,
      aspect: this.pw / this.ph,
      draw: (ctx, x, y, w, h) => {
        if (img) ctx.drawImage(img, x, y, w, h);
      },
    };
  }

  /** Firma del Encargo: trazo corto en la esquina inferior derecha. */
  sign(durationMs = 500): void {
    if (this.signed) return;
    this.signed = true;
    const g = this.scene.add.graphics();
    this.add(g);
    const x0 = this.pw / 2 - this.pw * 0.24;
    const y0 = this.ph / 2 - this.ph * 0.07;
    const draw = (t: number) => {
      g.clear();
      g.lineStyle(Math.max(2, this.pw / 140), COLORS.panel, 0.9);
      g.beginPath();
      const steps = Math.max(2, Math.floor(t * 28));
      for (let i = 0; i <= steps; i++) {
        const u = i / 28;
        const px = x0 + u * this.pw * 0.2;
        const py = y0 + Math.sin(u * Math.PI * 4) * this.ph * 0.02 - u * this.ph * 0.012;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    };
    if (durationMs <= 1) {
      draw(1);
      return;
    }
    const proxy = { t: 0 };
    this.scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: durationMs,
      onUpdate: () => draw(proxy.t),
      onComplete: () => draw(1),
    });
  }
}

// ---------------------------------------------------------------------------------------
// Análisis e imagen de boceto
// ---------------------------------------------------------------------------------------

function analyse(src: HTMLImageElement, m: Masterpiece, k: number): Segmentation {
  const key = `${m.id}|${k}`;
  const cached = segCache.get(key);
  if (cached) return cached;
  const aw = masterpiecesConfig.analysisWidthPx;
  const ah = Math.max(8, Math.round((aw * src.height) / src.width));
  const c = document.createElement('canvas');
  c.width = aw;
  c.height = ah;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(src, 0, 0, aw, ah);
  const data = cx.getImageData(0, 0, aw, ah).data;
  const seg = segmentImage(data, aw, ah, k, seedFor(m.id));
  segCache.set(key, seg);
  return seg;
}

/**
 * Lleva las etiquetas de baja resolución a la de pantalla. Para no dejar bordes en
 * escalera, cada píxel elige, entre las etiquetas vecinas, la de color medio más parecido.
 */
function upsampleLabels(
  seg: Segmentation,
  color: Uint8ClampedArray,
  w: number,
  h: number,
): Uint16Array {
  const out = new Uint16Array(w * h);
  const sx = seg.width / w;
  const sy = seg.height / h;
  const cand = new Uint16Array(4);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(seg.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(seg.height - 1, y0 + 1);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(seg.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(seg.width - 1, x0 + 1);
      cand[0] = seg.labels[y0 * seg.width + x0];
      cand[1] = seg.labels[y0 * seg.width + x1];
      cand[2] = seg.labels[y1 * seg.width + x0];
      cand[3] = seg.labels[y1 * seg.width + x1];
      const i = y * w + x;
      if (cand[0] === cand[1] && cand[0] === cand[2] && cand[0] === cand[3]) {
        out[i] = cand[0];
        continue;
      }
      const o = i * 4;
      let best = cand[0];
      let bestD = Infinity;
      for (let c = 0; c < 4; c++) {
        const col = seg.colors[cand[c]];
        const d =
          (col[0] - color[o]) ** 2 + (col[1] - color[o + 1]) ** 2 + (col[2] - color[o + 2]) ** 2;
        if (d < bestD) {
          bestD = d;
          best = cand[c];
        }
      }
      out[i] = best;
    }
  }
  return out;
}

/** Boceto: papel con sombreado suave según la luminosidad y trazos de lápiz en los bordes. */
function makeSketch(color: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = 0.299 * color[i * 4] + 0.587 * color[i * 4 + 1] + 0.114 * color[i * 4 + 2];
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const l = lum[i] / 255;
      let gx = 0;
      let gy = 0;
      if (x > 0 && x < w - 1 && y > 0 && y < h - 1) {
        const a = lum[i - w - 1];
        const b = lum[i - w];
        const c = lum[i - w + 1];
        const d = lum[i - 1];
        const f = lum[i + 1];
        const g = lum[i + w - 1];
        const hh = lum[i + w];
        const k = lum[i + w + 1];
        gx = c + 2 * f + k - a - 2 * d - g;
        gy = g + 2 * hh + k - a - 2 * b - c;
      }
      const edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 260);
      const shadeF = 0.86 + 0.14 * l; // sombreado muy suave
      const e = Math.pow(edge, 0.8) * 0.85;
      for (let ch = 0; ch < 3; ch++) {
        const base = PAPER[ch] * shadeF;
        out[i * 4 + ch] = base * (1 - e) + GRAPHITE[ch] * e;
      }
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Texturas de marco, papel y pincel
// ---------------------------------------------------------------------------------------

export function frameKey(scene: Phaser.Scene, w: number, h: number): string {
  const fw = Math.max(10, Math.round(Math.min(w, h) * 0.05));
  return canvasTexture(scene, `mframe-${w}x${h}`, w + fw * 2 + 14, h + fw * 2 + 18, (ctx) => {
    ctx.fillStyle = 'rgba(40,25,10,0.35)';
    roundRectPath(ctx, 10, 14, w + fw * 2, h + fw * 2, 8);
    ctx.fill();
    const g = ctx.createLinearGradient(4, 4, w + fw * 2, h + fw * 2);
    g.addColorStop(0, '#F2C46A');
    g.addColorStop(0.5, UI.colors.accent);
    g.addColorStop(1, UI.colors.accentDark);
    ctx.fillStyle = g;
    roundRectPath(ctx, 4, 4, w + fw * 2, h + fw * 2, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(80,50,10,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4 + fw - 3, 4 + fw - 3, w + 6, h + 6);
    ctx.strokeStyle = 'rgba(255,240,200,0.5)';
    roundRectPath(ctx, 7, 7, w + fw * 2 - 6, h + fw * 2 - 6, 6);
    ctx.stroke();
  });
}

function paperKey(scene: Phaser.Scene, w: number, h: number): string {
  return canvasTexture(scene, `mpaper-${w}x${h}`, w, h, (ctx) => {
    ctx.fillStyle = `rgb(${PAPER.join(',')})`;
    ctx.fillRect(0, 0, w, h);
  });
}

function brushKey(scene: Phaser.Scene): string {
  return canvasTexture(scene, 'mbrush', 40, 150, (ctx) => {
    ctx.fillStyle = '#7A4A26';
    roundRectPath(ctx, 14, 0, 12, 92, 6);
    ctx.fill();
    ctx.fillStyle = '#C9CED6';
    ctx.fillRect(12, 88, 16, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(14, 90, 4, 16);
    ctx.fillStyle = '#3A2A1E';
    ctx.beginPath();
    ctx.moveTo(12, 108);
    ctx.quadraticCurveTo(20, 150, 28, 108);
    ctx.closePath();
    ctx.fill();
  });
}
