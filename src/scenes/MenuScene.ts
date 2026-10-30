import Phaser from 'phaser';
import { loadSave } from '../data/stats';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { makeCoinIcon } from '../ui/Icons';
import { MenuBackdrop } from '../ui/MenuBackdrop';

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

    // ① Logo —— 往上挪，靠顶部
    const logoW = Math.min(width - 68, 400);
    const logoH = logoW * (235 / 760);
    const logo = this.add.image(width / 2, 22 + logoH / 2, 'logo')
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

    // ③ 底部操作区：强化（无图标）+ 开始，回到屏幕底部
    const bottomY = height - 96;
    const shopW = 132;
    const shopH = 46;
    const shopX = width / 2 - 78;
    const shopBtn = this.add.rectangle(shopX, bottomY, shopW, shopH, 0x14293a, 0.88)
      .setStrokeStyle(1.5, 0x2f6f96).setInteractive({ useHandCursor: true }).setDepth(20);
    this.add.text(shopX, bottomY, '强 化', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#63b4ef', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    shopBtn.on('pointerdown', () => { Sfx.init(); Sfx.click(); goTo(this, 'Shop'); });
    shopBtn.on('pointerover', () => shopBtn.setFillStyle(0x1b3446, 0.95));
    shopBtn.on('pointerout', () => shopBtn.setFillStyle(0x14293a, 0.88));

    const goX = width / 2 + 78;
    const btn = this.add.rectangle(goX, bottomY, shopW, shopH, 0x449ddf)
      .setStrokeStyle(2, 0x63b4ef).setInteractive({ useHandCursor: true }).setDepth(20);
    this.add.text(goX, bottomY, '开 始', {
      fontFamily: 'sans-serif', fontSize: '17px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    btn.on('pointerdown', () => { Sfx.init(); Sfx.click(); goTo(this, 'TraitSelect'); });
    btn.on('pointerover', () => btn.setFillStyle(0x63b4ef));
    btn.on('pointerout', () => btn.setFillStyle(0x449ddf));

    // 底部提示 + 构建标记
    this.add.text(width / 2, height - 52, '拖动屏幕平移 · 升级时按 1/2/3 选择', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#a8c4d8',
    }).setOrigin(0.5).setDepth(20).setShadow(0, 1, '#041018', 3);

    this.add.text(width / 2, height - 12, `build ${__BUILD_ID__}`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#5a7484',
    }).setOrigin(0.5).setDepth(20).setShadow(0, 1, '#041018', 3);

    makeDevButton(this, () => openDevPanel(this));
  }

  update(_time: number, delta: number) {
    this.backdrop?.update(delta);
  }

  private fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
}
