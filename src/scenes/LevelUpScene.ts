import Phaser from 'phaser';
import type { GameScene, UpgradeOption } from './GameScene';

export class LevelUpScene extends Phaser.Scene {
  private gs!: GameScene;
  private options: UpgradeOption[] = [];
  private vertical = false;

  constructor() { super('LevelUp'); }

  create(data: { game: GameScene }) {
    this.gs = data.game;
    const { width, height } = this.scale;
    this.vertical = width < 640;

    // 遮罩
    this.add.rectangle(0, 0, width, height, 0x000000, 0.72).setOrigin(0).setInteractive();
    this.add.text(width / 2, height * 0.14, '升级！', {
      fontFamily: 'sans-serif', fontSize: '26px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.14 + 30, '选择一项强化', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
    }).setOrigin(0.5);

    this.options = this.gs.buildUpgradeOptions();
    this.renderCards();

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (e.key === '1') this.choose(0);
      if (e.key === '2') this.choose(1);
      if (e.key === '3') this.choose(2);
    });
  }

  private renderCards() {
    const { width, height } = this.scale;
    const n = this.options.length;
    const cardW = this.vertical ? Math.min(width - 48, 360) : Math.min(180, (width - 80) / n);
    const cardH = this.vertical ? 96 : 190;
    const gap = this.vertical ? 14 : 18;

    this.options.forEach((opt, i) => {
      let x: number, y: number;
      if (this.vertical) {
        const totalH = n * cardH + (n - 1) * gap;
        x = width / 2;
        y = height * 0.3 + i * (cardH + gap) + cardH / 2 - totalH / 2 + cardH;
        y = height * 0.28 + i * (cardH + gap) + cardH / 2;
      } else {
        const totalW = n * cardW + (n - 1) * gap;
        x = width / 2 - totalW / 2 + cardW / 2 + i * (cardW + gap);
        y = height * 0.56;
      }
      this.makeCard(opt, i, x, y, cardW, cardH);
    });
  }

  private makeCard(opt: UpgradeOption, index: number, x: number, y: number, w: number, h: number) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0x0e1a24).setStrokeStyle(2, 0x24404f);
    const accent = this.add.rectangle(0, -h / 2 + 4, w - 8, 5, opt.color).setOrigin(0.5, 0);
    c.add([bg, accent]);

    const badge = opt.kind === 'newmove' ? '新招式' : opt.kind === 'upgrade' ? '强化' : '属性';
    const badgeColor = opt.kind === 'newmove' ? '#63c256' : opt.kind === 'upgrade' ? '#f7d02c' : '#449ddf';

    if (this.vertical) {
      const num = this.add.text(-w / 2 + 14, -h / 2 + 14, `${index + 1}`, {
        fontFamily: 'monospace', fontSize: '16px', color: '#449ddf', fontStyle: 'bold',
      });
      const tag = this.add.text(-w / 2 + 34, -h / 2 + 16, badge, { fontFamily: 'sans-serif', fontSize: '11px', color: badgeColor });
      const title = this.add.text(-w / 2 + 14, -h / 2 + 40, opt.title, { fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold' });
      const desc = this.add.text(-w / 2 + 14, -h / 2 + 64, opt.desc, { fontFamily: 'sans-serif', fontSize: '11px', color: '#8fa8b8', wordWrap: { width: w - 40 } });
      c.add([num, tag, title, desc]);
    } else {
      const num = this.add.text(0, -h / 2 + 12, `[${index + 1}]`, { fontFamily: 'monospace', fontSize: '13px', color: '#4c6272' }).setOrigin(0.5, 0);
      const tag = this.add.text(0, -h / 2 + 34, badge, { fontFamily: 'sans-serif', fontSize: '11px', color: badgeColor }).setOrigin(0.5, 0);
      const title = this.add.text(0, -h / 2 + 60, opt.title, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
        wordWrap: { width: w - 24 }, align: 'center',
      }).setOrigin(0.5, 0);
      const desc = this.add.text(0, h / 2 - 20, opt.desc, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#8fa8b8',
        wordWrap: { width: w - 20 }, align: 'center',
      }).setOrigin(0.5, 1);
      c.add([num, tag, title, desc]);
    }

    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setStrokeStyle(2, opt.color))
      .on('pointerout', () => bg.setStrokeStyle(2, 0x24404f))
      .on('pointerdown', () => this.choose(index));
  }

  private choose(i: number) {
    if (i >= this.options.length) return;
    this.options[i].apply();
    this.scene.stop();
    this.gs.resumeFromLevelUp();
  }
}
