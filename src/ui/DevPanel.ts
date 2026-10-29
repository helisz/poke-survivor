import Phaser from 'phaser';
import { loadSave, writeSave, type SaveData } from '../data/stats';

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
  const ph = 96 + rows.length * rowH + mapH + 52 + (onQuit ? 38 : 0);
  const cx = width / 2, cy = height / 2;

  const bg = scene.add.rectangle(cx, cy, pw, ph, 0x0b151d, 0.99)
    .setStrokeStyle(2, 0x449ddf).setInteractive();
  panel.add(bg);

  panel.add(scene.add.text(cx, cy - ph / 2 + 20, '开发者模式', {
    fontFamily: 'sans-serif', fontSize: '16px', color: '#449ddf', fontStyle: 'bold',
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
      fontFamily: 'sans-serif', fontSize: '15px', color: '#449ddf', fontStyle: 'bold',
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
      const b = scene.add.rectangle(cx + dx, ry + 16, 34, 28, 0x16293a)
        .setStrokeStyle(1.5, 0x2b4256).setInteractive({ useHandCursor: true });
      const t = scene.add.text(cx + dx, ry + 16, sym, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff',
      }).setOrigin(0.5);
      b.on('pointerdown', () => {
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
      const checkbox = scene.add.rectangle(cbX, cbY, 16, 16, 0x16293a)
        .setStrokeStyle(1.5, row.key === 'devTakenMul' && save.devTakenMul === 0 ? 0x63c256 : 0x2b4256)
        .setInteractive({ useHandCursor: true });
      const tick = scene.add.text(cbX, cbY, '✓', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#63c256', fontStyle: 'bold',
      }).setOrigin(0.5);
      const label = scene.add.text(cbX + 12, cbY, '无敌', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#63c256',
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

      refreshInvincible = () => {
        const on = save.devTakenMul === 0;
        tick.setVisible(on);
        checkbox.setStrokeStyle(1.5, on ? 0x63c256 : 0x2b4256);
        label.setColor(on ? '#63c256' : '#5f7a8c');
      };
      const toggle = () => setVal(save.devTakenMul === 0 ? 1 : 0);
      checkbox.on('pointerdown', toggle);
      label.on('pointerdown', toggle);
      refreshInvincible();

      panel.add([checkbox, tick, label]);
    }
  });

  // 地图快捷跳转（仅游戏内）
  if (mapJump) {
    const my = cy - ph / 2 + 82 + rows.length * rowH;
    panel.add(scene.add.text(cx - pw / 2 + 16, my - 8, '地图', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0, 0.5));
    panel.add(scene.add.text(cx - pw / 2 + 16 + 34, my - 8, '点击直接跳转（调试用）', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0, 0.5));

    // 一行 3 个，共 6 张图
    const cols = 3;
    const gap = 6;
    const bw = (pw - 32 - gap * (cols - 1)) / cols;
    const bh = 26;
    const btns: { bg: Phaser.GameObjects.Rectangle; txt: Phaser.GameObjects.Text }[] = [];

    const refreshBtns = () => {
      const cur = mapJump.current();
      btns.forEach((b, i) => {
        const on = i === cur;
        b.bg.setFillStyle(on ? 0x449ddf : 0x16293a);
        b.bg.setStrokeStyle(1.5, on ? 0x449ddf : 0x2b4256);
        b.txt.setColor(on ? '#041018' : '#9cc4dc');
      });
    };

    mapJump.themes.forEach((t, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const bx = cx - pw / 2 + 16 + col * (bw + gap) + bw / 2;
      const by = my + 22 + row * (bh + gap);
      const bg = scene.add.rectangle(bx, by, bw, bh, 0x16293a)
        .setStrokeStyle(1.5, 0x2b4256).setInteractive({ useHandCursor: true });
      const txt = scene.add.text(bx, by, t.name, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#9cc4dc',
      }).setOrigin(0.5);
      bg.on('pointerdown', () => {
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
    const quitBtn = scene.add.rectangle(cx, qy, 200, 32, 0x3a1f22)
      .setStrokeStyle(1.5, 0x6f3a3f).setInteractive({ useHandCursor: true });
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
  const resetBtn = scene.add.rectangle(cx - 62, cy + ph / 2 - 26, 100, 30, 0x1c3344)
    .setStrokeStyle(1.5, 0x2f4b60).setInteractive({ useHandCursor: true });
  const resetTxt = scene.add.text(cx - 62, cy + ph / 2 - 26, '重置全部', {
    fontFamily: 'sans-serif', fontSize: '13px', color: '#9cc4dc', fontStyle: 'bold',
  }).setOrigin(0.5);
  resetBtn.on('pointerdown', () => {
    // 所有倍率回 1（含 devTakenMul —— 1 即关闭无敌）
    resetFns.forEach((fn) => fn());
    writeSave(save);
    onChange?.(save);
    resetTxt.setText('已重置');
    scene.time.delayedCall(900, () => resetTxt.setText('重置全部'));
  });
  panel.add([resetBtn, resetTxt]);

  const closeBtn = scene.add.rectangle(cx + 62, cy + ph / 2 - 26, 100, 30, 0x449ddf)
    .setInteractive({ useHandCursor: true });
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
  const bg = scene.add.circle(0, 0, 17, 0x0e1a24, 0.92)
    .setStrokeStyle(1.5, 0x2b4256).setInteractive({ useHandCursor: true });
  const gear = scene.add.text(0, 0, '⚙', {
    fontFamily: '"Apple Symbols", "Segoe UI Symbol", sans-serif', fontSize: '20px', color: '#9cc4dc',
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
