import Phaser from 'phaser';
import { loadSave } from '../data/stats';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';
import { openHelpPanel } from '../ui/HelpPanel';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { makeCoinIcon } from '../ui/Icons';
import { MenuBackdrop } from '../ui/MenuBackdrop';
import { UI, TEXT } from '../ui/Theme';

/** 登录页：动态背景 + 顶部 logo + 底部操作区 */
export class MenuScene extends Phaser.Scene {
  private backdrop?: MenuBackdrop;

  constructor() { super('Menu'); }

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    const save = loadSave();
    makeCoinIcon(this, 22);

    // 背景：地面自下而上卷动 + 主角居中 + 飘过的宝可梦 + 技能粒子
    this.backdrop = new MenuBackdrop(this);
    this.events.once('shutdown', () => { this.backdrop = undefined; });

    // ① Logo —— 中心落在屏幕垂直方向 1/3 处
    const logoW = Math.min(width - 68, 400);
    const logoH = logoW * (235 / 760);
    const logo = this.add.image(width / 2, height / 3, 'logo')
      .setDisplaySize(logoW, logoH).setDepth(20);

    // ② 左上角：金币（带硬币图标）+ 下方最长生存
    const padX = 18;
    const coinY = 26;
    this.add.image(padX + 11, coinY, 'ui_coin').setDisplaySize(22, 22).setDepth(20);
    this.add.text(padX + 28, coinY, `${save.coins}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '17px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(20);

    this.add.text(padX, coinY + 24, `最长生存 ${this.fmt(save.bestTime)}`, {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#cfe4f5',
    }).setOrigin(0, 0.5).setDepth(20).setShadow(0, 1, '#041018', 3);

    // ③ 底部操作区：两行布局 —— 上「强化」（小），下「开始」（大）
    const startH = 54;
    const shopH = 40;
    const gap = 16;
    const startY = height - 58 - startH / 2;
    const shopY = startY - startH / 2 - gap - shopH / 2;

    // 强化：小一号的次级按钮
    const shopBtn = this.add.rectangle(width / 2, shopY, 132, shopH, UI.secondary, 0.88)
      .setStrokeStyle(1.5, UI.secondaryStroke).setInteractive({ useHandCursor: true }).setDepth(20);
    this.add.text(width / 2, shopY, '强 化', {
      fontFamily: 'sans-serif', fontSize: '14px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    shopBtn.on('pointerdown', () => { Sfx.init(); Sfx.click(); goTo(this, 'Shop'); });
    shopBtn.on('pointerover', () => shopBtn.setFillStyle(UI.secondaryHover, 0.95));
    shopBtn.on('pointerout', () => shopBtn.setFillStyle(UI.secondary, 0.88));

    // 开始：主按钮，宽度撑开
    const btn = this.add.rectangle(width / 2, startY, 220, startH, UI.primary)
      .setStrokeStyle(2, UI.primaryStroke).setInteractive({ useHandCursor: true }).setDepth(20);
    this.add.text(width / 2, startY, '开 始', {
      fontFamily: 'sans-serif', fontSize: '19px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    btn.on('pointerdown', () => { Sfx.init(); Sfx.click(); goTo(this, 'TraitSelect'); });
    btn.on('pointerover', () => btn.setFillStyle(UI.primaryLight));
    btn.on('pointerout', () => btn.setFillStyle(UI.primary));

    // 构建标识：标签·迭代数 · 日期 时间
    // 草地纹理会把细字冲淡 → 黑描边保证纯白可读
    const S = __BUILD_STAMP__;
    this.add.text(width / 2, height - 12, `${S.tag}·${S.iter} · ${S.date} ${S.time}`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    makeDevButton(this, () => openDevPanel(this));
    this.makeHelpButton(width);
  }

  /** 右上角问号：打开操作说明（齿轮左侧，同样的金色圆钮） */
  private makeHelpButton(width: number) {
    const TOP_Y = (width < 640 ? 52 : 56) - 2;
    const x = width - 34 - 44;
    const btn = this.add.container(x, TOP_Y).setDepth(1900);
    const bg = this.add.circle(0, 0, 17, UI.secondary, 0.92)
      .setStrokeStyle(1.5, UI.primaryStroke, 0.75).setInteractive({ useHandCursor: true });
    const q = this.add.text(0, 0, '?', {
      fontFamily: 'sans-serif', fontSize: '18px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add([bg, q]);
    bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      Sfx.click();
      openHelpPanel(this);
    });
    bg.on('pointerover', () => bg.setFillStyle(UI.secondaryHover, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(UI.secondary, 0.92));
    this.scale.on('resize', () => btn.setPosition(this.scale.width - 34 - 44, TOP_Y));
  }

  update(_time: number, delta: number) {
    this.backdrop?.update(delta);
  }

  private fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
}
