import Phaser from 'phaser';
import { UI } from './Theme';
import { RoundedPanel } from './RoundedPanel';
import { Sfx } from '../systems/Sfx';
import { fetchTopStages, cloudEnabled, type RankRow } from '../data/cloud';

/**
 * 排行榜：单列，按关数降序、同关数按分数降序。
 *
 * 不显示「最高分」单独一列，也不显示表头 —— 关数和分数挤在一行里
 * 「第3关 · 12500分」一眼就够，表格头本身占一行高度、还没信息量。
 */
export function openBenchmarkPanel(scene: Phaser.Scene) {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setDepth(2200);

  root.add(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.78).setInteractive());

  const pw = Math.min(width - 28, 348);
  const ph = Math.min(height - 90, 520);
  const cx = width / 2, cy = height / 2;
  const panel = new RoundedPanel(scene, cx, cy, pw, ph, 0x0b1f14, 0.99, { radius: 16 })
    .setStrokeStyle(1.5, UI.greenStroke);
  root.add(panel);

  const top = cy - ph / 2;

  root.add(scene.add.text(cx, top + 28, '排 行 榜', {
    fontFamily: 'sans-serif', fontSize: '19px', color: '#63c256', fontStyle: 'bold',
  }).setOrigin(0.5));

  const listX = cx - pw / 2 + 16;
  const listW = pw - 32;
  const bodyTop = top + 62;
  const rowH = Math.min(32, (ph - 132) / 10);

  const renderList = (rows: RankRow[]) => {
    if (rows.length === 0) {
      root.add(scene.add.text(cx, bodyTop + rowH * 2, '暂无记录', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#5f7a6c',
      }).setOrigin(0.5));
      return;
    }
    rows.forEach((r, i) => {
      const y = bodyTop + i * rowH + rowH / 2;
      if (i < 3) {
        root.add(scene.add.rectangle(cx, y, listW, rowH - 3, UI.greenDark, 0.5));
      }
      const medal = i === 0 ? '#ffd75e' : i === 1 ? '#d8e0e8' : i === 2 ? '#d99a5e' : '#6b8a78';
      root.add(scene.add.text(listX + 2, y, String(i + 1), {
        fontFamily: 'sans-serif', fontSize: '12px', color: medal, fontStyle: 'bold',
      }).setOrigin(0, 0.5));

      const name = r.username.length > 10 ? r.username.slice(0, 9) + '…' : r.username;
      root.add(scene.add.text(listX + 24, y, name, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#c8e0d0',
      }).setOrigin(0, 0.5));

      // 关数 + 该关分数合成一段，右对齐
      root.add(scene.add.text(listX + listW - 2, y, `第${r.stage_progress}关 · ${r.best_score}分`, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#63c256', fontStyle: 'bold',
      }).setOrigin(1, 0.5));
    });
  };

  const loading = scene.add.text(cx, cy, '加载中…', {
    fontFamily: 'sans-serif', fontSize: '12px', color: '#7fa890',
  }).setOrigin(0.5);
  root.add(loading);

  const close = scene.add.text(cx, cy + ph / 2 - 24, '关闭', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#8fe0a8',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  root.add(close);
  close.on('pointerdown', () => { Sfx.click(); root.destroy(true); });

  if (!cloudEnabled) {
    loading.setText('云端未配置，暂无排行榜');
    return root;
  }

  void fetchTopStages().then((rows) => {
    loading.destroy();
    if (!root.active) return;
    // 后端已按 stage_progress desc, best_score desc 排好；前端再兜一次，
    // 避免函数被替换或缓存旧版本时顺序不对。
    const sorted = [...rows].sort((a, b) =>
      (b.stage_progress ?? 0) - (a.stage_progress ?? 0)
      || (b.best_score ?? 0) - (a.best_score ?? 0));
    renderList(sorted);
  });

  return root;
}
