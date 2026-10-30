import Phaser from 'phaser';
import { loadSave } from '../data/stats';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { makeCoinIcon, makeUpgradeIcon } from '../ui/Icons';

/** 登录页：只展示信息，点击开始进入两个选择步骤 */
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    const save = loadSave();
    makeCoinIcon(this, 22);
    makeUpgradeIcon(this, 18);

    // ① Logo（自带 PokeSurvivor + 日文副标题，透明底）
    //    按屏幕宽度自适应：左右各留 34px，等比缩放
    const logoW = Math.min(width - 68, 420);
    const logoH = logoW * (235 / 760);
    // 整组（logo + 强化 + 开始）在扣除顶栏和底部提示后垂直居中
    const groupH = logoH + 46 + 38 + 22 + 54;
    const groupTop = Math.max(78, (height - 110 - groupH) / 2);
    const logo = this.add.image(width / 2, groupTop + logoH / 2, 'logo');
    logo.setDisplaySize(logoW, logoH);

    // ④ 左上角：金币（带硬币图标）+ 下方最长生存
    const padX = 18;
    const coinY = 26;
    this.add.image(padX + 11, coinY, 'ui_coin').setDisplaySize(22, 22);
    this.add.text(padX + 28, coinY, `${save.coins}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '17px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    this.add.text(padX, coinY + 24, `最长生存 ${this.fmt(save.bestTime)}`, {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#6f8ea6',
    }).setOrigin(0, 0.5);

    // 构建标记：一眼确认手机跑的是不是最新版（缓存排查用）
    this.add.text(width / 2, height - 12, `build ${__BUILD_ID__}`, {
      fontFamily: 'monospace', fontSize: '9px', color: '#3d5566',
    }).setOrigin(0.5);

    // ⑤ 强化入口：图标 + 「强化」
    // logo 底部留 46px，保证在任何屏幕比例下都不贴住副标题
    const shopY = logo.y + logo.displayHeight / 2 + 46;
    const shopBtn = this.add.rectangle(width / 2, shopY, 140, 38, 0x14293a)
      .setStrokeStyle(1.5, 0x2f6f96).setInteractive({ useHandCursor: true });
    const shopIcon = this.add.image(width / 2 - 34, shopY, 'ui_upgrade').setDisplaySize(18, 18);
    const shopTxt = this.add.text(width / 2 - 18, shopY, '强 化', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#63b4ef', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    shopBtn.on('pointerdown', () => { Sfx.init(); Sfx.click(); goTo(this, 'Shop'); });
    shopBtn.on('pointerover', () => shopBtn.setFillStyle(0x1b3446));
    shopBtn.on('pointerout', () => shopBtn.setFillStyle(0x14293a));
    shopIcon.setDepth(1); shopTxt.setDepth(1);

    // 开始按钮：与强化按钮成一组，间距 22，整体落在 logo 下方的视觉重心
    const btnY = shopY + 38 / 2 + 22 + 54 / 2;
    const btn = this.add.rectangle(width / 2, btnY, 220, 54, 0x449ddf)
      .setStrokeStyle(2, 0x63b4ef).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, btnY, '开 始', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => { Sfx.init(); Sfx.click(); goTo(this, 'TraitSelect'); });
    btn.on('pointerover', () => btn.setFillStyle(0x63b4ef));
    btn.on('pointerout', () => btn.setFillStyle(0x449ddf));

    this.add.text(width / 2, height - 62, '拖动屏幕平移 · 升级时按 1/2/3 选择', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#4c6272',
    }).setOrigin(0.5);

    makeDevButton(this, () => openDevPanel(this));
  }

  private fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
}
