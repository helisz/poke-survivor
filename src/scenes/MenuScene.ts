import Phaser from 'phaser';
import { TRAITS, loadSave, writeSave, type TraitId } from '../data/stats';

export class MenuScene extends Phaser.Scene {
  private selected: TraitId = 'swift';
  private traitTexts: Phaser.GameObjects.Text[] = [];

  constructor() { super('Menu'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');

    const save = loadSave();

    this.add.text(width / 2, height * 0.22, 'POKE SURVIVOR', {
      fontFamily: 'monospace', fontSize: '40px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.22 + 42, '宝可梦幸存者 · 草原试炼', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#7fa8c0',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.36, `金币  ${save.coins}      最长生存  ${this.fmt(save.bestTime)}`, {
      fontFamily: 'monospace', fontSize: '14px', color: '#a8c4d8',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.44, '选择特性', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#7fa8c0',
    }).setOrigin(0.5);

    TRAITS.forEach((t, i) => {
      const y = height * 0.5 + i * 54;
      const box = this.add.rectangle(width / 2, y, 320, 44, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });
      const label = this.add.text(width / 2 - 145, y - 11, t.name, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      });
      const desc = this.add.text(width / 2 - 145, y + 6, t.desc, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fa8b8',
      });
      box.on('pointerdown', () => { this.selected = t.id; this.refresh(width); });
      this.traitTexts.push(label, desc);
      (box as any).__traitId = t.id;
    });

    const startBtn = this.add.rectangle(width / 2, height * 0.82, 220, 52, 0x449ddf)
      .setInteractive({ useHandCursor: true });
    this.add.text(width / 2, height * 0.82, '开 始 游 戏', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5);
    startBtn.on('pointerdown', () => this.startRun());
    startBtn.on('pointerover', () => startBtn.setFillStyle(0x63b4ef));
    startBtn.on('pointerout', () => startBtn.setFillStyle(0x449ddf));

    this.add.text(width / 2, height * 0.9, 'WASD / 方向键 移动 · 升级时按 1/2/3 选择', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#4c6272',
    }).setOrigin(0.5);

    this.buildDevPanel(width, height, save);

    this.refresh(width);
    this.input.keyboard?.once('keydown-ENTER', () => this.startRun());
    this.input.keyboard?.once('keydown-SPACE', () => this.startRun());
  }

  private refresh(width: number) {
    this.children.list.forEach((c) => {
      const box = c as Phaser.GameObjects.Rectangle & { __traitId?: string };
      if (box.__traitId) {
        box.setStrokeStyle(2, box.__traitId === this.selected ? 0x449ddf : 0x1e3344);
        box.setFillStyle(box.__traitId === this.selected ? 0x16293a : 0x11202c);
      }
    });
  }

  private fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  /** 开发者模式：调节造成/承受伤害倍率，存入存档 */
  private buildDevPanel(width: number, height: number, save: ReturnType<typeof loadSave>) {
    const btnY = height * 0.955;
    const btn = this.add.text(width / 2, btnY, '⚙ 开发者模式', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#4c6272',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    const panel = this.add.container(0, 0).setDepth(900).setVisible(false);
    const pw = Math.min(width - 40, 340);
    const ph = 290;
    const bg = this.add.rectangle(width / 2, height / 2, pw, ph, 0x0b151d, 0.98)
      .setStrokeStyle(2, 0x449ddf).setInteractive();
    panel.add(bg);

    panel.add(this.add.text(width / 2, height / 2 - ph / 2 + 18, '开发者模式', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5));
    panel.add(this.add.text(width / 2, height / 2 - ph / 2 + 40, '调整倍率后立即生效，仅本机保存', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0.5));

    const rows: { key: 'devDmgMul' | 'devTakenMul'; label: string; hint: string; steps: number[] }[] = [
      { key: 'devDmgMul', label: '造成伤害', hint: '越高越强', steps: [0.5, 1, 1.5, 2, 3, 5, 10] },
      { key: 'devTakenMul', label: '承受伤害', hint: '越低越肉', steps: [0, 0.1, 0.3, 0.5, 0.75, 1, 2] },
    ];

    rows.forEach((row, ri) => {
      const ry = height / 2 - ph / 2 + 70 + ri * 72;
      panel.add(this.add.text(width / 2 - pw / 2 + 16, ry - 6, `${row.label}`, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5));
      panel.add(this.add.text(width / 2 - pw / 2 + 16 + row.label.length * 13 + 8, ry - 6, row.hint, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
      }).setOrigin(0, 0.5));

      const valText = this.add.text(width / 2 + pw / 2 - 16, ry - 6, `${save[row.key]}×`, {
        fontFamily: 'monospace', fontSize: '15px', color: '#449ddf', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      panel.add(valText);

      // 左右步进
      const mk = (dx: number, dir: -1 | 1, sym: string) => {
        const b = this.add.rectangle(width / 2 + dx, ry + 20, 34, 30, 0x16293a)
          .setStrokeStyle(1.5, 0x2b4256).setInteractive({ useHandCursor: true });
        const t = this.add.text(width / 2 + dx, ry + 20, sym, {
          fontFamily: 'monospace', fontSize: '16px', color: '#ffffff',
        }).setOrigin(0.5);
        b.on('pointerdown', () => {
          const arr = row.steps;
          let idx = arr.findIndex((v) => Math.abs(v - save[row.key]) < 1e-6);
          if (idx < 0) idx = arr.findIndex((v) => v >= save[row.key]);
          idx = Phaser.Math.Clamp(idx + dir, 0, arr.length - 1);
          save[row.key] = arr[idx];
          writeSave(save);
          valText.setText(`${arr[idx]}×`);
        });
        panel.add([b, t]);
      };
      mk(-30, -1, '−');
      mk(30, 1, '+');

      // 快捷预设
      if (row.key === 'devTakenMul') {
        const q = this.add.text(width / 2 + 30 + 26, ry + 20, '无敌', {
          fontFamily: 'sans-serif', fontSize: '11px', color: '#63c256',
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        q.on('pointerdown', () => {
          save.devTakenMul = 0;
          writeSave(save);
          valText.setText('0×');
        });
        panel.add(q);
      }
    });

    const closeBtn = this.add.rectangle(width / 2, height / 2 + ph / 2 - 22, 90, 28, 0x449ddf)
      .setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(width / 2, height / 2 + ph / 2 - 22, '关闭', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5);
    closeBtn.on('pointerdown', () => panel.setVisible(false));
    panel.add([closeBtn, closeTxt]);

    btn.on('pointerdown', () => panel.setVisible(!panel.visible));
  }

  private startRun() {
    this.scene.start('Game', { trait: this.selected });
  }
}
