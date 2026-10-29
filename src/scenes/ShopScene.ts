import Phaser from 'phaser';
import { PERM_UPGRADES, permCost, loadSave, writeSave, PERM_EMPTY, type PermKey } from '../data/stats';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';

/**
 * 商店：用金币购买局外永久升级（每级仅 1-2%）。
 * 每行显示：名称 / 单级增益 / 等级 / 累计增益 / 价格。
 * 底部「重置强化」——全部归零并把历史花费退回余额。
 */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  private save = loadSave();
  private rows: {
    key: PermKey;
    lvText: Phaser.GameObjects.Text;
    totalText: Phaser.GameObjects.Text;
    btn: Phaser.GameObjects.Rectangle;
    btnText: Phaser.GameObjects.Text;
    cost: Phaser.GameObjects.Text;
  }[] = [];
  private coinText!: Phaser.GameObjects.Text;

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.save = loadSave();
    this.save.perm ??= { ...PERM_EMPTY };
    this.rows = [];

    this.add.rectangle(width / 2, height / 2, width, height, 0x041018);

    this.add.text(width / 2, 40, '永 久 强 化', {
      fontFamily: 'sans-serif', fontSize: '22px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.coinText = this.add.text(width / 2, 70, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0.5);

    // 六行列表 —— 手机竖屏下每行高度自适应
    const top = Math.max(94, height * 0.125);
    const bottom = height - 120;
    const rowH = Math.min(74, (bottom - top) / PERM_UPGRADES.length);

    PERM_UPGRADES.forEach((u, i) => {
      const cy = top + i * rowH + rowH / 2;
      const w = Math.min(width - 32, 440);
      const left = width / 2 - w / 2;

      this.add.rectangle(width / 2, cy, w, rowH - 8, 0x0b1721)
        .setStrokeStyle(1.5, 0x1e3444);

      // 名称 + 单级增益
      this.add.text(left + 14, cy - 18, u.name, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#cfe4f5', fontStyle: 'bold',
      });
      this.add.text(left + 14, cy + 1, u.desc, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#6f8ea6',
      });
      // 等级 + 累计增益
      const lvText = this.add.text(left + 14, cy + 18, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fb3cc', fontStyle: 'bold',
      });
      const totalText = this.add.text(left + 92, cy + 18, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#63c256',
      });

      // 购买按钮
      const bw = 76;
      const bx = width / 2 + w / 2 - bw / 2 - 10;
      const btn = this.add.rectangle(bx, cy, bw, rowH - 24, 0x449ddf)
        .setStrokeStyle(1.5, 0x63b4ef).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(bx, cy - 8, '购买', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#041018', fontStyle: 'bold',
      }).setOrigin(0.5);
      const cost = this.add.text(bx, cy + 9, '', {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#1a3546',
      }).setOrigin(0.5);

      btn.on('pointerdown', () => this.buy(u.key));

      this.rows.push({ key: u.key, lvText, totalText, btn, btnText, cost });
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
    this.coinText.setText(`金币 ${this.save.coins}`);
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
        r.btn.setFillStyle(0x1b2f3d).disableInteractive();
      } else {
        const price = permCost(r.key, lv);
        const afford = this.save.coins >= price;
        r.btnText.setText('购买');
        r.cost.setText(`${price}`);
        r.btn.setFillStyle(afford ? 0x449ddf : 0x2a4052);
        r.btn.setInteractive({ useHandCursor: true });
      }
    }
  }
}
