import Phaser from 'phaser';
import { PERM_UPGRADES, permCost, loadSave, writeSave, PERM_EMPTY, type PermKey } from '../data/stats';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { makeCoinIcon, makePermIcon } from '../ui/Icons';

/**
 * 强化页：用金币购买局外永久升级（每级仅 1-2%）。
 * 每行：大图标 | 名称 + 单级增益 + 等级/累计 | 购买按钮 + 金额（带硬币图标）。
 * 底部「重置强化」——全部归零并把历史花费退回余额。
 */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  private save = loadSave();
  private rows: {
    key: PermKey;
    icon: Phaser.GameObjects.Image;
    lvText: Phaser.GameObjects.Text;
    totalText: Phaser.GameObjects.Text;
    btn: Phaser.GameObjects.Rectangle;
    btnText: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
    costIcon: Phaser.GameObjects.Image;
  }[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private recenterCoin: () => void = () => {};

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.save = loadSave();
    this.save.perm ??= { ...PERM_EMPTY };
    this.rows = [];

    this.add.rectangle(width / 2, height / 2, width, height, 0x041018);
    makeCoinIcon(this, 22);

    // 标题 + 余额（右上角，与主菜单一致的硬币样式）
    this.add.text(width / 2, 34, '强 化', {
      fontFamily: 'sans-serif', fontSize: '22px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    const coinX = width / 2;
    this.coinText = this.add.text(coinX + 11, 62, '', {
      fontFamily: 'sans-serif', fontSize: '17px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    const coinIcon = this.add.image(coinX - 4, 62, 'ui_coin').setDisplaySize(20, 20);
    // 让「图标 + 数字」整体居中；数字变化后需重新对齐
    this.recenterCoin = () => {
      const total = 20 + 4 + this.coinText.width;
      coinIcon.x = width / 2 - total / 2 + 10;
      this.coinText.x = coinIcon.x + 14;
    };
    this.recenterCoin();

    // 六行：大图标居左，文字列对齐，右侧购买块固定宽度
    const top = Math.max(96, height * 0.135);
    const bottom = height - 118;
    const rowH = Math.min(84, (bottom - top) / PERM_UPGRADES.length);
    const w = Math.min(width - 28, 460);
    const left = width / 2 - w / 2;

    const ICON = 44;
    const iconX = left + 12 + ICON / 2;      // 图标左内边距 12
    const textX = iconX + ICON / 2 + 10;     // 文字紧贴图标，间距 10
    const btnW = 92;
    const btnX = left + w - btnW / 2 - 12;

    PERM_UPGRADES.forEach((u, i) => {
      const cy = top + i * rowH + rowH / 2;
      const cardH = rowH - 8;

      this.add.rectangle(width / 2, cy, w, cardH, 0x0b1721)
        .setStrokeStyle(1.5, 0x1e3444);

      // 大图标
      const iconKey = makePermIcon(this, u.key);
      const icon = this.add.image(iconX, cy, iconKey ?? 'ui_coin').setDisplaySize(ICON, ICON);

      // 文字列：三行都以 textX 左对齐
      const line1Y = cy - cardH * 0.26;
      const line2Y = cy;
      const line3Y = cy + cardH * 0.26;

      this.add.text(textX, line1Y, u.name, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#cfe4f5', fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      this.add.text(textX, line2Y, u.desc, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#6f8ea6',
      }).setOrigin(0, 0.5);

      const lvText = this.add.text(textX, line3Y, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fb3cc', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      // 固定列宽：Lv.x/xx 最宽约 52px，确保「累计/尚未强化」在每行都同一竖直线上
      const totalText = this.add.text(textX + 56, line3Y, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#63c256',
      }).setOrigin(0, 0.5);

      // 购买块：按钮 + 下方金额（硬币图标 + 放大数字）
      const btn = this.add.rectangle(btnX, cy - 8, btnW, 34, 0x449ddf)
        .setStrokeStyle(1.5, 0x63b4ef).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(btnX, cy - 8, '购买', {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#041018', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 金额块（图标 + 数字）整体在按钮下方水平居中，图标随数字宽度左移
      const cost = this.add.text(btnX, cy + 17, '', {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#ffd75e', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const costIcon = this.add.image(btnX, cy + 17, 'ui_coin').setDisplaySize(15, 15);

      btn.on('pointerdown', () => this.buy(u.key));

      this.rows.push({ key: u.key, icon, lvText, totalText, btn, btnText, cost, costIcon });
    });

    // 底部：重置 + 返回
    const by = height - 44;
    const reset = this.add.rectangle(width / 2 - 78, by, 150, 40, 0x3a1f22)
      .setStrokeStyle(1.5, 0x6f3a3f).setInteractive({ useHandCursor: true });
    this.add.text(width / 2 - 78, by, '重置强化', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#e08a90', fontStyle: 'bold',
    }).setOrigin(0.5);
    reset.on('pointerdown', () => this.resetAll());

    const back = this.add.rectangle(width / 2 + 78, by, 130, 40, 0x1c3344)
      .setStrokeStyle(1.5, 0x2f4b60).setInteractive({ useHandCursor: true });
    this.add.text(width / 2 + 78, by, '返 回', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#9cc4dc', fontStyle: 'bold',
    }).setOrigin(0.5);
    back.on('pointerdown', () => { Sfx.click(); goTo(this, 'Menu'); });

    this.refresh();
  }

  private buy(key: PermKey) {
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
    for (const r of this.rows) {
      const def = PERM_UPGRADES.find((u) => u.key === r.key)!;
      const lv = this.save.perm[r.key];
      const maxed = lv >= def.max;
      const totalPct = (def.step * lv * 100).toFixed(0);
      r.lvText.setText(`Lv.${lv}/${def.max}`);
      r.totalText.setText(lv > 0 ? `累计 +${totalPct}%` : '尚未强化');
      if (maxed) {
        r.btnText.setText('已满');
        r.cost.setText('');
        r.costIcon.setVisible(false);
        r.btn.setFillStyle(0x1b2f3d).disableInteractive();
      } else {
        const price = permCost(r.key, lv);
        const afford = this.save.coins >= price;
        r.btnText.setText('购买');
        r.cost.setText(`${price}`);
        r.costIcon.setVisible(true);
        // 「图标 + 数字」以按钮中心为基准整体居中。
        // 先量出文本实际宽度再定位，避免不同位数金额左右跳动。
        const iconW = 15;
        const gap = 4;
        const blockW = iconW + gap + r.cost.width;
        const startX = r.btn.x - blockW / 2;
        r.costIcon.setX(startX + iconW / 2);
        r.cost.setX(startX + iconW + gap);
        r.btn.setFillStyle(afford ? 0x449ddf : 0x2a4052);
        // 买不起时文字也灰掉，避免看着像能点
        r.btnText.setColor(afford ? '#041018' : '#5c7a8c');
        r.cost.setColor(afford ? '#ffd75e' : '#7a6b3c');
        r.costIcon.setAlpha(afford ? 1 : 0.45);
        r.btn.setInteractive({ useHandCursor: true });
      }
    }
  }
}
