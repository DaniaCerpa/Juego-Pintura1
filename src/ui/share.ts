import type Phaser from 'phaser';
import type { PaintingSpec } from '../core/painting';
import { services } from '../services';
import { t } from './i18n';
import { showToast } from './Toast';
import { renderShareImage, shareBlob } from './sharePainting';

/** Genera y comparte la imagen de un cuadro; registra `share_painting{painting_id, method}`. */
export async function sharePaintingFromScene(
  scene: Phaser.Scene,
  spec: PaintingSpec,
): Promise<void> {
  const { analytics, audio } = services();
  try {
    const blob = await renderShareImage(spec);
    const method = await shareBlob(blob, `pigmento-${spec.id + 1}.png`, t(spec.titleKey));
    analytics.log('share_painting', { painting_id: spec.id, method });
    if (method === 'download') showToast(scene, t('share.saved'));
    else if (method === 'share') showToast(scene, t('share.done'));
    audio.play('tap');
  } catch {
    analytics.log('share_painting', { painting_id: spec.id, method: 'failed' });
    showToast(scene, t('share.error'));
  }
}
