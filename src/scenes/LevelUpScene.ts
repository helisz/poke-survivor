import Phaser from 'phaser';
import type { GameScene, UpgradeOption } from './GameScene';
import { attachPressFeedback } from '../ui/Feedback';
import { installTextTextureCleanup } from '../systems/SceneFlow';
import { UI, TEXT } from '../ui/Theme';

export class LevelUpScene extends Phaser.Scene {
  private gs!: GameScene;
  private options: UpgradeOption[] = [];
  private vertical = false;
  /** 卡片容器：重掷时整体清空重画 */
  private cardGroup!: Phaser.GameObjects.Container;
  /** 最后一张卡的下沿 y，用于把重掷按钮贴上去 */
  private lastCardBottom = 0;
  /** 重掷按钮的容器（重掷/改布局时整体重排） */
  private rerollBox?: Phaser.GameObjects.Container;

  constructor() { super('LevelUp'); }

  create(data: { game: GameScene }) {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    this.gs = data.game;
    const { width, height } = this.scale;
    this.vertical = width < 640;

    // 遮罩
    this.add.rectangle(0, 0, width, height, 0x000000, 0.72).setOrigin(0).setInteractive();
    this.add.text(width / 2, height * 0.14, '升级！', {
      fontFamily: 'sans-serif', fontSize: '26px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.14 + 30, '选择一项强化', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#8fa8b8',
    }).setOrigin(0.5);

    this.cardGroup = this.add.container(0, 0);
    this.options = this.gs.buildUpgradeOptions();
    this.renderCards();
    this.buildRerollButton(width, height);

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (e.key === '1') this.choose(0);
      if (e.key === '2') this.choose(1);
      if (e.key === '3') this.choose(2);
      if (e.key.toLowerCase() === 'r') this.reroll();
    });
  }

  /**
   * 底部「重掷」按钮：花掉一次重掷换一批新卡。
   *
   * 次数由铺面外的「赌神」升级决定（每局 0~3 次），用完按钮变灰。
   * 重掷不消耗等级，只是重摇三张卡。
   */
  private buildRerollButton(width: number, height: number) {
    // 贴第三张卡正下方居中，比原来小一圈（150×40 → 116×30）
    const w = 116, h = 30;
    const y = Math.min(this.lastCardBottom + 18 + h / 2, height - 24);
    const box = this.add.container(width / 2, y);
    const bg = this.add.rectangle(0, 0, w, h, UI.secondary)
      .setStrokeStyle(2, UI.primaryStroke);
    const label = this.add.text(0, 0, '', {
      fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: TEXT.gold,
    }).setOrigin(0.5);
    box.add([bg, label]);
    this.rerollBox = box;

    const refresh = () => {
      const n = this.gs.rerollsLeft;
      const on = n > 0;
      bg.setFillStyle(on ? UI.secondary : UI.disabled);
      bg.setStrokeStyle(2, on ? UI.primaryStroke : UI.disabledStroke);
      label.setText(on ? `重掷 · 剩 ${n} 次` : '重掷 · 已用完');
      label.setColor(on ? TEXT.gold : TEXT.off);
    };
    this.refreshReroll = refresh;
    refresh();
    // 重掷会重建卡片，按钮跟着新的最后一张卡重新贴位
    this.repositionReroll();

    bg.setInteractive({ useHandCursor: true });
    attachPressFeedback(bg, { scale: 0.94 });
    bg.on('pointerdown', () => this.reroll());
    bg.on('pointerover', () => { if (this.gs.rerollsLeft > 0) bg.setStrokeStyle(2, UI.primary); });
    bg.on('pointerout', () => { if (this.gs.rerollsLeft > 0) bg.setStrokeStyle(2, UI.primaryStroke); });
  }

  private refreshReroll: () => void = () => {};

  /** 把重掷按钮贴到当前最后一张卡的正下方居中 */
  private repositionReroll() {
    if (!this.rerollBox) return;
    const { width, height } = this.scale;
    this.rerollBox.x = width / 2;
    this.rerollBox.y = Math.min(this.lastCardBottom + 18 + 15, height - 24);
  }

  /** 花一次重掷，换一批新卡 */
  private reroll() {
    if (this.gs.rerollsLeft <= 0) return;
    this.gs.rerollsLeft--;
    // 清掉旧卡再画新的（destroy 会递归销毁子对象）
    this.cardGroup.removeAll(true);
    this.options = this.gs.buildUpgradeOptions();
    this.renderCards();
    this.refreshReroll();
    this.repositionReroll();
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
        // 垂直：从屏幕 22% 开始往下排，整体居中偏上
        const totalH = n * cardH + (n - 1) * gap;
        const startY = Math.max(height * 0.20, (height - totalH) / 2 - height * 0.06);
        x = width / 2;
        y = startY + i * (cardH + gap) + cardH / 2;
      } else {
        const totalW = n * cardW + (n - 1) * gap;
        x = width / 2 - totalW / 2 + cardW / 2 + i * (cardW + gap);
        y = height * 0.56;
      }
      this.makeCard(opt, i, x, y, cardW, cardH);
    });

    // 记住最后一张卡的下沿，重掷按钮要贴它正下方居中
    const lastY = this.vertical
      ? Math.max(height * 0.20, (height - (n * cardH + (n - 1) * gap)) / 2 - height * 0.06)
        + (n - 1) * (cardH + gap) + cardH / 2
      : height * 0.56;
    this.lastCardBottom = lastY + cardH / 2;
  }

  private makeCard(opt: UpgradeOption, index: number, x: number, y: number, w: number, h: number) {
    const c = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, w, h, 0x0e1a24).setStrokeStyle(2, UI.cardStroke);
    const accent = this.add.rectangle(0, -h / 2 + 4, w - 8, 5, opt.color).setOrigin(0.5, 0);
    c.add([bg, accent]);

    const badge = opt.kind === 'evolve' ? '★ 进化' : opt.kind === 'newmove' ? '新招式' : opt.kind === 'upgrade' ? '强化' : '属性';
    const badgeColor = opt.kind === 'evolve' ? '#ffd75e' : opt.kind === 'newmove' ? '#63c256' : opt.kind === 'upgrade' ? '#f7d02c' : '#449ddf';
    const isEvo = opt.kind === 'evolve';

    // 进化卡：金色描边 + 进化后宝可梦大图
    if (isEvo) {
      bg.setStrokeStyle(2.5, 0xffd75e);
      accent.setFillStyle(0xffd75e);
    }
    if (isEvo && opt.portraitId) {
      const key = `pk_${opt.portraitId}`;
      if (this.textures.exists(key)) {
        // 卡片内可用高度有限，图必须缩到卡片内
        const maxImgH = this.vertical ? h * 0.62 : h * 0.42;
        const scale = maxImgH / 64;
        const px = this.vertical ? w / 2 - 42 : 0;
        const py = this.vertical ? 4 : -h * 0.08;
        const glow = this.add.circle(px, py, (64 * scale) / 2 + 4, 0xffd75e, 0.16);
        const portrait = this.add.image(px, py, key).setScale(scale);
        c.add([glow, portrait]);
        // 大图下方标注名字
        if (opt.pokeName) {
          const nm = this.add.text(px, py + maxImgH / 2 + 2, opt.pokeName, {
            fontFamily: 'sans-serif', fontSize: '10px', color: '#ffd75e',
          }).setOrigin(0.5, 0);
          c.add(nm);
        }
      }
    }

    // 新招式卡：左上角打一个醒目的 New!（金色斜体、黑色阴影）
    if (opt.kind === 'newmove') {
      // 卡片内左上角，塞在「上沿」和「序号」之间的 14px 窄条里（y 上沿+3）。
      // 序号在 +14 起，New! 只有 8px 高，不会碰到它，也完全不动正文。
      const newTag = this.add.text(-w / 2 + 14, -h / 2 + 14, 'New!', {
        fontFamily: '"Trebuchet MS", "Arial Black", sans-serif',
        fontSize: '10px',
        color: '#ffd75e',
        fontStyle: 'bold italic',
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0, 0).setDepth(6);
      // Phaser 的 Text 需要显式开 setShadow 才生效，样式里的 shadow 字段会被忽略
      newTag.setShadow(2, 2, '#000000', 3, true, true);
      // 轻微跳动，让眼睛容易抓到
      this.tweens.add({
        targets: newTag, scale: 1.12, duration: 620, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
      c.add(newTag);
    }

    if (this.vertical) {
      // 手机竖排卡：文字靠左，宝可梦头像放右边、名字在头像下面
      const hasPoke = !!opt.pokeId && this.textures.exists(`pk_${opt.pokeId}`);
      const slotW = hasPoke ? 54 : 0;
      const textW = w - 40 - slotW;
      // 不用 shiftY：New! 改为绝对定位浮在角上，不占布局空间，
      // 卡片里的序号/标签/标题/描述全部回到原来的位置
      // 新招式卡用 New! 顶掉「序号 + 类型标签」这一行（标题里已写明「新招式」），
      // 其余卡片序号位置不变，三张卡正文全部对齐。
      const isNew = opt.kind === 'newmove';
      const numX = isNew ? -w / 2 + 60 : -w / 2 + 14;
      const num = this.add.text(numX, -h / 2 + 14, isNew ? '' : `${index + 1}`, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '16px', color: TEXT.gold, fontStyle: 'bold',
      });
      const tag = this.add.text(isNew ? -w / 2 + 60 : numX + 22, -h / 2 + 16, isNew ? '' : badge, { fontFamily: 'sans-serif', fontSize: '11px', color: badgeColor, fontStyle: isEvo ? 'bold' : 'normal' });
      const title = this.add.text(-w / 2 + 14, -h / 2 + 40, opt.title, {
        fontFamily: 'sans-serif', fontSize: '15px', color: isEvo ? '#ffd75e' : '#ffffff', fontStyle: 'bold',
        wordWrap: { width: textW },
      });
      const desc = this.add.text(-w / 2 + 14, -h / 2 + 64, opt.desc, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fa8b8',
        wordWrap: { width: textW },
      });
      c.add([num, tag, title, desc]);

      // 进化卡已有左侧大图，不再重复小头像
      if (hasPoke && !isEvo) {
        this.addPokeBadge(c, opt, w / 2 - 32, 0, h);
      }
    } else {
      const num = this.add.text(0, -h / 2 + 12, `[${index + 1}]`, { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '13px', color: '#4c6272' }).setOrigin(0.5, 0);
      const tag = this.add.text(0, -h / 2 + 34, badge, { fontFamily: 'sans-serif', fontSize: '11px', color: badgeColor }).setOrigin(0.5, 0);
      const title = this.add.text(0, -h / 2 + 60, opt.title, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
        wordWrap: { width: w - 24 }, align: 'center',
      }).setOrigin(0.5, 0);
      c.add([num, tag, title]);

      // 桌面横排卡：头像放内容下方、描述上方
      const hasPoke = !!opt.pokeId && this.textures.exists(`pk_${opt.pokeId}`);
      if (hasPoke) {
        this.addPokeBadge(c, opt, 0, 18, h, true);
      }

      const desc = this.add.text(0, h / 2 - 20, opt.desc, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#8fa8b8',
        wordWrap: { width: w - 20 }, align: 'center',
      }).setOrigin(0.5, 1);
      c.add(desc);
    }

    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setStrokeStyle(2, opt.color))
      .on('pointerout', () => bg.setStrokeStyle(2, UI.cardStroke))
      .on('pointerdown', () => {
        // 按下整张卡轻微缩一下 + 压下描边，然后才真正选中
        c.setScale(0.97);
        bg.setStrokeStyle(3, opt.color);
        this.time.delayedCall(110, () => this.choose(index));
      });

    this.cardGroup.add(c);
  }

  /** 在卡片右侧放宝可梦头像 + 名字 */
  private addPokeBadge(
    c: Phaser.GameObjects.Container,
    opt: UpgradeOption,
    x: number,
    y: number,
    cardH: number,
    stacked = false,
  ) {
    const key = `pk_${opt.pokeId}`;
    const size = stacked ? 42 : Math.min(46, cardH * 0.5);
    const scale = size / 64;

    const icon = this.add.image(x, stacked ? y : y - 8, key).setScale(scale);
    c.add(icon);

    const name = this.add.text(x, (stacked ? y : y - 8) + size / 2 + 4, opt.pokeName ?? '', {
      fontFamily: 'sans-serif',
      fontSize: `${stacked ? 10 : 9}px`,
      color: '#a8c4d8',
    }).setOrigin(0.5, 0);
    c.add(name);
  }

  private choose(i: number) {
    if (i >= this.options.length) return;
    this.options[i].apply();
    this.scene.stop();
    this.gs.resumeFromLevelUp();
  }
}
