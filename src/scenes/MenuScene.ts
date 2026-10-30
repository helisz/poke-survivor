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

    // ① 日文小标题在最顶
    this.add.text(width / 2, height * 0.10, 'ポケモンサバイバー', {
      fontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
      fontSize: '13px', color: '#5f7a8c',
    }).setOrigin(0.5);

    // ② 主标题
    this.add.text(width / 2, height * 0.10 + 34, 'POKE SURVIVOR', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif',
      fontSize: '34px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    // ③ 副标题（去掉「草原试炼」）
    this.add.text(width / 2, height * 0.10 + 70, '宝可梦幸存者', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#7fa8c0',
    }).setOrigin(0.5);

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
    const shopY = height * 0.10 + 126;
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

    // 开始按钮
    const btnY = height - 120;
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
