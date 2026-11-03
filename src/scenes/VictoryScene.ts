import Phaser from 'phaser';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { UI, TEXT } from '../ui/Theme';
import { attachPressFeedback } from '../ui/Feedback';
import { RoundedPanel } from '../ui/RoundedPanel';

/**
 * 恭喜通关页。
 *
 * 最后一关（stageIndex === STAGE_COUNT-1）通关后不再走 GameOver 结算，
 * 而是先到这里：一行倒计时式的「最后一步」情绪铺垫，再出大字。
 * 点「下一步」才进 Staff 滚动名单。
 */
export class VictoryScene extends Phaser.Scene {
  constructor() { super('Victory'); }

  private canAdvance = false;

  create(data: { stage?: number } = {}) {
    installTextTextureCleanup(this);
    const { width, height } = this.scale;

    // 深墨底 + 一层金色光晕，和大字呼应
    this.add.rectangle(0, 0, width, height, 0x041018, 1).setOrigin(0);
    const glow = this.add.graphics();
    glow.fillStyle(0xd9a730, 0.10);
    glow.fillCircle(width / 2, height * 0.42, Math.min(width, height) * 0.62);
    glow.fillStyle(0xd9a730, 0.07);
    glow.fillCircle(width / 2, height * 0.42, Math.min(width, height) * 0.86);

    // 星屑：缓慢上浮的金色小点，撑住「仪式感」但别抢字
    for (let i = 0; i < 34; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(0.6, 1.8);
      const dot = this.add.circle(x, y, r, 0xf0c85a, Phaser.Math.FloatBetween(0.15, 0.5));
      this.tweens.add({
        targets: dot,
        y: y - Phaser.Math.Between(40, 130),
        alpha: 0,
        duration: Phaser.Math.Between(2600, 5200),
        delay: Phaser.Math.Between(0, 1800),
        repeat: -1,
        onRepeat: () => {
          dot.y = height + 10;
          dot.x = Phaser.Math.Between(0, width);
          dot.alpha = Phaser.Math.FloatBetween(0.15, 0.5);
        },
      });
    }

    // 小标：走完全部关卡的确认
    const kicker = this.add.text(width / 2, height * 0.26, 'ALL STAGES CLEARED', {
      fontFamily: 'sans-serif', fontSize: '10px', color: TEXT.goldDim, letterSpacing: 3,
    } as any).setOrigin(0.5).setAlpha(0);

    // 大字
    const big = this.add.text(width / 2, height * 0.40, '恭 喜 通 关', {
      fontFamily: 'sans-serif', fontSize: '34px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0).setScale(0.86);

    const sub = this.add.text(width / 2, height * 0.40 + 40, '你走完了全部关卡，图鉴已满', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
    }).setOrigin(0.5).setAlpha(0);

    // 光带：大字出来时横扫一次
    const sweep = this.add.rectangle(width / 2, height * 0.40, 0, 3, 0xf0c85a, 0.85)
      .setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: kicker, alpha: 1, duration: 500, delay: 120 });
    this.tweens.add({ targets: sweep, alpha: 0.9, width: Math.min(width * 0.9, 360), duration: 420, delay: 300,
      onComplete: () => this.tweens.add({ targets: sweep, alpha: 0, duration: 700, delay: 260 }) });
    this.tweens.add({
      targets: big, alpha: 1, scale: 1, duration: 620, delay: 480,
      ease: 'Back.easeOut',
      onStart: () => Sfx.win(),
    });
    this.tweens.add({ targets: sub, alpha: 1, duration: 500, delay: 900 });

    // 按钮：大字落定后才可点，避免误触直接跳过
    const btnY = height * 0.72;
    const btn = new RoundedPanel(this, width / 2, btnY, 200, 50, UI.primary)
      .setStrokeStyle(2, UI.primaryStroke)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0);
    attachPressFeedback(btn);
    const btnTxt = this.add.text(width / 2, btnY, '下 一 步', {
      fontFamily: 'sans-serif', fontSize: '17px', color: TEXT.onPrimary, fontStyle: 'bold',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [btn, btnTxt], alpha: 1, duration: 500, delay: 1400,
      onComplete: () => { this.canAdvance = true; } });

    const next = () => {
      if (!this.canAdvance) return;
      this.canAdvance = false;
      Sfx.select();
      goTo(this, 'Staff');
    };
    btn.on('pointerdown', next);
    this.input.keyboard?.once('keydown-SPACE', next);
    this.input.keyboard?.once('keydown-ENTER', next);

    this.add.text(width / 2, height - 26, '空格 / 回车 继续', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#3d5468',
    }).setOrigin(0.5).setAlpha(0.8);

    void data;
  }
}
