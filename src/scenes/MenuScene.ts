import Phaser from 'phaser';
import { TRAITS, loadSave, type TraitId } from '../data/stats';

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

  private startRun() {
    this.scene.start('Game', { trait: this.selected });
  }
}
