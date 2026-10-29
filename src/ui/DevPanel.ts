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
  const ph = 96 + rows.length * rowH + 52;
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

    // 无敌勾选（只给承受伤害行）
    let refreshInvincible = () => {};
    if (row.invincible) {
      const checkbox = scene.add.rectangle(cx - 30 + 62, ry + 16, 18, 18, 0x16293a)
        .setStrokeStyle(1.5, row.key === 'devTakenMul' && save.devTakenMul === 0 ? 0x63c256 : 0x2b4256)
        .setInteractive({ useHandCursor: true });
      const tick = scene.add.text(cx - 30 + 62, ry + 16, '✓', {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#63c256', fontStyle: 'bold',
      }).setOrigin(0.5);
      const label = scene.add.text(cx - 30 + 62 + 14, ry + 16, '无敌', {
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

  const closeBtn = scene.add.rectangle(cx, cy + ph / 2 - 26, 100, 30, 0x449ddf)
    .setInteractive({ useHandCursor: true });
  const closeTxt = scene.add.text(cx, cy + ph / 2 - 26, '关闭', {
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
  const btn = scene.add.container(width - 34, 26).setDepth(depth);
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
  scene.scale.on('resize', () => btn.setPosition(scene.scale.width - 34, 26));
  return btn;
}
