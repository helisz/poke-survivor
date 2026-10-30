import Phaser from 'phaser';
import { loadSave, writeSave, type SaveData } from '../data/stats';
import { UI, TEXT } from './Theme';
import { attachPressFeedback } from './Feedback';
import { RoundedPanel } from './RoundedPanel';
import { Sfx } from '../systems/Sfx';

/**
 * 开发者模式面板（菜单 / 游戏内共用）
 *
 * 入口是右上角常驻的 ⚙ 按钮，点开是倍率面板。
 * 修改立即写入 localStorage，下一局生效；游戏内调用时需重新应用倍率。
 */
export function openDevPanel(
  scene: Phaser.Scene,
  onChange?: (save: SaveData) => void,
  onClose?: () => void,
  /** 游戏内传入：提供地图跳转能力 */
  mapJump?: {
    themes: { name: string; nameJp: string }[];
    current: () => number;
    jump: (index: number) => void;
  },
  /** 提供后显示「放弃本局」，点两次确认才生效 */
  onQuit?: () => void,
) {
  const { width, height } = scene.scale;
  const save = loadSave();

  const panel = scene.add.container(0, 0).setDepth(2000);

  // 半透明遮罩，点它关闭
  const mask = scene.add.rectangle(0, 0, width, height, 0x000000, 0.55)
    .setOrigin(0).setInteractive();
  panel.add(mask);

  const pw = Math.min(width - 32, 350);
  const rows: {
    key: 'devDmgMul' | 'devTakenMul' | 'devExpMul';
    label: string; hint: string; steps: number[]; invincible?: boolean;
  }[] = [
    { key: 'devDmgMul', label: '造成伤害', hint: '越高越强', steps: [0.5, 1, 1.5, 2, 3, 5, 10] },
    { key: 'devTakenMul', label: '承受伤害', hint: '0 = 无敌', steps: [0, 0.1, 0.3, 0.5, 0.75, 1, 2], invincible: true },
    { key: 'devExpMul', label: '经验倍率', hint: '默认 3 倍', steps: [1, 2, 3, 5, 8, 10] },
  ];
  const rowH = 68;
  // 地图跳转区高度（仅游戏内）
  const mapH = mapJump ? 76 : 0;
  // 解锁全部关卡：只在主页（菜单）出现，游戏内已经有时间阶段跳转
  const unlockH = mapJump ? 0 : 46;
  const ph = 96 + rows.length * rowH + mapH + unlockH + 52 + (onQuit ? 38 : 0);
  const cx = width / 2, cy = height / 2;

  const bg = new RoundedPanel(scene, cx, cy, pw, ph, 0x140f08, 0.99, { radius: 16 })
    .setStrokeStyle(2, UI.primary).setInteractive();
  panel.add(bg);

  panel.add(scene.add.text(cx, cy - ph / 2 + 20, '开发者模式', {
    fontFamily: 'sans-serif', fontSize: '16px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0.5));
  panel.add(scene.add.text(cx, cy - ph / 2 + 41, '修改立即保存，下一局生效', {
    fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
  }).setOrigin(0.5));

  // 各行重置器：重置按钮统一调用
  const resetFns: (() => void)[] = [];

  rows.forEach((row, ri) => {
    const ry = cy - ph / 2 + 82 + ri * rowH;
    panel.add(scene.add.text(cx - pw / 2 + 16, ry - 8, row.label, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    panel.add(scene.add.text(cx - pw / 2 + 16 + 62, ry - 8, row.hint, {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0, 0.5));

    const valText = scene.add.text(cx + pw / 2 - 16, ry - 8, `${save[row.key]}×`, {
      fontFamily: 'sans-serif', fontSize: '15px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(1, 0.5);
    panel.add(valText);

    const setVal = (v: number) => {
      save[row.key] = v;
      writeSave(save);
      valText.setText(`${v}×`);
      onChange?.(save);
      if (row.invincible) refreshInvincible();
    };
    resetFns.push(() => { save[row.key] = 1; valText.setText('1×'); });

    const mk = (dx: number, dir: -1 | 1, sym: string) => {
      const b = new RoundedPanel(scene, cx + dx, ry + 16, 34, 28, UI.cardOn, 1, { radius: 7 })
        .setStrokeStyle(1.5, UI.cardStroke).setInteractive({ useHandCursor: true });
        attachPressFeedback(b);
      const t = scene.add.text(cx + dx, ry + 16, sym, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff',
      }).setOrigin(0.5);
      b.on('pointerdown', () => {
        // 按下反馈：底色一亮一暗，让玩家确认点到了
        b.setFillStyle(UI.primary, 1);
        scene.tweens.add({
          targets: b, alpha: { from: 1, to: 0.55 }, duration: 110, yoyo: true,
          onComplete: () => { b.setAlpha(1); b.setFillStyle(UI.cardOn); },
        });
        const arr = row.steps;
        let idx = arr.findIndex((v) => Math.abs(v - save[row.key]) < 1e-6);
        if (idx < 0) idx = Math.max(0, arr.findIndex((v) => v >= save[row.key]));
        idx = Phaser.Math.Clamp(idx + dir, 0, arr.length - 1);
        setVal(arr[idx]);
      });
      panel.add([b, t]);
    };
    mk(-30, -1, '−');
    mk(30, 1, '+');

    // 无敌勾选（只给承受伤害行）：放到该行最右侧倍率值下面，避免遮挡 +/−
    let refreshInvincible = () => {};
    if (row.invincible) {
      const cbX = cx + pw / 2 - 44;
      const cbY = ry + 18;
      const checkbox = new RoundedPanel(scene, cbX, cbY, 16, 16, UI.cardOn, 1, { radius: 4 })
        .setStrokeStyle(1.5, row.key === 'devTakenMul' && save.devTakenMul === 0 ? 0x63c256 : UI.cardStroke)
        .setInteractive({ useHandCursor: true });
        attachPressFeedback(checkbox);
      const tick = scene.add.text(cbX, cbY, '✓', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#63c256', fontStyle: 'bold',
      }).setOrigin(0.5);
      const label = scene.add.text(cbX + 12, cbY, '无敌', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#63c256',
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

      refreshInvincible = () => {
        const on = save.devTakenMul === 0;
        tick.setVisible(on);
        checkbox.setStrokeStyle(1.5, on ? 0x63c256 : UI.cardStroke);
        label.setColor(on ? '#63c256' : '#5f7a8c');
      };
      const toggle = () => setVal(save.devTakenMul === 0 ? 1 : 0);
      checkbox.on('pointerdown', toggle);
      label.on('pointerdown', toggle);
      refreshInvincible();

      panel.add([checkbox, tick, label]);
    }
  });

  // 解锁全部关卡（仅主页）：默认关，勾选后关卡全开
  if (!mapJump) {
    const uy = cy - ph / 2 + 82 + rows.length * rowH + 8;
    const cbX = cx - pw / 2 + 24;
    const checkbox = new RoundedPanel(scene, cbX, uy, 18, 18, UI.cardOn, 1, { radius: 4 })
      .setStrokeStyle(1.5, save.devAllStages ? 0x63c256 : UI.cardStroke)
      .setInteractive({ useHandCursor: true });
    attachPressFeedback(checkbox);
    const tick = scene.add.text(cbX, uy, '✓', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#63c256', fontStyle: 'bold',
    }).setOrigin(0.5);
    const label = scene.add.text(cbX + 16, uy, '解锁全部关卡', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    const hint = scene.add.text(cbX + 16 + 96, uy, '不影响真实进度', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0, 0.5);

    const refreshAll = () => {
      const on = !!save.devAllStages;
      const sv = loadSave();
      sv.devAllStages = on;
      writeSave(sv);
      tick.setVisible(on);
      checkbox.setStrokeStyle(1.5, on ? 0x63c256 : UI.cardStroke);
      label.setColor(on ? '#63c256' : '#ffffff');
      onChange?.(sv);
    };
    const toggle = () => {
      save.devAllStages = !save.devAllStages;
      Sfx.select();
      refreshAll();
    };
    checkbox.on('pointerdown', toggle);
    label.on('pointerdown', toggle);
    tick.setVisible(!!save.devAllStages);
    panel.add([checkbox, tick, label, hint]);
  }

  // 地图快捷跳转（仅游戏内）
  if (mapJump) {
    const my = cy - ph / 2 + 82 + rows.length * rowH;
    panel.add(scene.add.text(cx - pw / 2 + 16, my - 8, '时间阶段', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    panel.add(scene.add.text(cx - pw / 2 + 16 + 58, my - 8, '跳时间轴 · 不换地图', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0, 0.5));

    // 一行 3 个，共 6 张图
    const cols = 3;
    const gap = 6;
    const bw = (pw - 32 - gap * (cols - 1)) / cols;
    const bh = 26;
    const btns: { bg: Phaser.GameObjects.Rectangle | RoundedPanel; txt: Phaser.GameObjects.Text }[] = [];

    const refreshBtns = () => {
      const cur = mapJump.current();
      btns.forEach((b, i) => {
        const on = i === cur;
        b.bg.setFillStyle(on ? UI.primary : UI.cardOn);
        b.bg.setStrokeStyle(1.5, on ? UI.primary : UI.cardStroke);
        b.txt.setColor(on ? '#041018' : '#9cc4dc');
      });
    };

    mapJump.themes.forEach((t, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = cx - pw / 2 + 16 + col * (bw + gap) + bw / 2;
      const by = my + 22 + row * (bh + gap);
      const bg = new RoundedPanel(scene, bx, by, bw, bh, UI.cardOn, 1, { radius: 8 })
        .setStrokeStyle(1.5, UI.cardStroke).setInteractive({ useHandCursor: true });
        attachPressFeedback(bg);
      const txt = scene.add.text(bx, by, String(i + 1), {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#9cc4dc', fontStyle: 'bold',
      }).setOrigin(0.5);
      bg.on('pointerdown', () => {
        // 按下瞬间先给一个亮闪，即使后面游戏逻辑没变化也有明确反馈
        bg.setFillStyle(UI.primary, 1);
        scene.tweens.add({
          targets: bg, alpha: { from: 1, to: 0.55 }, duration: 120, yoyo: true,
          onComplete: () => { bg.setAlpha(1); refreshBtns(); },
        });
        mapJump.jump(i);
        refreshBtns();
      });
      panel.add([bg, txt]);
      btns.push({ bg, txt });
    });
    refreshBtns();
    panel.setData('refreshMapBtns', refreshBtns);
  }

  // 放弃本局：需要点两次确认，避免误触（放在底部按钮行上方）
  if (onQuit) {
    const qy = cy + ph / 2 - 64;
    const quitBtn = new RoundedPanel(scene, cx, qy, 200, 32, 0x3a1f22, 1, { radius: 8 })
      .setStrokeStyle(1.5, 0x6f3a3f).setInteractive({ useHandCursor: true });
      attachPressFeedback(quitBtn);
    const quitTxt = scene.add.text(cx, qy, '放弃本局', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#e08a90', fontStyle: 'bold',
    }).setOrigin(0.5);
    let armed = false;
    let armTimer: Phaser.Time.TimerEvent | null = null;
    quitBtn.on('pointerdown', () => {
      if (!armed) {
        armed = true;
        quitTxt.setText('再点一次确认放弃');
        quitBtn.setFillStyle(0x5a2a2e).setStrokeStyle(1.5, 0x9a4a52);
        armTimer?.remove();
        armTimer = scene.time.delayedCall(3000, () => {
          armed = false;
          quitTxt.setText('放弃本局');
          quitBtn.setFillStyle(0x3a1f22).setStrokeStyle(1.5, 0x6f3a3f);
        });
        return;
      }
      armTimer?.remove();
      panel.destroy(true);
      onQuit();
    });
    panel.add([quitBtn, quitTxt]);
  }

  // 重置全部：所有倍率回到 1，并取消无敌
  const resetBtn = new RoundedPanel(scene, cx - 62, cy + ph / 2 - 26, 100, 30, 0x1c3344, 1, { radius: 8 })
    .setStrokeStyle(1.5, 0x2f4b60).setInteractive({ useHandCursor: true });
    attachPressFeedback(resetBtn);
  const resetTxt = scene.add.text(cx - 62, cy + ph / 2 - 26, '重置全部', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#9cc4dc', fontStyle: 'bold',
  }).setOrigin(0.5);
  resetBtn.on('pointerdown', () => {
    // 只把三个倍率回 1（含 devTakenMul —— 1 即关闭无敌）。
    // 绝不动时间阶段：devTimeStage / elapsed 属于当前局的进度，
    // 被一起重置会让游戏从当前位置跳回去，看起来就像卡死。
    const keepStage = mapJump?.current?.() ?? 0;
    resetFns.forEach((fn) => fn());
    writeSave(save);
    // 恢复时间阶段（resetFns 理论上不碰它，这里再兜一层，防止以后有人往里加）
    void keepStage;
    onChange?.(save);
    resetTxt.setText('已重置');
    scene.time.delayedCall(900, () => resetTxt.setText('重置全部'));
  });
  panel.add([resetBtn, resetTxt]);

  const closeBtn = new RoundedPanel(scene, cx + 62, cy + ph / 2 - 26, 100, 30, UI.primary, 1, { radius: 8 })
    .setInteractive({ useHandCursor: true });
    attachPressFeedback(closeBtn);
  const closeTxt = scene.add.text(cx + 62, cy + ph / 2 - 26, '关闭', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#041018', fontStyle: 'bold',
  }).setOrigin(0.5);
  const close = () => { panel.destroy(true); onClose?.(); };
  closeBtn.on('pointerdown', close);
  mask.on('pointerdown', close);
  panel.add([closeBtn, closeTxt]);

  panel.setSize(pw, ph);
  return panel;
}

/** 常驻的开发者入口按钮（右上角 ⚙） */
export function makeDevButton(scene: Phaser.Scene, onClick: () => void, depth = 1900) {
  const { width } = scene.scale;
  // 与左上角血条同高（手机 hpY=52，桌面 56）
  // 齿轮半径 17 比血条高 12 更大，视觉重心偏下 → 上移 2px 补偿对齐
  const TOP_Y = (scene.scale.width < 640 ? 52 : 56) - 2;
  const btn = scene.add.container(width - 34, TOP_Y).setDepth(depth);
  const bg = scene.add.circle(0, 0, 17, UI.secondary, 0.92)
    .setStrokeStyle(1.5, UI.primaryStroke, 0.75).setInteractive({ useHandCursor: true });
    attachPressFeedback(bg);
  const gear = scene.add.text(0, 0, '⚙', {
    fontFamily: '"Apple Symbols", "Segoe UI Symbol", sans-serif', fontSize: '20px', color: TEXT.gold,
  }).setOrigin(0.5);
  btn.add([bg, gear]);
  bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation?.();
    onClick();
  });
  // 跟随窗口尺寸
  scene.scale.on('resize', () => btn.setPosition(scene.scale.width - 34, TOP_Y));
  return btn;
}
