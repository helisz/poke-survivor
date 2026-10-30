import Phaser from 'phaser';
import { TRAITS, type TraitId } from '../data/stats';
import { Sfx } from '../systems/Sfx';
import { makeTraitIconTexture, type TraitIcon } from '../ui/TraitIcons';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { UI, TEXT } from '../ui/Theme';
import { attachPressFeedback } from '../ui/Feedback';
import { RoundedPanel } from '../ui/RoundedPanel';

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
    box: Phaser.GameObjects.Rectangle | RoundedPanel;
    icon: Phaser.GameObjects.Image;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    mark: Phaser.GameObjects.Text;
    accent: number;
  }[] = [];
  private nextBtn!: RoundedPanel;
  private nextTxt!: Phaser.GameObjects.Text;

  constructor() { super('TraitSelect'); }

  /** 从选关页传进来的关卡序号 */
  private stage = 0;

  init(data: { stage?: number }) {
    this.stage = data?.stage ?? 0;
  }

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    this.cardRefs = [];
    this.selected = null;
    this.choices = pickN(TRAITS, 3);

    // 背景微光
    const glow = this.add.graphics();
    glow.fillStyle(UI.primary, 0.055);
    glow.fillCircle(width / 2, height * 0.2, width * 0.75);

    // 标题与副标题的坐标必须与 PartnerSelectScene 完全一致
    this.add.text(width / 2, height * 0.09, '选择特性', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.09 + 28, '第 2 / 3 步 · 三选一', {
      fontFamily: 'sans-serif', fontSize: '12px', color: TEXT.gold,
    }).setOrigin(0.5);

    this.buildCards(width, height);
    this.buildBackButton();
    this.buildNextButton(width, height);
    this.refresh();
  }

  private buildCards(width: number, height: number) {
    const cardW = Math.min(width - 56, 300);
    // 顶部从标题下方 21% 起算，与伙伴页保持一致
    const topLimit = height * 0.21;
    const bottomLimit = height - 128;
    const gap = 14;
    const availH = bottomLimit - topLimit;
    const cardH = Math.min(86, (availH - gap * 2) / 3);
    // 三张卡在可用区里垂直居中
    const total = 3 * cardH + 2 * gap;
    const topY = topLimit + (availH - total) / 2;

    this.choices.forEach((t, i) => {
      const x = width / 2;
      const y = topY + i * (cardH + gap) + cardH / 2 + 28;
      const accent = ACCENT[t.id];
      const iconKey = makeTraitIconTexture(this, t.icon as TraitIcon, accent);

      const box = new RoundedPanel(this, x, y, cardW, cardH, UI.card, 1, { radius: 12 })
        .setStrokeStyle(2, UI.cardStroke).setInteractive({ useHandCursor: true });
        attachPressFeedback(box);
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

      // 初始值给实义字符：Phaser 的 Text 在内容为空白串时会跳过 canvas 初始化，
      // 之后 refresh 里 setColor 就会读到 null 上下文而抛 drawImage 异常。
      const mark = this.add.text(x + cardW / 2 - 18, y, '·', {
        fontFamily: 'sans-serif', fontSize: '11px', color: accent.toString(16).padStart(6, '0'),
        fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      box.on('pointerover', () => {
        if (this.selected !== t.id) box.setStrokeStyle(2, UI.cardStrokeHover);
      });
      box.on('pointerout', () => {
        if (this.selected !== t.id) box.setStrokeStyle(2, UI.cardStroke);
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
    // 注意：这里不能调 refresh()。此时 nextBtn 尚未创建，且若场景是重建的，
    // 新增 Text 的 GPU 帧可能还没就绪，setText/setColor 会抛 drawImage 异常。
    // 统一挪到 create() 末尾、所有对象都建好之后调用一次。
  }

  /** Text 对象是否仍可安全操作（canvas 未被回收） */
  private alive(o: Phaser.GameObjects.Text | undefined): boolean {
    return !!o && !!o.canvas && !!o.context;
  }

  /**
   * 刷新选中态。
   *
   * 硬约束：只改 Rectangle（描边/底色）与 alpha，绝不对 Text 调 setText/setColor。
   * Phaser 的 Text 在场景重建后，上一轮对象的 GPU 帧已失效，任何文本更新都会抛
   * "Cannot read properties of null (reading 'drawImage')"。
   * 文字内容全部在创建时定死，选中反馈用描边高亮 + 勾选标记的 alpha 表达。
   */
  private refresh() {
    if (!this.cardRefs.length || !this.nextBtn) return;
    this.cardRefs.forEach((r, i) => {
      const on = this.choices[i]?.id === this.selected;
      r.box.setStrokeStyle(on ? 2.5 : 2, on ? r.accent : UI.cardStroke);
      r.box.setFillStyle(on ? UI.cardOn : UI.card);
      r.mark.setAlpha(on ? 1 : 0);
    });
    const ok = !!this.selected;
    const accent = ok ? ACCENT[this.selected as TraitId] : UI.primary;
    this.nextBtn.setFillStyle(ok ? accent : UI.disabled);
    this.nextBtn.setStrokeStyle(2, ok ? accent : UI.disabledStroke);
    this.nextTxt.setAlpha(ok ? 1 : 0.45);
  }

  /** 返回主菜单：与伙伴选择页完全一致，左上角「← 返回」纯文字 */
  private buildBackButton() {
    const back = this.add.text(24, 30, '← 返回', {
      fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.dim,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    attachPressFeedback(back);
    back.on('pointerdown', () => { Sfx.click(); goTo(this, 'MapSelect'); });
  }

  private buildNextButton(width: number, height: number) {
    const y = height - 68;

    this.nextBtn = new RoundedPanel(this, width / 2, y, 220, 50, UI.disabled)
      .setStrokeStyle(2, UI.disabledStroke).setInteractive({ useHandCursor: true });
    attachPressFeedback(this.nextBtn);
    // 文字固定为最终态：选中前后都显示"下一步：选伙伴"，
    // 只用按钮底色/透明度表达"是否可选"，避免运行期改文本触发纹理重建。
    this.nextTxt = this.add.text(width / 2, y, '下一步：选伙伴', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0.45);
    this.nextBtn.on('pointerdown', () => {
      if (!this.selected) return;
      Sfx.click();
      goTo(this, 'PartnerSelect', { trait: this.selected, stage: this.stage });
    });
  }
}
