import Phaser from 'phaser';
import { TRAITS, loadSave, type TraitId } from '../data/stats';
import { POKEMON_PLAYABLE, TYPE_COLORS } from '../data/pokedex';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';

export class MenuScene extends Phaser.Scene {
  private selected: TraitId = 'swift';
  private selectedStarter = 'thunderbolt';
  private starterTexts: Phaser.GameObjects.Rectangle[] = [];
  private traitTexts: Phaser.GameObjects.Text[] = [];

  constructor() { super('Menu'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');

    const save = loadSave();

    this.add.text(width / 2, height * 0.22, 'POKE SURVIVOR', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '40px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.22 + 42, '宝可梦幸存者 · 草原试炼', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#7fa8c0',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.22 + 62, 'ポケモンサバイバー · 草原の試練', {
      fontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
      fontSize: '11px', color: '#5f7a8c',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.36, `金币  ${save.coins}      最长生存  ${this.fmt(save.bestTime)}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '14px', color: '#a8c4d8',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.44, '选择特性', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#7fa8c0',
    }).setOrigin(0.5);

    // 伙伴宝可梦入口（开始按钮上方）
    const starterBtn = this.add.rectangle(width / 2, height * 0.745, 220, 38, 0x16293a)
      .setStrokeStyle(2, 0x2b4256).setInteractive({ useHandCursor: true });
    const starterLabel = this.add.text(width / 2, height * 0.745, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#a8c4d8',
    }).setOrigin(0.5);
    const updateStarterLabel = () => {
      const p = POKEMON_PLAYABLE.find((x) => x.move === this.selectedStarter);
      starterLabel.setText(`伙伴：${p ? p.name : '随机'}  ▸ 点击更换`);
    };
    updateStarterLabel();
    starterBtn.on('pointerdown', () => this.openStarterPicker(width, height, updateStarterLabel));

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

    makeDevButton(this, () => openDevPanel(this));

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

  /** 伙伴宝可梦选择弹层：24 只网格 */
  private openStarterPicker(width: number, height: number, onPick: () => void) {
    const panel = this.add.container(0, 0).setDepth(950);
    const pw = Math.min(width - 24, 360);
    const cols = 4;
    const cell = Math.min((pw - 24) / cols, 66);
    const rows = Math.ceil(POKEMON_PLAYABLE.length / cols);
    const gridH = rows * (cell + 18);
    const ph = Math.min(gridH + 92, height - 60);
    const cx = width / 2, cy = height / 2;

    const bg = this.add.rectangle(cx, cy, pw, ph, 0x0b151d, 0.99)
      .setStrokeStyle(2, 0x449ddf).setInteractive();
    panel.add(bg);
    panel.add(this.add.text(cx, cy - ph / 2 + 20, '选择伙伴宝可梦', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5));
    panel.add(this.add.text(cx, cy - ph / 2 + 40, '开局携带它的招式，后续更容易抽到同系招式', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0.5));

    const startX = cx - (cols * cell) / 2 + cell / 2;
    const startY = cy - ph / 2 + 76;

    POKEMON_PLAYABLE.forEach((p, i) => {
      const gx = startX + (i % cols) * cell;
      const gy = startY + Math.floor(i / cols) * (cell + 20);
      const color = TYPE_COLORS[p.type] ?? 0x449ddf;
      const sel = p.move === this.selectedStarter;

      const cellBox = this.add.rectangle(gx, gy, cell - 8, cell - 4, sel ? 0x16293a : 0x0e1a24)
        .setStrokeStyle(2, sel ? color : 0x24404f)
        .setInteractive({ useHandCursor: true });
      panel.add(cellBox);

      // 图标：容器内必须显式 add
      const pkKey = `pk_${p.id}`;
      if (this.textures.exists(pkKey)) {
        const icon = this.add.image(gx, gy - 6, pkKey).setScale((cell - 26) / 64);
        panel.add(icon);
      }

      const name = this.add.text(gx, gy + cell / 2 - 11, p.name, {
        fontFamily: 'sans-serif', fontSize: '9px', color: sel ? '#ffffff' : '#8fa8b8',
      }).setOrigin(0.5);
      panel.add(name);

      cellBox.on('pointerdown', () => {
        this.selectedStarter = p.move;
        onPick();
        panel.destroy(true);
      });
    });

    const closeBtn = this.add.rectangle(cx, cy + ph / 2 - 20, 90, 26, 0x16293a)
      .setStrokeStyle(1.5, 0x2b4256).setInteractive({ useHandCursor: true });
    const closeTxt = this.add.text(cx, cy + ph / 2 - 20, '取消', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#a8c4d8',
    }).setOrigin(0.5);
    closeBtn.on('pointerdown', () => panel.destroy(true));
    panel.add([closeBtn, closeTxt]);
  }

  private startRun() {
    this.scene.start('Game', { trait: this.selected, starterMove: this.selectedStarter });
  }
}
