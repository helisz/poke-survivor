import Phaser from 'phaser';
import { TRAITS, type TraitId } from '../data/stats';
import { Sfx } from '../systems/Sfx';
import { makeTraitIconTexture, type TraitIcon } from '../ui/TraitIcons';

/** 从数组里随机抽 n 个不重复 */
function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, n);
}

/** 每个特性配一种强调色，图标底盘与卡片描边同步 */
const ACCENT: Record<TraitId, number> = {
  swift: 0x63c8e0,
  iron: 0x8fa8c8,
  affinity: 0xe08fb0,
  power: 0xe07a52,
  haste: 0xc6a44a,
  vitality: 0x63c256,
  scholar: 0x7f9ce0,
  magnet: 0xc264a8,
  guard: 0x9a8ad0,
};

/** 第二步：特性 9 选 3 */
export class TraitSelectScene extends Phaser.Scene {
  private choices: typeof TRAITS[number][] = [];
  private selected: TraitId | null = null;
  private cardRefs: {
    box: Phaser.GameObjects.Rectangle;
    icon: Phaser.GameObjects.Image;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    mark: Phaser.GameObjects.Text;
    accent: number;
  }[] = [];
  private nextBtn!: Phaser.GameObjects.Rectangle;
  private nextTxt!: Phaser.GameObjects.Text;

  constructor() { super('TraitSelect'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    this.cardRefs = [];
    this.selected = null;
    this.choices = pickN(TRAITS, 3);

    // 背景微光
    const glow = this.add.graphics();
    glow.fillStyle(0x449ddf, 0.045);
    glow.fillCircle(width / 2, height * 0.2, width * 0.75);

    this.add.text(width / 2, height * 0.105, '选择特性', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.105 + 27, '第 1 / 2 步 · 三选一', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#449ddf',
    }).setOrigin(0.5);

    this.buildCards(width, height);
    this.buildNextButton(width, height);
  }

  private buildCards(width: number, height: number) {
    const cardW = Math.min(width - 56, 300);
    const cardH = Math.min(86, (height * 0.56) / 3 - 10);
    const gap = 14;
    // 三张卡在标题与底部按钮之间垂直居中
    const total = 3 * cardH + 2 * gap;
    const topY = (height * 0.20 + (height - 120)) / 2 - total / 2;

    this.choices.forEach((t, i) => {
      const x = width / 2;
      const y = topY + i * (cardH + gap) + cardH / 2 + 28;
      const accent = ACCENT[t.id];
      const iconKey = makeTraitIconTexture(this, t.icon as TraitIcon, accent);

      const box = this.add.rectangle(x, y, cardW, cardH, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });
      // 左侧强调色竖条
      const bar = this.add.rectangle(x - cardW / 2 + 3, y, 4, cardH - 14, accent)
        .setAlpha(0.55);

      const icon = this.add.image(x - cardW / 2 + 44, y, iconKey)
        .setDisplaySize(44, 44);
      // 记下缩放比，refresh 里绝不能再 setScale，否则会打回原图尺寸
      const iconScale = icon.scaleX;

      const name = this.add.text(x - cardW / 2 + 76, y - 13, t.name, {
        fontFamily: 'sans-serif', fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      const desc = this.add.text(x - cardW / 2 + 76, y + 11, t.desc, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
        wordWrap: { width: cardW - 150 },
      }).setOrigin(0, 0.5);

      const mark = this.add.text(x + cardW / 2 - 18, y, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: accent.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      box.on('pointerover', () => {
        if (this.selected !== t.id) box.setStrokeStyle(2, 0x2c4a60);
      });
      box.on('pointerout', () => {
        if (this.selected !== t.id) box.setStrokeStyle(2, 0x1e3344);
      });
      box.on('pointerdown', () => {
        this.selected = t.id;
        Sfx.select();
        this.refresh();
      });

      void bar;
      this.cardRefs.push({ box, icon, name, desc, mark, accent });
      void iconScale;
    });

    this.refresh();
  }

  private refresh() {
    if (!this.cardRefs.length || !this.nextBtn) return;
    this.cardRefs.forEach((r, i) => {
      const on = this.choices[i]?.id === this.selected;
      r.box.setStrokeStyle(on ? 2.5 : 2, on ? r.accent : 0x1e3344);
      r.box.setFillStyle(on ? 0x16293a : 0x11202c);
      r.name.setColor(on ? '#ffffff' : '#e2eef7');
      r.desc.setColor(on ? '#b8d0e0' : '#8fa8b8');
      r.mark.setText(on ? '✓ 已选' : '');
      r.mark.setColor(`#${r.accent.toString(16).padStart(6, '0')}`);
    });
    const ok = !!this.selected;
    const accent = ok ? ACCENT[this.selected as TraitId] : 0x449ddf;
    this.nextBtn.setFillStyle(ok ? accent : 0x24404f);
    this.nextBtn.setStrokeStyle(2, ok ? accent : 0x2b4256);
    this.nextTxt.setText(ok ? '下一步：选伙伴' : '请选择特性')
      .setColor(ok ? '#041018' : '#7d96a8');
  }

  private buildNextButton(width: number, height: number) {
    const y = height - 68;
    this.nextBtn = this.add.rectangle(width / 2, y, 220, 50, 0x24404f)
      .setStrokeStyle(2, 0x2b4256).setInteractive({ useHandCursor: true });
    this.nextTxt = this.add.text(width / 2, y, '请选择特性', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#7d96a8', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.nextBtn.on('pointerdown', () => {
      if (!this.selected) return;
      Sfx.click();
      this.scene.start('PartnerSelect', { trait: this.selected });
    });
  }
}
