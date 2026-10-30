import Phaser from 'phaser';
import { UI, TEXT } from './Theme';
import { RoundedPanel } from './RoundedPanel';
import { attachPressFeedback } from './Feedback';
import { Sfx } from '../systems/Sfx';
import { openAuthPanel } from './AuthPanel';
import { currentSession, startSession, endSession } from '../data/session';
import { loadSave } from '../data/stats';

/**
 * 先弹一个确认框，说明本地数据会被云端覆盖。
 * 确认后才打开登录面板。
 */
export function confirmOverwrite(scene: Phaser.Scene, onYes: () => void) {
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setDepth(2300);

  root.add(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setInteractive());

  const w = Math.min(width - 52, 300), h = 210;
  const cx = width / 2, cy = height / 2;
  const panel = new RoundedPanel(scene, cx, cy, w, h, 0x0b1f14, 0.99, { radius: 16 })
    .setStrokeStyle(1.5, UI.greenStroke);
  root.add(panel);

  root.add(scene.add.text(cx, cy - h / 2 + 28, '注意', {
    fontFamily: 'sans-serif', fontSize: '18px', color: '#63c256', fontStyle: 'bold',
  }).setOrigin(0.5));

  root.add(scene.add.text(cx, cy - 14,
    '登录后会用服务器上的存档\n覆盖本机的金币、分数和进度。\n\n本机数据不会自动合并。', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#c8d8e4',
    align: 'center', lineSpacing: 4,
  }).setOrigin(0.5));

  const okBtn = new RoundedPanel(scene, cx - 62, cy + h / 2 - 34, 112, 42, UI.green, 1, { radius: 10 })
    .setStrokeStyle(1.5, UI.greenStroke).setInteractive({ useHandCursor: true });
  attachPressFeedback(okBtn);
  root.add(okBtn);
  root.add(scene.add.text(cx - 62, cy + h / 2 - 34, '继续登录', {
    fontFamily: 'sans-serif', fontSize: '14px', color: '#041018', fontStyle: 'bold',
  }).setOrigin(0.5));

  const noBtn = new RoundedPanel(scene, cx + 62, cy + h / 2 - 34, 112, 42, UI.greenDark, 0.95, { radius: 10 })
    .setStrokeStyle(1.5, UI.greenDarkStroke).setInteractive({ useHandCursor: true });
  attachPressFeedback(noBtn);
  root.add(noBtn);
  root.add(scene.add.text(cx + 62, cy + h / 2 - 34, '取消', {
    fontFamily: 'sans-serif', fontSize: '14px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0.5));

  okBtn.on('pointerdown', () => {
    Sfx.select();
    root.destroy(true);
    onYes();
  });
  noBtn.on('pointerdown', () => { Sfx.click(); root.destroy(true); });
}

/** 已登录：点开显示基本信息 + 登出 */
export function openProfileCard(scene: Phaser.Scene, onLogout: () => void) {
  const s = currentSession();
  if (!s) return;
  const save = loadSave();
  const { width, height } = scene.scale;
  const root = scene.add.container(0, 0).setDepth(2300);

  root.add(scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setInteractive());

  const w = Math.min(width - 52, 300), h = 300;
  const cx = width / 2, cy = height / 2;
  const panel = new RoundedPanel(scene, cx, cy, w, h, 0x0b1f14, 0.99, { radius: 16 })
    .setStrokeStyle(1.5, UI.greenStroke);
  root.add(panel);

  root.add(scene.add.text(cx, cy - h / 2 + 30, '我的账号', {
    fontFamily: 'sans-serif', fontSize: '17px', color: '#63c256', fontStyle: 'bold',
  }).setOrigin(0.5));

  root.add(scene.add.text(cx, cy - h / 2 + 58, s.username, {
    fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5));

  // 基本信息：金币 / 最高关 / 总击杀分数
  const best = save.stageBest ?? [];
  let bestStage = -1, bestScore = 0;
  best.forEach((v, i) => { if (v > bestScore) { bestScore = v; bestStage = i; } });

  const rows = [
    ['金币', String(save.coins)],
    ['最高关卡', bestStage >= 0 ? `第 ${bestStage + 1} 关` : '—'],
    ['最高分', bestStage >= 0 ? String(bestScore) : '—'],
    ['图鉴', `${(save.seenEnemies ?? []).length + (save.seenPartners ?? []).length} 条记录`],
  ];
  rows.forEach(([k, v], i) => {
    const y = cy - h / 2 + 100 + i * 28;
    root.add(scene.add.text(cx - w / 2 + 26, y, k, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#8fa8b8',
    }).setOrigin(0, 0.5));
    root.add(scene.add.text(cx + w / 2 - 26, y, v, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(1, 0.5));
  });

  const outBtn = new RoundedPanel(scene, cx, cy + h / 2 - 80, w - 52, 42, UI.greenDark, 0.95, { radius: 10 })
    .setStrokeStyle(1.5, UI.greenDarkStroke).setInteractive({ useHandCursor: true });
  attachPressFeedback(outBtn);
  root.add(outBtn);
  root.add(scene.add.text(cx, cy + h / 2 - 80, '登出', {
    fontFamily: 'sans-serif', fontSize: '14px', color: '#8fe0a8', fontStyle: 'bold',
  }).setOrigin(0.5));

  const close = scene.add.text(cx, cy + h / 2 - 30, '关闭', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#7fa890',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  root.add(close);

  outBtn.on('pointerdown', () => {
    Sfx.click();
    endSession();
    root.destroy(true);
    onLogout();
  });
  close.on('pointerdown', () => { Sfx.click(); root.destroy(true); });
}

/**
 * 首页的登录按钮 / 用户名按钮。
 * 返回重建函数，登录状态变化后调用它刷新这一行。
 */
export function buildAccountRow(
  scene: Phaser.Scene, y: number, buttonW: number, buttonH: number,
  onChanged: () => void,
) {
  const cx = scene.scale.width / 2;
  const session = currentSession();

  const isLogin = !session;
  const panel = new RoundedPanel(scene, cx, y, buttonW, buttonH, UI.secondary, 0.88, { radius: 10 })
    .setStrokeStyle(1.5, UI.secondaryStroke).setInteractive({ useHandCursor: true }).setDepth(20);
  attachPressFeedback(panel);
  scene.add.text(cx, y, isLogin ? '登 录 / 注 册' : session!.username, {
    fontFamily: 'sans-serif', fontSize: '14px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0.5).setDepth(21);

  panel.on('pointerover', () => panel.setFillStyle(UI.secondaryHover, 0.95));
  panel.on('pointerout', () => panel.setFillStyle(UI.secondary, 0.88));

  panel.on('pointerup', () => {
    Sfx.init(); Sfx.click();
    if (isLogin) {
      confirmOverwrite(scene, () => {
        openAuthPanel(scene, (s) => {
          if (s) { startSession(s); }
          onChanged();
        });
      });
    } else {
      openProfileCard(scene, onChanged);
    }
  });
}
