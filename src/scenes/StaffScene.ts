import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { UI, TEXT } from '../ui/Theme';
import { attachPressFeedback } from '../ui/Feedback';
import { RoundedPanel } from '../ui/RoundedPanel';

/** 一段名单：标题 + 若干行名字 */
interface CreditBlock {
  role: string;
  names: string[];
  /** 明星卡位：放大、金色 */
  hero?: boolean;
  /** 附注：跟在名字下面小字 */
  note?: string;
}

const CREDITS: CreditBlock[] = [
  { role: '企划 · 设计 · 程序 · 美术', names: ['chrishe'], hero: true },
  { role: '音效', names: ['chrishe', 'chrishe', 'chrishe'] },
  { role: '字体', names: ['chrishe'] },
  { role: '引擎', names: ['chrishe'] },
  { role: '测试', names: ['chrishe'] },
  { role: '茶歇', names: ['chrishe'] },
  { role: 'SPECIAL THANKS', names: ['root', 'daemon', 'nobody', 'chrishe'] },
  { role: '特别鸣谢', names: ['DeepSeek'] },
  {
    role: '提前致谢',
    names: ['任天堂法务部'],
    note: '手下留情，我们是友军。',
  },
];

/**
 * 片尾 Staff 名单。
 *
 * 用相机滚动而不是 tween 移动容器：容器 + 大量 Text 每帧移动，
 * 在手机上要重算整条显示列表的矩阵；相机 scrollY 只是换一个
 * 渲染偏移，成本几乎为零，滚多久都不掉帧。
 *
 * 「返回」按钮常驻右下角，不用等滚完 —— 玩家随时能回主界面。
 */
export class StaffScene extends Phaser.Scene {
  constructor() { super('Staff'); }

  /** 滚动速度 px/s */
  private readonly SPEED = 34;
  private done = false;
  private retBtn!: RoundedPanel;

  create() {
    installTextTextureCleanup(this);
    const { width, height } = this.scale;

    this.cameras.main.setBackgroundColor('#041018');
    this.add.rectangle(0, 0, width, height, 0x041018, 1)
      .setOrigin(0).setScrollFactor(0).setDepth(-100);

    // 竖直滚动范围
    const marginTop = height * 0.9;
    let y = marginTop;

    const addLine = (
      text: string,
      opts: { size?: number; color?: string; bold?: boolean; alpha?: number; gapBefore?: number },
    ) => {
      y += opts.gapBefore ?? 0;
      const t = this.add.text(width / 2, y, text, {
        fontFamily: 'sans-serif',
        fontSize: `${opts.size ?? 13}px`,
        color: opts.color ?? '#cfe4f5',
        fontStyle: opts.bold ? 'bold' : 'normal',
      }).setOrigin(0.5);
      t.setAlpha(opts.alpha ?? 1);
      y += t.height + 6;
      return t;
    };

    // 顶部标题
    addLine('STAFF', { size: 30, color: TEXT.gold, bold: true });
    y += 26;

    // 内容
    for (const block of CREDITS) {
      const roleSize = block.hero ? 15 : 10;
      addLine(block.role, {
        size: roleSize,
        color: block.hero ? TEXT.gold : '#6f8ea6',
        bold: block.hero,
        gapBefore: 22,
      });
      for (const n of block.names) {
        addLine(n, {
          size: block.hero ? 26 : 15,
          color: block.hero ? '#ffffff' : '#cfe4f5',
          bold: block.hero,
          gapBefore: block.hero ? 8 : 2,
        });
      }
      if (block.note) {
        addLine(block.note, { size: 10, color: '#5f7a8c', gapBefore: 2 });
      }
    }

    // 结尾
    addLine('THANK YOU FOR PLAYING', { size: 13, color: TEXT.goldDim, bold: true, gapBefore: 60 });
    addLine('—— chrishe', { size: 11, color: '#4c6272', gapBefore: 4 });
    y += height * 0.9; // 留出底部缓冲，让最后一行也能滚出视野

    const scrollLength = y - marginTop;

    // 相机从 0 滚到 scrollLength
    this.cameras.main.setScroll(0, 0);
    this.tweens.add({
      targets: this.cameras.main,
      scrollY: scrollLength,
      duration: (scrollLength / this.SPEED) * 1000,
      ease: 'Linear',
      onComplete: () => { this.done = true; },
    });

    // 返回按钮：常驻右下，不随相机滚
    const bw = 132, bh = 42;
    const bx = width - bw / 2 - 14;
    const by = height - bh / 2 - 14;
    this.retBtn = new RoundedPanel(this, bx, by, bw, bh, UI.secondary)
      .setStrokeStyle(2, UI.secondaryStroke)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(900);
    attachPressFeedback(this.retBtn);
    this.add.text(bx, by, '返 回 主 界 面', {
      fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.main, fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(901);

    this.retBtn.on('pointerdown', () => this.goBack());
    this.input.keyboard?.once('keydown-ESC', () => this.goBack());
    // 滚完自动弹出一次提示，告诉玩家可以点了
    this.tweens.add({
      targets: this.retBtn,
      alpha: { from: 1, to: 0.86 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      delay: 200,
    });
  }

  private goBack() {
    if (!this.done && !this.confirmEarly()) return;
    Sfx.select();
    goTo(this, 'Menu');
  }

  /** 没滚完就点返回：第一次只是提醒，返回 false 让玩家确认 */
  private earlyWarned = false;
  private confirmEarly(): boolean {
    if (this.earlyWarned) return true;
    this.earlyWarned = true;
    const { width, height } = this.scale;
    const tip = this.add.text(width / 2, height - 64, '再点一次确认跳过名单', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#f0c85a', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(901);
    this.tweens.add({ targets: tip, alpha: 0, delay: 1600, duration: 500,
      onComplete: () => { tip.destroy(); this.earlyWarned = false; } });
    return false;
  }
}
