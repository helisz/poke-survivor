import Phaser from 'phaser';
import { loadSave } from '../data/stats';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';
import { Sfx } from '../systems/Sfx';

/** 登录页：只展示信息，点击开始进入两个选择步骤 */
export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    const save = loadSave();

    this.add.text(width / 2, height * 0.20, 'POKE SURVIVOR', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif',
      fontSize: '34px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.20 + 36, '宝可梦幸存者 · 草原试炼', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#7fa8c0',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.20 + 54, 'ポケモンサバイバー · 草原の試練', {
      fontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
      fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.20 + 84, `金币 ${save.coins}   最长生存 ${this.fmt(save.bestTime)}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif',
      fontSize: '12px', color: '#a8c4d8',
    }).setOrigin(0.5);

    // 商店入口
    const shopY = height * 0.20 + 112;
    const shopBtn = this.add.rectangle(width / 2, shopY, 132, 32, 0x14293a)
      .setStrokeStyle(1.5, 0x2f6f96).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, shopY, '永 久 强 化', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#63b4ef', fontStyle: 'bold',
    }).setOrigin(0.5);
    shopBtn.on('pointerdown', () => { Sfx.init(); Sfx.click(); this.scene.start('Shop'); });

    // 操作指引
    const tips = [
      '直接拖动屏幕即可平移，不用点方向键',
      '宝可梦会自动攻击，你只管走位',
      '一局 5 分钟，之后 BOSS 来袭 —— 击杀它才算过关',
    ];
    tips.forEach((t, i) => {
      this.add.text(width / 2, height * 0.45 + i * 24, `· ${t}`, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#6f8ca0',
        wordWrap: { width: width - 60 }, align: 'center',
      }).setOrigin(0.5, 0);
    });

    // 开始按钮
    const btnY = height - 120;
    const btn = this.add.rectangle(width / 2, btnY, 220, 54, 0x449ddf)
      .setStrokeStyle(2, 0x63b4ef).setInteractive({ useHandCursor: true });
    const txt = this.add.text(width / 2, btnY, '开 始', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => { Sfx.init(); Sfx.click(); this.scene.start('TraitSelect'); });
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
