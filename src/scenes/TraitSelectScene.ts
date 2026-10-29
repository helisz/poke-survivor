import Phaser from 'phaser';
import { TRAITS, type TraitId } from '../data/stats';
import { Sfx } from '../systems/Sfx';

/** 从数组里随机抽 n 个不重复 */
function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, n);
}

/** 第二步：特性 9 选 3 */
export class TraitSelectScene extends Phaser.Scene {
  private choices: typeof TRAITS[number][] = [];
  private selected: TraitId | null = null;
  private cardRefs: {
    box: Phaser.GameObjects.Rectangle;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    mark: Phaser.GameObjects.Text;
  }[] = [];
  private nextBtn!: Phaser.GameObjects.Rectangle;
  private nextTxt!: Phaser.GameObjects.Text;

  constructor() { super('TraitSelect'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    // 场景复用：清空旧引用
    this.cardRefs = [];
    this.selected = null;
    this.choices = pickN(TRAITS, 3);

    this.add.text(width / 2, height * 0.11, '选择特性', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.11 + 28, '第 1 / 2 步 · 三选一', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#449ddf',
    }).setOrigin(0.5);

    this.buildCards(width, height);
    this.buildNextButton(width, height);
  }

  private buildCards(width: number, height: number) {
    const cardW = Math.min(width - 80, 260);
    const cardH = 92;
    const gap = 14;
    const startY = height * 0.28;

    this.choices.forEach((t, i) => {
      const x = width / 2;
      const y = startY + i * (cardH + gap);
      const box = this.add.rectangle(x, y, cardW, cardH, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });
      const name = this.add.text(x - cardW / 2 + 20, y - 24, t.name, {
        fontFamily: 'sans-serif', fontSize: '19px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const desc = this.add.text(x - cardW / 2 + 20, y + 6, t.desc, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
        wordWrap: { width: cardW - 40 },
      }).setOrigin(0, 0.5);
      const mark = this.add.text(x + cardW / 2 - 20, y, '', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#449ddf', fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      box.on('pointerdown', () => {
        this.selected = t.id;
        Sfx.select();
        this.refresh();
      });
      this.cardRefs.push({ box, name, desc, mark });
    });

    this.refresh();
  }

  private refresh() {
    if (!this.cardRefs.length || !this.nextBtn) return;
    this.cardRefs.forEach((r, i) => {
      const on = this.choices[i]?.id === this.selected;
      r.box.setStrokeStyle(2, on ? 0x449ddf : 0x1e3344);
      r.box.setFillStyle(on ? 0x16293a : 0x11202c);
      r.name.setColor(on ? '#449ddf' : '#ffffff');
      r.desc.setColor(on ? '#a8c4d8' : '#8fa8b8');
      r.mark.setText(on ? '已选择' : '');
    });
    const ok = !!this.selected;
    this.nextBtn.setFillStyle(ok ? 0x449ddf : 0x24404f);
    this.nextBtn.setStrokeStyle(2, ok ? 0x449ddf : 0x2b4256);
    this.nextTxt.setText(ok ? '下一步：选伙伴' : '请选择特性')
      .setColor(ok ? '#041018' : '#7d96a8');
  }

  private buildNextButton(width: number, height: number) {
    const y = height - 70;
    this.nextBtn = this.add.rectangle(width / 2, y, 220, 50, 0x24404f)
      .setStrokeStyle(2, 0x2b4256).setInteractive({ useHandCursor: true });
    this.nextTxt = this.add.text(width / 2, y, '请选择特性', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#7d96a8', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.nextBtn.on('pointerdown', () => {
      if (!this.selected) return;
      this.scene.start('PartnerSelect', { trait: this.selected });
    });
  }
}
