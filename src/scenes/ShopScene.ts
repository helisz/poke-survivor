import Phaser from 'phaser';
import { PERM_UPGRADES, PERM_DESC, permCost, permTotal, permStep, loadSave, writeSave, PERM_EMPTY, type PermKey } from '../data/stats';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { makeCoinIcon, makePermIcon } from '../ui/Icons';
import { UI, TEXT } from '../ui/Theme';
import { attachPressFeedback } from '../ui/Feedback';
import { RoundedPanel } from '../ui/RoundedPanel';

/**
 * 强化页：用金币购买局外永久升级。
 *
 * 布局：3 列卡片矩阵。卡片上只有图标、名称、等级、价格按钮。
 * 具体数值（单级增益、累计增益）不进卡片 —— 点开卡片才在弹层里看。
 * 这样 9 项能一屏平铺，扫一眼就知道哪个买得起，不被满屏百分比淹。
 */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  private save = loadSave();
  private cards: {
    key: PermKey;
    icon: Phaser.GameObjects.Image;
    nameText: Phaser.GameObjects.Text;
    lvText: Phaser.GameObjects.Text;
    panel: RoundedPanel;
    btn: RoundedPanel;
    btnText: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    costIcon: Phaser.GameObjects.Image;
  }[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private recenterCoin: () => void = () => {};
  /** 详情弹层：同一时刻只开一个 */
  private sheet?: Phaser.GameObjects.Container;

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.save = loadSave();
    this.save.perm ??= { ...PERM_EMPTY };
    this.cards = [];
    this.sheet = undefined;

    this.add.rectangle(width / 2, height / 2, width, height, 0x041018);
    makeCoinIcon(this, 22);

    // 标题 + 余额
    this.add.text(width / 2, 30, '强 化', {
      fontFamily: 'sans-serif', fontSize: '22px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5);

    this.coinText = this.add.text(width / 2 + 11, 58, '', {
      fontFamily: 'sans-serif', fontSize: '17px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const coinIcon = this.add.image(width / 2 - 4, 58, 'ui_coin').setDisplaySize(20, 20);
    this.recenterCoin = () => {
      const total = 20 + 4 + this.coinText.width;
      coinIcon.x = width / 2 - total / 2 + 10;
      this.coinText.x = coinIcon.x + 14;
    };

    this.buildGrid(width, height);
    this.buildFooter(width, height);
    this.refresh();
  }

  /** 3 列卡片矩阵 */
  private buildGrid(width: number, height: number) {
    const COLS = 3;
    const top = Math.max(94, height * 0.115);
    const bottom = height - 74;          // 给底部两个按钮让位
    const rowCount = Math.ceil(PERM_UPGRADES.length / COLS);
    const gapX = 10;
    const gapY = 10;
    const gridW = Math.min(width - 28, 520);
    const left = width / 2 - gridW / 2;
    const cardW = (gridW - gapX * (COLS - 1)) / COLS;
    // 卡片比例放宽一点：等级行和购买按钮之间原来只隔 4px，挤在一起看不清
    const cardH = Math.min(cardW * 1.46, (bottom - top - gapY * (rowCount - 1)) / rowCount);

    PERM_UPGRADES.forEach((u, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = left + col * (cardW + gapX) + cardW / 2;
      const cy = top + row * (cardH + gapY) + cardH / 2;

      const panel = new RoundedPanel(this, cx, cy, cardW, cardH, 0x0b1721, 1, { radius: 12 })
        .setStrokeStyle(1.5, 0x1e3444)
        .setInteractive({ useHandCursor: true });
      attachPressFeedback(panel);
      panel.on('pointerdown', () => this.openSheet(u.key));

      // 图标：卡片上方约 40% 的位置
      const iconKey = makePermIcon(this, u.key);
      const iconSize = Math.min(cardW * 0.42, 46);
      const icon = this.add.image(cx, cy - cardH * 0.27, iconKey ?? 'ui_coin')
        .setDisplaySize(iconSize, iconSize);

      const nameText = this.add.text(cx, cy - cardH * 0.01, u.name, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#cfe4f5', fontStyle: 'bold',
      }).setOrigin(0.5);

      const lvText = this.add.text(cx, cy + cardH * 0.15, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fb3cc',
      }).setOrigin(0.5);

      // 购买按钮：贴卡片下沿，宽度几乎占满
      const btnW = cardW - 16;
      const btnH = 26;
      const btnY = cy + cardH / 2 - btnH / 2 - 7;
      const btn = new RoundedPanel(this, cx, btnY, btnW, btnH, UI.primary, 1, { radius: 8 })
        .setStrokeStyle(1, UI.primaryStroke);
      // 点按钮直接买，不弹详情 —— 高频操作少一步
      btn.on('pointerdown', () => this.buy(u.key));

      const btnText = this.add.text(cx, btnY, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#041018', fontStyle: 'bold',
      }).setOrigin(0.5);

      const cost = this.add.text(cx, btnY, '', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#041018', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const costIcon = this.add.image(cx, btnY, 'ui_coin').setDisplaySize(12, 12);

      this.cards.push({ key: u.key, icon, nameText, lvText, panel, btn, btnText, cost, costIcon });
    });
  }

  private buildFooter(width: number, height: number) {
    const by = height - 36;
    const reset = new RoundedPanel(this, width / 2 - 72, by, 136, 36, 0x3a1f22, 1, { radius: 9 })
      .setStrokeStyle(1.5, 0x6f3a3f).setInteractive({ useHandCursor: true });
    attachPressFeedback(reset);
    this.add.text(width / 2 - 72, by, '重置强化', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#e08a90', fontStyle: 'bold',
    }).setOrigin(0.5);
    reset.on('pointerdown', () => this.resetAll());

    const back = new RoundedPanel(this, width / 2 + 72, by, 120, 36, 0x1c3344, 1, { radius: 9 })
      .setStrokeStyle(1.5, 0x2f4b60).setInteractive({ useHandCursor: true });
    attachPressFeedback(back);
    this.add.text(width / 2 + 72, by, '返 回', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#9cc4dc', fontStyle: 'bold',
    }).setOrigin(0.5);
    back.on('pointerdown', () => { Sfx.click(); goTo(this, 'Menu'); });
  }

  /**
   * 点卡片弹出的详情层。
   *
   * 具体数值只在这里出现：累计增益、单级增益、满级上限。
   * 卡片上刻意不写百分比，是为了 9 项能在手机上平铺成一屏。
   */
  private openSheet(key: PermKey) {
    if (this.sheet) { this.sheet.destroy(); this.sheet = undefined; }
    Sfx.click();

    const { width, height } = this.scale;
    const def = PERM_UPGRADES.find((u) => u.key === key)!;
    const lv = this.save.perm[key];
    const maxed = lv >= def.max;

    const c = this.add.container(0, 0).setDepth(200).setData('key', key);

    // 遮罩：点空白关闭
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.62)
      .setInteractive();
    dim.on('pointerdown', () => { this.closeSheet(); });
    c.add(dim);

    const sheetW = Math.min(width - 44, 330);
    const sheetH = 344;
    const sy = height / 2;

    const panel = new RoundedPanel(this, width / 2, sy, sheetW, sheetH, 0x0f1f2c, 1, { radius: 16 })
      .setStrokeStyle(1.5, 0x2a4559);
    c.add(panel);

    // 吞掉弹层上的点击，别穿透到遮罩把自己关了
    const blocker = this.add.rectangle(width / 2, sy, sheetW, sheetH, 0x000000, 0)
      .setInteractive();
    c.add(blocker);

    const top = sy - sheetH / 2;
    const iconKey = makePermIcon(this, key);
    c.add(this.add.image(width / 2, top + 44, iconKey ?? 'ui_coin').setDisplaySize(46, 46));

    c.add(this.add.text(width / 2, top + 84, def.name, {
      fontFamily: 'sans-serif', fontSize: '19px', color: '#e6f2fc', fontStyle: 'bold',
    }).setOrigin(0.5));

    c.add(this.add.text(width / 2, top + 108, `等级 ${lv} / ${def.max}`, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#8fb3cc',
    }).setOrigin(0.5));

    // 作用说明：写清这一项到底加的是什么，光看「锐眼」「怒击」猜不出来
    c.add(this.add.text(width / 2, top + 132, PERM_DESC[key] ?? '', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#7fa8c4',
      align: 'center', wordWrap: { width: sheetW - 48 },
    }).setOrigin(0.5, 0));

    // 数值区
    const lines: [string, string][] = [];
    if (key === 'gamble') {
      lines.push(['作用', '每局升级多一次重掷']);
      lines.push(['当前', lv > 0 ? `每局重掷 +${lv} 次（共 ${3 + lv} 次）` : '尚未强化（保底 3 次）']);
      lines.push([maxed ? '状态' : '下一级', maxed ? '已达上限' : '再 +1 次重掷']);
    } else {
      const pct = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`;
      const nextLv = maxed ? def.max : lv + 1;
      lines.push(['累计增益', lv > 0 ? `+${pct(permTotal(key, lv))}` : '尚未强化']);
      lines.push([maxed ? '本级增益' : '下一级增益', `+${pct(permStep(key, nextLv))}`]);
      lines.push(['满级累计', `+${pct(permTotal(key, def.max))}`]);
    }

    lines.forEach(([label, value], i) => {
      const ly = top + 178 + i * 26;
      c.add(this.add.text(width / 2 - sheetW / 2 + 24, ly, label, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#6f8ea6',
      }).setOrigin(0, 0.5));
      c.add(this.add.text(width / 2 + sheetW / 2 - 24, ly, value, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#cfe4f5', fontStyle: 'bold',
      }).setOrigin(1, 0.5));
    });

    // 购买按钮 / 已满
    const by = top + sheetH - 44;
    if (maxed) {
      c.add(new RoundedPanel(this, width / 2, by, 160, 40, UI.disabled, 1, { radius: 10 }));
      c.add(this.add.text(width / 2, by, '已达上限', {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#7a8fa0', fontStyle: 'bold',
      }).setOrigin(0.5));
    } else {
      const price = permCost(key, lv);
      const afford = this.save.coins >= price;
      const b = new RoundedPanel(this, width / 2, by, 180, 40, afford ? UI.primary : UI.disabled, 1, { radius: 10 })
        .setStrokeStyle(1.2, afford ? UI.primaryStroke : 0x2a3b48)
        .setInteractive({ useHandCursor: true });
      attachPressFeedback(b);
      b.on('pointerdown', () => this.buy(key));
      c.add(b);

      const ic = this.add.image(0, by, 'ui_coin').setDisplaySize(15, 15)
        .setAlpha(afford ? 1 : 0.45);
      const label = this.add.text(0, by, `${price}`, {
        fontFamily: 'sans-serif', fontSize: '15px', color: afford ? '#041018' : '#7a8fa0', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const blockW = 15 + 4 + label.width;
      ic.setX(width / 2 - blockW / 2 + 7.5);
      label.setX(ic.x + 11.5);
      c.add(ic);
      c.add(label);
    }

    // 右上角关闭
    const close = this.add.text(width / 2 + sheetW / 2 - 22, top + 22, '×', {
      fontFamily: 'sans-serif', fontSize: '22px', color: '#6f8ea6', fontStyle: 'bold',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => { Sfx.click(); this.closeSheet(); });
    c.add(close);

    this.sheet = c;
  }

  private closeSheet() {
    this.sheet?.destroy();
    this.sheet = undefined;
  }

  private buy(key: PermKey) {
    Sfx.click();
    const def = PERM_UPGRADES.find((u) => u.key === key)!;
    const lv = this.save.perm[key];
    if (lv >= def.max) return;
    const price = permCost(key, lv);
    if (this.save.coins < price) {
      Sfx.hurt();
      this.tweens.add({ targets: this.coinText, scaleX: 1.2, scaleY: 1.2, duration: 90, yoyo: true });
      return;
    }
    this.save.coins -= price;
    this.save.perm[key] = lv + 1;
    writeSave(this.save);
    Sfx.select();
    this.refresh();
  }

  /** 全部归零，并把历史花费全额退回余额 */
  private resetAll() {
    let refund = 0;
    for (const u of PERM_UPGRADES) {
      const lv = this.save.perm[u.key];
      for (let i = 0; i < lv; i++) refund += permCost(u.key, i);
    }
    if (refund === 0) { Sfx.hurt(); return; }
    for (const u of PERM_UPGRADES) this.save.perm[u.key] = 0;
    this.save.coins += refund;
    writeSave(this.save);
    Sfx.select();
    this.flashRefund(refund);
    this.refresh();
  }

  private flashRefund(amount: number) {
    const { width, height } = this.scale;
    const t = this.add.text(width / 2, height / 2, `退还 ${amount} 金币`, {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#ffd75e', fontStyle: 'bold',
      stroke: '#041018', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(99);
    this.tweens.add({
      targets: t, y: height / 2 - 62, alpha: 0, duration: 1100,
      ease: 'Quad.Out', onComplete: () => t.destroy(),
    });
  }

  private refresh() {
    this.coinText.setText(`${this.save.coins}`);
    this.recenterCoin();
    for (const c of this.cards) {
      const def = PERM_UPGRADES.find((u) => u.key === c.key)!;
      const lv = this.save.perm[c.key];
      const maxed = lv >= def.max;
      c.lvText.setText(`${lv}/${def.max}`);

      if (maxed) {
        c.btnText.setText('已满').setVisible(true);
        c.cost.setText('').setVisible(false);
        c.costIcon.setVisible(false);
        c.btn.setFillStyle(UI.disabled).disableInteractive();
        c.panel.setStrokeStyle(1.5, 0x2a4559);
      } else {
        const price = permCost(c.key, lv);
        const afford = this.save.coins >= price;
        c.btnText.setVisible(false);
        c.cost.setText(`${price}`).setVisible(true);
        c.costIcon.setVisible(true);
        // 硬币 + 数字成组居中，位数变化不会左右跳
        const iconW = 12, gap = 3;
        const blockW = iconW + gap + c.cost.width;
        const startX = c.btn.x - blockW / 2;
        c.costIcon.setX(startX + iconW / 2);
        c.cost.setX(startX + iconW + gap);
        c.btn.setFillStyle(afford ? UI.primary : UI.disabled).setInteractive({ useHandCursor: true });
        c.cost.setColor(afford ? '#041018' : '#7a8fa0');
        c.costIcon.setAlpha(afford ? 1 : 0.45);
        // 买得起的卡片描边亮一档，扫一眼就知道该点哪
        c.panel.setStrokeStyle(1.5, afford ? 0x2f5a76 : 0x1e3444);
      }
    }
    // 弹层开着就同步刷新，买完等级变了数字要跟上
    const opened = this.sheet?.getData('key') as PermKey | undefined;
    if (opened) this.openSheet(opened);
  }
}
