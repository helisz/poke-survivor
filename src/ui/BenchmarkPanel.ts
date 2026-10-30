import Phaser from 'phaser';
import { UI, TEXT } from './Theme';
import { RoundedPanel } from './RoundedPanel';
import { attachPressFeedback } from './Feedback';
import { Sfx } from '../systems/Sfx';
import { fetchTopStages, fetchTopScores, cloudEnabled, type RankRow } from '../data/cloud';

/** 排行榜面板：左右两列，左「最高关卡」，右「最高分」 */
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

  // 两列布局
  const colW = (pw - 36) / 2;
  const leftX = cx - pw / 2 + 14;
  const rightX = leftX + colW + 8;
  const headY = top + 62;
  const rowH = Math.min(30, (ph - 130) / 10);

  const mkHead = (x: number, label: string) => {
    root.add(scene.add.rectangle(x + colW / 2, headY, colW, 26, UI.greenDark, 0.9)
      .setStrokeStyle(1, UI.greenDarkStroke));
    root.add(scene.add.text(x + colW / 2, headY, label, {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#8fe0a8', fontStyle: 'bold',
    }).setOrigin(0.5));
  };
  mkHead(leftX, '最高关卡');
  mkHead(rightX, '最高分');

  const bodyTop = headY + 22;

  const renderList = (x: number, rows: RankRow[], kind: 'stage' | 'score') => {
    if (rows.length === 0) {
      root.add(scene.add.text(x + colW / 2, bodyTop + rowH * 2, '暂无记录', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#5f7a6c',
      }).setOrigin(0.5));
      return;
    }
    rows.forEach((r, i) => {
      const y = bodyTop + i * rowH + rowH / 2;
      // 前三名底色略亮
      if (i < 3) {
        root.add(scene.add.rectangle(x + colW / 2, y, colW - 4, rowH - 2, UI.greenDark, 0.5));
      }
      const medal = i === 0 ? '#ffd75e' : i === 1 ? '#d8e0e8' : i === 2 ? '#d99a5e' : '#6b8a78';
      root.add(scene.add.text(x + 4, y, String(i + 1), {
        fontFamily: 'sans-serif', fontSize: '10px', color: medal, fontStyle: 'bold',
      }).setOrigin(0, 0.5));

      // 用户名过长截断
      const name = r.username.length > 10 ? r.username.slice(0, 9) + '…' : r.username;
      root.add(scene.add.text(x + 18, y, name, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#c8e0d0',
      }).setOrigin(0, 0.5));

      const val = kind === 'stage'
        ? `第${r.stage_progress}关`
        : String(r.best_score);
      root.add(scene.add.text(x + colW - 6, y, val, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#63c256', fontStyle: 'bold',
      }).setOrigin(1, 0.5));
    });
  };

  const loading = scene.add.text(cx, cy, '加载中…', {
    fontFamily: 'sans-serif', fontSize: '12px', color: '#7fa890',
  }).setOrigin(0.5);
  root.add(loading);

  // 关
  const close = scene.add.text(cx, cy + ph / 2 - 24, '关闭', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#8fe0a8',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  root.add(close);
  close.on('pointerdown', () => { Sfx.click(); root.destroy(true); });

  if (!cloudEnabled) {
    loading.setText('云端未配置，暂无排行榜');
    return root;
  }

  void Promise.all([fetchTopStages(), fetchTopScores()]).then(([stages, scores]) => {
    loading.destroy();
    if (!root.active) return;
    renderList(leftX, stages, 'stage');
    renderList(rightX, scores, 'score');
  });

  return root;
}
