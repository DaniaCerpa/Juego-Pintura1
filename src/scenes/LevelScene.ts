import Phaser from 'phaser';
import { economyConfig } from '../core/economy';
import { getLevelDef } from '../core/levels';
import { getPigment } from '../core/pigments';
import {
  addExtraJar,
  createState,
  dilute,
  isJarResolved,
  isSolved,
  mixTableFor,
  pourOutcome,
  topOf,
  topRun,
  tryPour,
} from '../core/rules';
import { solve } from '../core/solver';
import type { LevelDef, LevelState, PigmentId, PourResult } from '../core/types';
import { Fx } from '../objects/Fx';
import { Jar } from '../objects/Jar';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { showToast } from '../ui/Toast';
import { COLORS, drawBackdrop, hexToNum, shade, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';
import type { VictoryData } from './VictoryScene';

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
  private undosLeft = 0;
  private lastTapAt = 0;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private stream!: Phaser.GameObjects.Graphics;
  private fx!: Fx;
  private movesText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private undoBtn!: Button;
  private extraBtn!: Button;
  private restartBtn!: Button;
  private boardLayer!: Phaser.GameObjects.Container;
  private hintTweens: Phaser.Tweens.Tween[] = [];
  private hintSolution: { from: number; to: number } | null = null;
  private mixHintTimer: Phaser.Time.TimerEvent | null = null;
  private startedAt = 0;
  private undoUsed = false;
  private extraJarAny = false;
  private finished = false;
  private defeated = false;

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
    this.extraJarAny = false;
    this.undosLeft = economyConfig.helpers.undoFreePerLevel;
    this.activeTweens = [];
    this.hintTweens = [];
    this.hintSolution = null;
    this.mixHintTimer = null;
    this.undoUsed = false;
    this.finished = false;
    this.defeated = false;
    this.startedAt = Date.now();
  }

  create(): void {
    const { audio, analytics, ads } = services();
    drawBackdrop(this);
    this.boardLayer = this.add.container(0, 0);
    this.stream = this.add.graphics().setDepth(40);
    this.fx = new Fx(this);
    this.buildHud();
    this.buildBar();
    this.buildBoard();
    audio.resetScale();
    ads.onLevelStart(this.def.id);
    analytics.log('level_start', { level: this.def.id, difficulty: this.def.difficulty });

    // El toque se resuelve contra la posición base de cada frasco (su "ranura"), no contra
    // el sprite: así un toque durante una animación nunca se pierde (§9.3).
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      audio.unlock();
      const i = this.jarAt(pointer.worldX, pointer.worldY);
      if (i !== null) this.onJarTap(i);
    });
    if (this.def.id === 1) this.setupOnboardingHints();
    this.armMixHint();
    this.events.once('shutdown', () => {
      this.fx.clear();
      this.mixHintTimer?.remove();
    });
    fadeIn(this);
  }

  // ---------- HUD ----------
  private buildHud(): void {
    const { state } = services();
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

    // Monedas (derecha)
    const coin = this.add.graphics();
    coin.fillStyle(COLORS.accent, 1);
    coin.fillCircle(W - 215, 145, 22);
    coin.fillStyle(shade(COLORS.accent, -0.3), 1);
    coin.fillCircle(W - 215, 145, 13);
    this.coinsText = this.add
      .text(W - 180, 145, String(state.coins), textStyle(36, UI.colors.text))
      .setOrigin(0, 0.5);
    const off = state.on('coins', () => this.coinsText.setText(String(state.coins)));
    this.events.once('shutdown', off);
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
    this.undoBtn.setText(t('level.undoLeft', { n: this.undosLeft }));
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
    this.refreshFuses();
  }

  /** Mechas de secado (§6) según el modelo. */
  private refreshFuses(): void {
    this.jars.forEach((jar, i) => {
      const remaining = this.state.drying[i];
      const rule = this.def.rules.drying.find((d) => d.jar === i);
      jar.setFuse(remaining !== undefined ? remaining : null, rule ? rule.fuse : null);
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
    this.refreshFuses();
    this.updateMoves();
  }

  // ---------- Input (§14.4) ----------
  private onJarTap(i: number): void {
    if (this.finished || this.defeated) return;
    const now = performance.now(); // reloj de pared: el tiempo de frame miente si hay un tirón
    if (now - this.lastTapAt < UI.anim.debounceMs) return;
    this.lastTapAt = now;
    const { audio } = services();
    audio.unlock();
    this.finishAnimations();
    this.armMixHint();

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
    const max = economyConfig.helpers.undoHistoryMax;
    if (this.history.length > max) this.history.splice(0, this.history.length - max);
  }

  private commitPour(from: number, to: number, r: PourResult): void {
    this.pushHistory();
    this.state = r.next;
    this.selected = null;
    this.clearHints();
    this.updateMoves();
    this.refreshBar();
    if (r.kind === 'mix') this.animateMix(from, to, r);
    else this.animatePour(from, to, r);

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
        this.fx.sparkle(jar.x, jar.y - jar.jarHeight / 2, r.product ?? r.pigment);
      });
    }
    const animMs = r.kind === 'mix' ? UI.anim.mixMs : UI.anim.pourMs;
    this.time.delayedCall(animMs, () => this.refreshFuses());
    if (solved) {
      this.finished = true;
      this.time.delayedCall(animMs + UI.anim.completeMs + 150, () => this.win());
    } else if (r.dried.length > 0) {
      this.defeated = true;
      this.time.delayedCall(animMs + 200, () => this.defeat());
    }
  }

  // ---------- Animaciones ----------
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

  /** Lleva el origen sobre el destino, inclinado; `onArrive` recibe la duración del vertido. */
  private travelAndPour(
    src: Jar,
    dst: Jar,
    totalMs: number,
    pigment: PigmentId,
    onArrive: (pouringMs: number) => void,
  ): void {
    const color = hexToNum(getPigment(pigment).hex);
    const travel = Math.round(totalMs * 0.32);
    const pouring = Math.round(totalMs * 0.48);
    const back = totalMs - travel - pouring;
    const side = src.baseX <= dst.baseX ? -1 : 1;
    const targetX = dst.baseX + side * dst.jarWidth * 0.78;
    const targetY = dst.baseY - dst.jarHeight * 0.72;
    const tilt = side === -1 ? Phaser.Math.DegToRad(62) : Phaser.Math.DegToRad(-62);
    src.setDepth(10);

    const drawStream = (progress: number) => {
      const m = src.mouthPoint();
      const cos = Math.cos(src.rotation);
      const sin = Math.sin(src.rotation);
      // Punto de la boca en coordenadas del mundo (el frasco gira sobre su centro).
      const lip = { x: m.x - side * src.jarWidth * 0.45, y: m.y };
      const wx = src.x + lip.x * cos - lip.y * sin;
      const wy = src.y + lip.x * sin + lip.y * cos;
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
        onArrive(pouring);
        this.time.delayedCall(pouring * 0.35, () => {
          if (this.activeTweens.includes(tw2)) {
            this.fx.pourSplash(dst.x, dst.y + dst.surfaceY(), pigment);
          }
        });
      },
    });
    this.track(tw1);
  }

  private animatePour(from: number, to: number, r: PourResult): void {
    const src = this.jars[from];
    const dst = this.jars[to];
    this.travelAndPour(src, dst, UI.anim.pourMs, r.pigment, (pouring) => {
      this.track(dst.animateAdd(r.pigment, r.layers, pouring));
      this.track(src.animateRemove(r.layers, pouring));
    });
  }

  /** Mezcla (§5.4): vertido + remolino de partículas, flash del producto, swirl y shake. */
  private animateMix(from: number, to: number, r: PourResult): void {
    const src = this.jars[from];
    const dst = this.jars[to];
    const product = r.product!;
    const reagentB = topOf(this.history[this.history.length - 1].jars[to])!;
    this.travelAndPour(src, dst, UI.anim.mixMs, r.pigment, (pouring) => {
      this.track(src.animateRemove(1, pouring * 0.6));
      this.time.delayedCall(pouring * 0.5, () => {
        if (!this.activeTweens.length) return; // ya se sincronizó por un toque
        const { audio, haptics } = services();
        audio.play('swirl');
        haptics.vibrate('mix');
        const sx = dst.x;
        const sy = dst.y + dst.surfaceY() - 10;
        this.fx.swirl(sx, sy, r.pigment, reagentB, product);
        // El producto aparece: 1 capa de B sale y 2 de P entran.
        dst.replaceTop(1, product, 2);
        dst.setLayers(dst.getLayers()); // normaliza alturas
        const flash = this.add
          .image(dst.x, dst.y, `jar-glass-${dst.jarWidth}`)
          .setTintFill(hexToNum(getPigment(product).hex))
          .setAlpha(0.7)
          .setDepth(45);
        this.track(
          this.tweens.add({
            targets: flash,
            alpha: 0,
            duration: UI.anim.mixMs * 0.5,
            onComplete: () => flash.destroy(),
          }),
        );
        this.track(
          this.tweens.add({
            targets: this.boardLayer,
            x: { from: -4, to: 0 },
            duration: 120,
            ease: 'Sine.InOut',
            yoyo: true,
            repeat: 1,
          }),
        );
        this.onMixUsed(r.recipeId!, r.pigment, reagentB, product);
      });
    });
  }

  private onMixUsed(recipeId: string, a: PigmentId, b: PigmentId, p: PigmentId): void {
    const { state, analytics } = services();
    const d = state.useMix(recipeId);
    if (!d.isNew) return;
    analytics.log('mix_discovered', { recipe: recipeId });
    const name = (x: PigmentId) => t(`pigment.${x}`);
    showToast(
      this,
      t('level.mixDiscovered', { a: name(a), b: name(b), p: name(p), coins: d.coins }),
      1540,
      3200,
    );
  }

  // ---------- Ayudas (§3.5, F1: costos) ----------
  private undo(): void {
    if (this.finished || this.defeated) return;
    if (this.history.length === 0) return;
    if (this.undosLeft <= 0) {
      this.offer('rw_undo_pack', t('offer.undoPack'), economyConfig.costs.undoPack, (paid) => {
        if (!paid) return;
        this.undosLeft += economyConfig.helpers.undoRewardedPack;
        services().analytics.log('booster_used', { type: 'undo_pack', paid_with: paid });
        this.refreshBar();
        this.undo();
      });
      return;
    }
    const prev = this.history.pop();
    if (!prev) return;
    this.finishAnimations();
    this.selected = null;
    this.state = prev;
    this.undoUsed = true;
    this.undosLeft -= 1;
    this.syncVisuals();
    this.refreshBar();
    services().audio.play('tap');
    services().analytics.log('booster_used', { type: 'undo', paid_with: 'free' });
    if (this.undosLeft === 0) {
      this.maybeTip(
        'undoOut',
        true,
        t('level.tooltip.undoRewarded', { cost: economyConfig.costs.undoPack }),
      );
    }
  }

  /** Lienzo nuevo: vuelve al estado inicial (gratis). */
  restart(): void {
    if (this.finished) return;
    this.finishAnimations();
    this.defeated = false;
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
    this.armMixHint();
  }

  /** Diluir (§6): repone la mecha y continúa. */
  dilute(): void {
    this.finishAnimations();
    this.state = dilute(this.state, this.def.rules);
    this.defeated = false;
    this.syncVisuals();
    this.refreshBar();
    services().audio.play('select');
  }

  private useExtraJar(): void {
    if (this.finished || this.defeated || this.extraJarUsed) return;
    if (this.state.jars.length - this.def.jars.length >= economyConfig.helpers.extraJarsPerLevel)
      return;
    this.offer('rw_extra_jar', t('offer.extraJar'), economyConfig.costs.extraJar, (paid) => {
      if (!paid) return;
      this.finishAnimations();
      this.pushHistory();
      this.state = addExtraJar(this.state);
      this.extraJarUsed = true;
      this.extraJarAny = true;
      this.selected = null;
      this.buildBoard();
      this.syncVisuals();
      this.refreshBar();
      services().audio.play('select');
      services().analytics.log('booster_used', { type: 'extra_jar', paid_with: paid });
    });
  }

  /** Abre la elección de pago (anuncio o monedas) como overlay. */
  private offer(
    placement: string,
    title: string,
    coinCost: number,
    onResult: (paidWith: 'rewarded' | 'coins' | null) => void,
  ): void {
    this.finishAnimations();
    this.deselect();
    this.scene.launch('Offer', { from: 'Level', title, placement, coinCost, onResult });
    this.scene.pause();
  }

  private openPause(): void {
    if (this.finished) return;
    this.finishAnimations();
    this.deselect();
    this.scene.launch('Pause', { from: 'Level', level: this.def.id });
    this.scene.pause();
  }

  // ---------- Onboarding (§8) ----------
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
    this.pulse([target]);
  }

  private pulse(indices: number[]): void {
    for (const i of indices) {
      const jar = this.jars[i];
      if (!jar) continue;
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
  }

  private clearHints(): void {
    for (const tw of this.hintTweens) tw.stop();
    this.hintTweens = [];
    for (const j of this.jars) j.setScale(1);
  }

  /** Nivel 21: tras 8 s sin movimiento, brillan los dos frascos que pueden mezclarse. */
  private armMixHint(): void {
    this.mixHintTimer?.remove();
    this.mixHintTimer = null;
    if (this.def.id !== 21 || this.finished || this.defeated) return;
    this.mixHintTimer = this.time.delayedCall(UI.anim.hintAfterIdleMs, () => {
      const pair = this.findMixPair();
      if (!pair) return;
      this.clearHints();
      this.pulse(pair);
      showToast(this, t('level.hint.mix'));
    });
  }

  private findMixPair(): [number, number] | null {
    const table = mixTableFor(this.def.rules);
    const { jars, capacity } = this.state;
    for (let i = 0; i < jars.length; i++) {
      for (let j = 0; j < jars.length; j++) {
        if (i === j || jars[i].length === 0) continue;
        const o = pourOutcome(
          topOf(jars[i]),
          topRun(jars[i]),
          topOf(jars[j]),
          jars[j].length,
          capacity,
          table,
        );
        if (o?.kind === 'mix') return [i, j];
      }
    }
    return null;
  }

  // ---------- Fin de nivel ----------
  private async win(): Promise<void> {
    const { state, analytics, ads } = services();
    const moves = this.state.moveCount;
    const result = state.completeLevel(this.def.id, moves, this.def.par);
    analytics.log('level_win', {
      level: this.def.id,
      moves,
      par: this.def.par,
      stars: result.stars,
      undo_used: this.undoUsed,
      extra_jar_used: this.extraJarAny,
      duration_s: Math.round((Date.now() - this.startedAt) / 1000),
    });
    const pigments: PigmentId[] = [...new Set(this.def.jars.flat())];
    // El intersticial, si corresponde, va antes de la pantalla de victoria (§11.2).
    await ads.maybeShowInterstitial('level_win');
    const data: VictoryData = { result, pigments };
    goTo(this, 'Victory', data);
  }

  private defeat(): void {
    const { analytics } = services();
    analytics.log('level_fail', {
      level: this.def.id,
      moves: this.state.moveCount,
      reason: 'dried',
    });
    this.finishAnimations();
    this.scene.launch('Defeat', { from: 'Level', level: this.def.id });
    this.scene.pause();
  }

  /** Sale a la galería registrando el abandono. */
  quitToGallery(): void {
    services().analytics.log('level_quit', { level: this.def.id, moves: this.state.moveCount });
    goTo(this, 'Gallery');
  }
}
