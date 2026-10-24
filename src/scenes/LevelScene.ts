import Phaser from 'phaser';
import economyData from '../data/economy.json';
import { getLevelDef } from '../core/levels';
import { getPigment } from '../core/pigments';
import { addExtraJar, createState, isJarResolved, isSolved, tryPour } from '../core/rules';
import { solve } from '../core/solver';
import type { LevelDef, LevelState, PigmentId, PourResult } from '../core/types';
import { Fx } from '../objects/Fx';
import { Jar } from '../objects/Jar';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { showToast } from '../ui/Toast';
import { COLORS, drawBackdrop, H, hexToNum, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';

export interface LevelSceneData {
  level: number;
}

const HUD_BOTTOM = 290;
const BAR_TOP = 1640;

/**
 * Escena de nivel (§9.1.3, §14.4). El modelo (`LevelState`) es la verdad; las animaciones
 * son visuales y siempre interrumpibles: cualquier toque las termina y se procesa.
 */
export class LevelScene extends Phaser.Scene {
  private def!: LevelDef;
  private state!: LevelState;
  private history: LevelState[] = [];
  private jars: Jar[] = [];
  private selected: number | null = null;
  private extraJarUsed = false;
  private lastTapAt = 0;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private stream!: Phaser.GameObjects.Graphics;
  private fx!: Fx;
  private movesText!: Phaser.GameObjects.Text;
  private undoBtn!: Button;
  private extraBtn!: Button;
  private restartBtn!: Button;
  private boardLayer!: Phaser.GameObjects.Container;
  private hintTweens: Phaser.Tweens.Tween[] = [];
  private hintSolution: { from: number; to: number } | null = null;
  private startedAt = 0;
  private undoUsed = false;
  private finished = false;

  constructor() {
    super('Level');
  }

  init(data: LevelSceneData): void {
    const def = getLevelDef(data.level);
    if (!def) throw new Error(`Nivel ${data.level} no existe`);
    this.def = def;
    this.state = createState(def);
    this.history = [];
    this.jars = [];
    this.selected = null;
    this.extraJarUsed = false;
    this.activeTweens = [];
    this.hintTweens = [];
    this.hintSolution = null;
    this.undoUsed = false;
    this.finished = false;
    this.startedAt = Date.now();
  }

  create(): void {
    const { audio, analytics } = services();
    drawBackdrop(this);
    this.boardLayer = this.add.container(0, 0);
    this.stream = this.add.graphics().setDepth(40);
    this.fx = new Fx(this);
    this.buildHud();
    this.buildBar();
    this.buildBoard();
    audio.resetScale();
    analytics.log('level_start', { level: this.def.id, difficulty: this.def.difficulty });

    // El toque se resuelve contra la posición base de cada frasco (su "ranura"), no contra
    // el sprite: así un toque durante una animación nunca se pierde (§9.3).
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
      const i = this.jarAt(pointer.worldX, pointer.worldY);
      if (i !== null) this.onJarTap(i);
    });
    if (this.def.id === 1) this.setupOnboardingHints();
    this.events.once('shutdown', () => this.fx.clear());
    fadeIn(this);
  }

  // ---------- HUD ----------
  private buildHud(): void {
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.panel, 0.55);
    panel.fillRoundedRect(40, 60, W - 80, 170, 36);
    panel.lineStyle(2, COLORS.accent, 0.25);
    panel.strokeRoundedRect(40, 60, W - 80, 170, 36);

    const pause = new Button(this, 130, 145, '❚❚', {
      width: 120,
      height: 110,
      fontSize: 40,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
      radius: 26,
    });
    pause.onPress = () => this.openPause();

    this.add.text(W / 2, 112, t('level.title', { n: this.def.id }), textStyle(52)).setOrigin(0.5);
    this.movesText = this.add
      .text(W / 2, 178, '', textStyle(36, UI.colors.textDim, '600'))
      .setOrigin(0.5);
    this.updateMoves();
  }

  private updateMoves(): void {
    const moves = this.state.moveCount;
    const overPar = moves > this.def.par;
    this.movesText.setText(
      `${t('level.moves')}: ${moves}   ·   ${t('level.par', { n: this.def.par })}`,
    );
    this.movesText.setColor(overPar ? UI.colors.textDim : UI.colors.text);
  }

  private buildBar(): void {
    const y = 1780;
    const opts = {
      width: 320,
      height: 130,
      fontSize: 30,
      color: COLORS.backgroundLight,
      textColor: UI.colors.text,
      radius: 30,
    };
    this.undoBtn = new Button(this, 190, y, t('level.undo'), { ...opts, icon: '↶' });
    this.extraBtn = new Button(this, W / 2, y, t('level.extraJar'), { ...opts, icon: '＋' });
    this.restartBtn = new Button(this, W - 190, y, t('level.restart'), { ...opts, icon: '⟲' });
    this.undoBtn.onPress = () => this.undo();
    this.extraBtn.onPress = () => this.useExtraJar();
    this.restartBtn.onPress = () => this.restart();
    this.refreshBar();
  }

  private refreshBar(): void {
    this.undoBtn.setEnabledState(this.history.length > 0);
    this.extraBtn.setEnabledState(!this.extraJarUsed);
    this.restartBtn.setEnabledState(this.history.length > 0 || this.extraJarUsed);
    this.maybeTip('undo', this.history.length > 0, t('level.tooltip.undo'));
  }

  private maybeTip(id: string, available: boolean, text: string): void {
    const { state } = services();
    if (!available || state.hasSeenTip(id)) return;
    state.markTipSeen(id);
    showToast(this, text);
  }

  // ---------- Tablero ----------
  private layoutFor(count: number): { width: number; positions: { x: number; y: number }[] } {
    const { maxPerRow, marginPx, rowGapPx, maxJarWidthPx, jarAspect } = UI.board;
    const rows = count <= maxPerRow ? 1 : count <= maxPerRow * 2 ? 2 : Math.ceil(count / maxPerRow);
    const perRow = Math.ceil(count / rows);
    const gap = 28;
    const availW = W - marginPx * 2 - gap * (perRow - 1);
    const availH = BAR_TOP - HUD_BOTTOM - marginPx * 2 - rowGapPx * (rows - 1);
    const width = Math.min(maxJarWidthPx, availW / perRow, availH / rows / jarAspect);
    const height = width * jarAspect;
    const totalH = rows * height + (rows - 1) * rowGapPx;
    const top = HUD_BOTTOM + (BAR_TOP - HUD_BOTTOM - totalH) / 2;
    const positions: { x: number; y: number }[] = [];
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, count - r * perRow);
      const rowW = inRow * width + (inRow - 1) * gap;
      const left = (W - rowW) / 2;
      for (let c = 0; c < inRow; c++) {
        positions.push({
          x: left + width / 2 + c * (width + gap),
          y: top + height / 2 + r * (height + rowGapPx),
        });
      }
    }
    return { width, positions };
  }

  private buildBoard(): void {
    for (const j of this.jars) j.destroy();
    this.jars = [];
    const { width, positions } = this.layoutFor(this.state.jars.length);
    const symbols = services().state.settings.accessibility;
    this.state.jars.forEach((layers, i) => {
      const jar = new Jar(this, i, positions[i].x, positions[i].y, width, this.state.capacity);
      jar.setLayers(layers);
      jar.setSymbolsVisible(symbols);
      this.boardLayer.add(jar);
      this.jars.push(jar);
    });
  }

  /** Índice del frasco cuya ranura (área táctil en posición base) contiene el punto. */
  private jarAt(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const jar of this.jars) {
      const hw = Math.max(jar.jarWidth + 36, UI.board.minTouchPx) / 2;
      const hh = Math.max(jar.jarHeight + 40, UI.board.minTouchPx) / 2;
      if (Math.abs(x - jar.baseX) <= hw && Math.abs(y - jar.baseY) <= hh) {
        const d = Math.abs(x - jar.baseX);
        if (d < bestD) {
          bestD = d;
          best = jar.index;
        }
      }
    }
    return best;
  }

  /** Sincroniza los frascos con el modelo y resetea transformaciones. */
  private syncVisuals(): void {
    this.state.jars.forEach((layers, i) => {
      const jar = this.jars[i];
      if (!jar) return;
      jar.resetTransform();
      jar.setLayers(layers);
    });
    if (this.selected !== null) this.jars[this.selected]?.setLifted(true, 0);
    this.stream.clear();
    this.updateMoves();
  }

  // ---------- Input (§14.4) ----------
  private onJarTap(i: number): void {
    if (this.finished) return;
    const now = performance.now(); // reloj de pared: el tiempo de frame miente si hay un tirón
    if (now - this.lastTapAt < UI.anim.debounceMs) return;
    this.lastTapAt = now;
    const { audio } = services();
    audio.unlock();
    this.finishAnimations();

    if (this.selected === null) {
      if (this.state.jars[i].length === 0) {
        audio.play('error');
        this.track(this.jars[i].bounce(UI.anim.bounceMs));
        return;
      }
      this.select(i);
      return;
    }
    if (this.selected === i) {
      this.deselect();
      audio.play('tap');
      return;
    }
    const from = this.selected;
    const r = tryPour(this.state, from, i, this.def.rules);
    if (!r.ok) {
      this.selected = null;
      audio.play('error');
      this.track(this.jars[from].bounce(UI.anim.bounceMs));
      this.clearHints();
      return;
    }
    this.commitPour(from, i, r);
  }

  private select(i: number): void {
    this.selected = i;
    this.jars[i].setLifted(true, UI.anim.selectMs);
    services().audio.play('select');
    this.updateHints();
  }

  private deselect(): void {
    if (this.selected === null) return;
    this.jars[this.selected].setLifted(false, UI.anim.selectMs);
    this.selected = null;
    this.updateHints();
  }

  private pushHistory(): void {
    this.history.push(this.state);
    const max = economyData.helpers.undoHistoryMax;
    if (this.history.length > max) this.history.splice(0, this.history.length - max);
  }

  private commitPour(from: number, to: number, r: PourResult): void {
    this.pushHistory();
    this.state = r.next;
    this.selected = null;
    this.clearHints();
    this.updateMoves();
    this.refreshBar();
    this.animatePour(from, to, r);

    const targetResolved = isJarResolved(this.state.jars[to], this.state.capacity);
    const solved = isSolved(this.state);
    const { audio, haptics } = services();
    if (targetResolved) {
      this.time.delayedCall(UI.anim.pourMs * 0.8, () => {
        if (!isJarResolved(this.state.jars[to] ?? [], this.state.capacity)) return;
        audio.play('complete');
        haptics.vibrate('complete');
        const jar = this.jars[to];
        this.track(jar.celebrate(UI.anim.completeMs));
        this.fx.sparkle(jar.x, jar.y - jar.jarHeight / 2, r.pigment);
      });
    }
    if (solved) {
      this.finished = true;
      this.time.delayedCall(UI.anim.pourMs + UI.anim.completeMs + 150, () => this.win());
    }
  }

  // ---------- Animación de vertido ----------
  private track(tw: Phaser.Tweens.Tween): void {
    this.activeTweens.push(tw);
    tw.once('complete', () => {
      const idx = this.activeTweens.indexOf(tw);
      if (idx >= 0) this.activeTweens.splice(idx, 1);
    });
  }

  /** Termina al instante toda animación en curso y deja los frascos como dice el modelo. */
  private finishAnimations(): void {
    if (this.activeTweens.length === 0) return;
    for (const tw of this.activeTweens) tw.stop();
    this.activeTweens = [];
    this.syncVisuals();
  }

  private animatePour(from: number, to: number, r: PourResult): void {
    const src = this.jars[from];
    const dst = this.jars[to];
    const color = hexToNum(getPigment(r.pigment).hex);
    const total = UI.anim.pourMs;
    const travel = Math.round(total * 0.32);
    const pouring = Math.round(total * 0.48);
    const back = total - travel - pouring;
    const side = src.baseX <= dst.baseX ? -1 : 1;
    const targetX = dst.baseX + side * dst.jarWidth * 0.78;
    const targetY = dst.baseY - dst.jarHeight * 0.72;
    const tilt = side === -1 ? Phaser.Math.DegToRad(62) : Phaser.Math.DegToRad(-62);
    src.setDepth(10);

    const streamStart = { x: 0, y: 0 };
    const drawStream = (progress: number) => {
      const m = src.mouthPoint();
      const cos = Math.cos(src.rotation);
      const sin = Math.sin(src.rotation);
      // Punto de la boca en coordenadas del mundo (el frasco gira sobre su centro).
      const lip = { x: m.x - side * src.jarWidth * 0.45, y: m.y };
      const wx = src.x + lip.x * cos - lip.y * sin;
      const wy = src.y + lip.x * sin + lip.y * cos;
      streamStart.x = wx;
      streamStart.y = wy;
      const endY = dst.y + dst.surfaceY();
      const g = this.stream;
      g.clear();
      const width = Math.max(6, dst.jarWidth * 0.13) * Math.sin(Math.min(1, progress) * Math.PI);
      if (width < 1) return;
      g.lineStyle(width, color, 1);
      g.beginPath();
      g.moveTo(wx, wy);
      g.lineTo(dst.x, endY);
      g.strokePath();
      g.fillStyle(color, 1);
      g.fillCircle(wx, wy, width * 0.5);
      g.fillEllipse(dst.x, endY, width * 2.2, width * 0.9);
    };

    const tw1 = this.tweens.add({
      targets: src,
      x: targetX,
      y: targetY,
      rotation: tilt,
      duration: travel,
      ease: 'Quad.Out',
      onComplete: () => {
        services().audio.play('pour');
        const proxy = { p: 0 };
        const tw2 = this.tweens.add({
          targets: proxy,
          p: 1,
          duration: pouring,
          onUpdate: () => drawStream(proxy.p),
          onComplete: () => {
            this.stream.clear();
            const tw3 = this.tweens.add({
              targets: src,
              x: src.baseX,
              y: src.baseY,
              rotation: 0,
              duration: back,
              ease: 'Quad.In',
              onComplete: () => src.setDepth(0),
            });
            this.track(tw3);
          },
        });
        this.track(tw2);
        this.track(dst.animateAdd(r.pigment, r.layers, pouring));
        this.track(src.animateRemove(r.layers, pouring));
        this.time.delayedCall(pouring * 0.35, () => {
          if (this.activeTweens.includes(tw2)) {
            this.fx.pourSplash(dst.x, dst.y + dst.surfaceY(), r.pigment);
          }
        });
      },
    });
    this.track(tw1);
  }

  // ---------- Ayudas (§3.5) ----------
  private undo(): void {
    if (this.finished) return;
    const prev = this.history.pop();
    if (!prev) return;
    this.finishAnimations();
    this.selected = null;
    this.state = prev;
    this.undoUsed = true;
    this.syncVisuals();
    this.refreshBar();
    services().audio.play('tap');
    services().analytics.log('booster_used', { type: 'undo', paid_with: 'free' });
  }

  private restart(): void {
    if (this.finished) return;
    this.finishAnimations();
    this.selected = null;
    this.state = createState(this.def);
    this.history = [];
    this.extraJarUsed = false;
    this.buildBoard();
    this.syncVisuals();
    this.refreshBar();
    services().audio.resetScale();
    services().audio.play('tap');
    if (this.def.id === 1) this.setupOnboardingHints();
  }

  private useExtraJar(): void {
    if (this.finished || this.extraJarUsed) return;
    if (this.state.jars.length - this.def.jars.length >= economyData.helpers.extraJarsPerLevel)
      return;
    this.finishAnimations();
    this.pushHistory();
    this.state = addExtraJar(this.state);
    this.extraJarUsed = true;
    this.selected = null;
    this.buildBoard();
    this.syncVisuals();
    this.refreshBar();
    services().audio.play('select');
    services().analytics.log('booster_used', { type: 'extra_jar', paid_with: 'free' });
    this.maybeTip('extraJar', true, t('level.tooltip.extraJar'));
  }

  private openPause(): void {
    if (this.finished) return;
    this.finishAnimations();
    this.deselect();
    this.scene.launch('Pause', { from: 'Level', level: this.def.id });
    this.scene.pause();
  }

  // ---------- Onboarding (§8): solo nivel 1 ----------
  private setupOnboardingHints(): void {
    const r = solve(this.def, { withSolution: true });
    this.hintSolution = r.solution?.[0] ?? null;
    this.updateHints();
  }

  private updateHints(): void {
    this.clearHints();
    if (!this.hintSolution || this.def.id !== 1 || this.state.moveCount > 0) return;
    const target = this.selected === null ? this.hintSolution.from : this.hintSolution.to;
    if (this.selected !== null && this.selected !== this.hintSolution.from) return;
    const jar = this.jars[target];
    if (!jar) return;
    this.hintTweens.push(
      this.tweens.add({
        targets: jar,
        scale: { from: 1, to: 1.06 },
        duration: UI.anim.hintPulseMs / 2,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      }),
    );
  }

  private clearHints(): void {
    for (const tw of this.hintTweens) tw.stop();
    this.hintTweens = [];
    for (const j of this.jars) j.setScale(1);
  }

  // ---------- Victoria ----------
  private win(): void {
    const { state, analytics } = services();
    const moves = this.state.moveCount;
    const result = state.completeLevel(this.def.id, moves, this.def.par);
    analytics.log('level_win', {
      level: this.def.id,
      moves,
      par: this.def.par,
      stars: 0,
      undo_used: this.undoUsed,
      extra_jar_used: this.extraJarUsed,
      duration_s: Math.round((Date.now() - this.startedAt) / 1000),
    });
    const pigments: PigmentId[] = [...new Set(this.def.jars.flat())];
    goTo(this, 'Victory', {
      level: this.def.id,
      moves,
      par: this.def.par,
      firstClear: result.firstClear,
      pigments,
    });
  }

  /** Sale a la galería registrando el abandono. */
  quitToGallery(): void {
    services().analytics.log('level_quit', { level: this.def.id, moves: this.state.moveCount });
    goTo(this, 'Gallery');
  }
}

export const LEVEL_SCENE_HEIGHT = H;
