import Phaser from 'phaser';
import { PERM_UPGRADES, permCost, loadSave, writeSave, type PermKey } from '../data/stats';
import { Sfx } from '../systems/Sfx';

/**
 * 商店：用金币购买局外永久升级。
 * 布局为纵向列表，每行显示 名称 / 当前等级 / 效果 / 价格，点击购买。
 */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  private save = loadSave();
  private rows: { key: PermKey; lvText: Phaser.GameObjects.Text; btn: Phaser.GameObjects.Rectangle; btnText: Phaser.GameObjects.Text; cost: Phaser.GameObjects.Text }[] = [];
  private coinText!: Phaser.GameObjects.Text;

  create() {
    const { width, height } = this.scale;
    this.save = loadSave();
    this.rows = [];

    this.add.rectangle(width / 2, height / 2, width, height, 0x041018);

    this.add.text(width / 2, 46, '永 久 强 化', {
      fontFamily: 'sans-serif', fontSize: '24px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.coinText = this.add.text(width / 2, 82, '', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0.5);

    // 六行列表 —— 手机竖屏下每行高度自适应
    const top = Math.max(112, height * 0.15);
    const bottom = height - 86;
    const rowH = Math.min(78, (bottom - top) / PERM_UPGRADES.length);

    PERM_UPGRADES.forEach((u, i) => {
      const cy = top + i * rowH + rowH / 2;
      const w = Math.min(width - 40, 420);
      const left = width / 2 - w / 2;

      this.add.rectangle(width / 2, cy, w, rowH - 8, 0x0b1721)
        .setStrokeStyle(1.5, 0x1e3444);

      const name = this.add.text(left + 16, cy - 16, u.name, {
        fontFamily: 'sans-serif', fontSize: '16px', color: '#cfe4f5', fontStyle: 'bold',
      });
      const lvText = this.add.text(left + 16, cy + 6, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#6f8ea6',
      });
      const desc = this.add.text(left + 90, cy - 16, u.desc, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#8fb3cc',
      });

      // 购买按钮
      const bw = 84;
      const bx = width / 2 + w / 2 - bw / 2 - 12;
      const btn = this.add.rectangle(bx, cy, bw, rowH - 26, 0x449ddf)
        .setStrokeStyle(1.5, 0x63b4ef).setInteractive({ useHandCursor: true });
      const btnText = this.add.text(bx, cy - 8, '购买', {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#041018', fontStyle: 'bold',
      }).setOrigin(0.5);
      const cost = this.add.text(bx, cy + 10, '', {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#1a3546',
      }).setOrigin(0.5);

      btn.on('pointerdown', () => this.buy(u.key));

      this.rows.push({ key: u.key, lvText, btn, btnText, cost });
      void name; void desc;
    });

    // 返回
    const back = this.add.rectangle(width / 2, height - 44, 150, 42, 0x1c3344)
      .setStrokeStyle(1.5, 0x2f4b60).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, height - 44, '返 回', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#9cc4dc', fontStyle: 'bold',
    }).setOrigin(0.5);
    back.on('pointerdown', () => { Sfx.click(); this.scene.start('Menu'); });

    this.refresh();
  }

  private buy(key: PermKey) {
    const def = PERM_UPGRADES.find((u) => u.key === key)!;
    const lv = this.save.perm[key];
    if (lv >= def.max) return;
    const price = permCost(key, lv);
    if (this.save.coins < price) {
      Sfx.hurt();
      this.flashCoin();
      return;
    }
    this.save.coins -= price;
    this.save.perm[key] = lv + 1;
    writeSave(this.save);
    Sfx.select();
    this.refresh();
  }

  private flashCoin() {
    this.tweens.add({ targets: this.coinText, scaleX: 1.25, scaleY: 1.25, duration: 90, yoyo: true });
  }

  private refresh() {
    this.coinText.setText(`金币 ${this.save.coins}`);
    for (const r of this.rows) {
      const def = PERM_UPGRADES.find((u) => u.key === r.key)!;
      const lv = this.save.perm[r.key];
      const maxed = lv >= def.max;
      r.lvText.setText(`Lv.${lv} / ${def.max}`);
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
