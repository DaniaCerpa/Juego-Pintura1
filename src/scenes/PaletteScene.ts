import Phaser from 'phaser';
import { getLevelDef } from '../core/levels';
import { mixesConfig } from '../core/mixes';
import { getPigment } from '../core/pigments';
import { services } from '../services';
import { Button } from '../ui/Button';
import { t } from '../ui/i18n';
import { COLORS, drawBackdrop, hexToNum, shade, textStyle, UI, W } from '../ui/theme';
import { fadeIn, goTo } from '../ui/transitions';

export interface PaletteData {
  from: string;
  level?: number;
}

/**
 * Paleta de mezclas (§7.2): rueda de color con las 8 recetas; las descubiertas se iluminan
 * con su animación, fecha y usos; las demás en gris con "?".
 */
export class PaletteScene extends Phaser.Scene {
  private params!: PaletteData;
  private detail!: Phaser.GameObjects.Text;

  constructor() {
    super('Palette');
  }

  init(data: PaletteData): void {
    this.params = data ?? { from: 'Gallery' };
  }

  create(): void {
    const { state, audio } = services();
    drawBackdrop(this);
    this.add.text(W / 2, 150, t('palette.title'), textStyle(76, UI.colors.accent)).setOrigin(0.5);
    const recipes = mixesConfig.recipes;
    // Pigmentos que el jugador ya vio en niveles jugados (para sugerir mezclas).
    const seen = new Set<string>();
    for (let l = 1; l < state.currentLevel; l++) {
      for (const p of getLevelDef(l)?.jars.flat() ?? []) seen.add(p);
    }
    const discovered = state.data.mixes.length;
    this.add
      .text(
        W / 2,
        230,
        t('palette.discovered', { n: discovered, total: recipes.length }),
        textStyle(34, UI.colors.textDim, '600'),
      )
      .setOrigin(0.5);

    const cx = W / 2;
    const cy = 760;
    const radius = 330;
    // Anillo de fondo
    const ring = this.add.graphics();
    ring.lineStyle(70, COLORS.panel, 0.7);
    ring.strokeCircle(cx, cy, radius);
    ring.lineStyle(3, COLORS.accent, 0.3);
    ring.strokeCircle(cx, cy, radius + 40);
    ring.strokeCircle(cx, cy, radius - 40);

    this.detail = this.add
      .text(cx, cy, '', textStyle(30, UI.colors.text, '600'))
      .setOrigin(0.5)
      .setWordWrapWidth(360);

    recipes.forEach((r, i) => {
      const angle = -Math.PI / 2 + (i / recipes.length) * Math.PI * 2;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      const known = state.data.mixes.includes(r.id);
      const node = this.add.container(x, y);
      const g = this.add.graphics();
      if (known) {
        const [a, b] = r.reagents.map((p) => hexToNum(getPigment(p).hex));
        const p = hexToNum(getPigment(r.product).hex);
        g.fillStyle(0x000000, 0.35);
        g.fillCircle(4, 6, 74);
        g.fillStyle(a, 1);
        g.slice(0, 0, 74, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
        g.fillPath();
        g.fillStyle(b, 1);
        g.slice(0, 0, 74, Phaser.Math.DegToRad(340), Phaser.Math.DegToRad(200), false);
        g.fillPath();
        g.fillStyle(p, 1);
        g.fillCircle(0, 0, 46);
        g.lineStyle(4, 0xffffff, 0.5);
        g.strokeCircle(0, 0, 74);
        node.add(g);
        this.tweens.add({
          targets: node,
          scale: { from: 1, to: 1.06 },
          duration: 1200 + i * 90,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      } else {
        g.fillStyle(shade(COLORS.panel, 0.12), 1);
        g.fillCircle(0, 0, 70);
        g.lineStyle(3, COLORS.textDim, 0.4);
        g.strokeCircle(0, 0, 70);
        // Pista (B8): si el jugador ya usó ambos colores padres, se muestran como dos círculos.
        if (r.reagents.every((p) => seen.has(p))) {
          r.reagents.forEach((p, k) => {
            const px = (k === 0 ? -1 : 1) * 30;
            g.fillStyle(0x000000, 0.35);
            g.fillCircle(px + 2, 44, 17);
            g.fillStyle(hexToNum(getPigment(p).hex), 1);
            g.fillCircle(px, 42, 16);
          });
          g.fillStyle(COLORS.textDim, 0.8);
          g.fillRect(-6, 40, 12, 4);
          g.fillRect(-2, 36, 4, 12);
        }
        node.add(g);
        node.add(
          this.add
            .text(0, -12, t('palette.unknown'), textStyle(60, UI.colors.textDim))
            .setOrigin(0.5),
        );
      }
      node.setSize(150, 150).setInteractive();
      node.on('pointerdown', () => {
        audio.play('tap');
        this.showDetail(r.id, known);
      });
    });

    const back = new Button(this, W / 2, 1620, t('common.back'), {
      width: 520,
      height: 140,
      fontSize: 48,
    });
    back.onPress = () => {
      if (this.params.from === 'Level' && this.params.level)
        goTo(this, 'Level', { level: this.params.level });
      else goTo(this, 'Gallery');
    };
    if (state.hasSeenTip('palette-complete')) {
      this.add
        .text(
          W / 2,
          1380,
          t('palette.complete', { n: mixesConfig.completePaletteReward }),
          textStyle(30, UI.colors.accent, '600'),
        )
        .setOrigin(0.5)
        .setWordWrapWidth(800);
    }
    fadeIn(this);
  }

  private showDetail(id: string, known: boolean): void {
    const { state } = services();
    const r = mixesConfig.recipes.find((x) => x.id === id)!;
    const name = (p: string) => t(`pigment.${p}`);
    if (!known) {
      this.detail.setText(`${t('palette.unknown')}\n${t('palette.unlock', { n: r.unlockLevel })}`);
      return;
    }
    const s = state.data.mixStats[id];
    this.detail.setText(
      `${t('palette.recipe', { a: name(r.reagents[0]), b: name(r.reagents[1]), p: name(r.product) })}\n${t('palette.uses', { n: s?.uses ?? 0, date: s?.first ?? '' })}`,
    );
  }
}
