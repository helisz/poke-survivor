import Phaser from 'phaser';
import { MOVES } from '../data/moves';
import { RUN_SECONDS } from '../data/stats';
import type { GameScene } from './GameScene';

export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private expBar!: Phaser.GameObjects.Rectangle;
  private expBg!: Phaser.GameObjects.Rectangle;
  private timeText!: Phaser.GameObjects.Text;
  private lvText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private slotIcons: Phaser.GameObjects.Container[] = [];
  private slotRoot!: Phaser.GameObjects.Container;

  /** 布局参数，唯一由 relayout() 计算 */
  private L = { hpW: 200, hpH: 14, barW: 300, slotSize: 46, slotGap: 6, slotY: 600 };

  constructor() { super('UI'); }

  create(data: { game: GameScene }) {
    this.gs = data.game;
    this.slotIcons = [];

    this.hpBg = this.add.rectangle(0, 0, 200, 14, 0x33121a).setOrigin(0, 0.5);
    this.hpBar = this.add.rectangle(0, 0, 200, 14, 0x63c256).setOrigin(0, 0.5);

    this.expBg = this.add.rectangle(0, 0, 300, 6, 0x11202c).setOrigin(0, 0);
    this.expBar = this.add.rectangle(0, 0, 0, 6, 0x449ddf).setOrigin(0, 0);

    this.timeText = this.add.text(0, 0, '0:00', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.lvText = this.add.text(0, 0, 'Lv.1', {
      fontFamily: 'monospace', fontSize: '15px', color: '#449ddf', fontStyle: 'bold',
    });
    this.killText = this.add.text(0, 0, '击杀 0', {
      fontFamily: 'monospace', fontSize: '12px', color: '#8fa8b8',
    });

    this.slotRoot = this.add.container(0, 0);

    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.relayout();
  }

  /** 读取手机底部安全区（iPhone 手势条 / Android 导航栏） */
  private readSafeBottom(): number {
    try {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
      document.body.appendChild(el);
      const h = el.getBoundingClientRect().height;
      el.remove();
      if (h > 0) return Math.min(h, 60);
    } catch { /* ignore */ }
    // 兜底：手机浏览器通常有工具栏，多留一截
    return window.innerWidth < 520 ? 24 : 0;
  }

  private onResize() { this.relayout(); }

  /** 所有 UI 坐标的唯一真源 */
  private relayout() {
    if (!this.expBg) return;
    const { width, height } = this.scale;
    const pad = width < 480 ? 8 : 12;
    const narrow = width < 520;

    // 经验条：贴顶，左右留 pad
    const barW = Math.max(120, width - pad * 2);
    this.L.barW = barW;
    this.expBg.setPosition(pad, 6).setDisplaySize(barW, 6);
    this.expBar.setPosition(pad, 6).setDisplaySize(barW * this.expRatio(), 6);

    // 计时器：居中
    this.timeText.setPosition(width / 2, 16).setFontSize(narrow ? 17 : 20);

    // 血条：左上
    const hpW = Math.min(width * 0.46, 240);
    const hpH = narrow ? 12 : 14;
    const hpY = narrow ? 52 : 56;
    this.L.hpW = hpW;
    this.L.hpH = hpH;
    this.hpBg.setPosition(pad, hpY).setDisplaySize(hpW, hpH);
    this.hpBar.setPosition(pad, hpY).setDisplaySize(hpW * this.hpRatio(), hpH);

    // 等级/击杀：血条下方（不贴底，避开招式槽与手机安全区）
    this.lvText.setPosition(pad, hpY + hpH / 2 + 8);
    this.killText.setPosition(pad, hpY + hpH / 2 + 26);

    // 招式槽参数：手机底部手势条/浏览器栏会盖住 → 用安全区 + 额外余量抬高
    const size = narrow ? 38 : 46;
    const safeBottom = this.readSafeBottom();
    const bottomPad = narrow ? 44 + safeBottom : 20;
    this.L.slotSize = size;
    this.L.slotGap = narrow ? 5 : 6;
    this.L.slotY = height - bottomPad - size / 2;

    this.layoutSlots();
  }

  private hpRatio() {
    if (!this.gs || !this.gs.player) return 1;
    return Phaser.Math.Clamp(this.gs.stats.hp / this.gs.stats.maxHp, 0, 1);
  }

  private expRatio() {
    if (!this.gs || !this.gs.expNext) return 0;
    return Phaser.Math.Clamp(this.gs.exp / this.gs.expNext, 0, 1);
  }

  update() {
    if (!this.gs || !this.gs.player) return;

    const ratio = this.hpRatio();
    this.hpBar.setDisplaySize(this.L.hpW * ratio, this.L.hpH);
    this.hpBar.setFillStyle(ratio > 0.5 ? 0x63c256 : ratio > 0.25 ? 0xf7d02c : 0xd0402c);

    this.expBar.setDisplaySize(this.L.barW * this.expRatio(), 6);

    const left = Math.max(0, RUN_SECONDS - this.gs.elapsed);
    const m = Math.floor(left / 60), sec = Math.floor(left % 60);
    this.timeText.setText(`${m}:${String(sec).padStart(2, '0')}`);

    this.lvText.setText(`Lv.${this.gs.level}`);
    this.killText.setText(`击杀 ${this.gs.combat.kills}`);

    this.syncSlots();
  }

  private syncSlots() {
    const ids = this.gs.combat.slotIds;

    while (this.slotIcons.length < ids.length) {
      const c = this.add.container(0, 0);
      const box = this.add.rectangle(0, 0, 46, 46, 0x0e1a24).setStrokeStyle(2, 0x24404f);
      const icon = this.add.image(0, 0, 'pk_25').setScale(0.55);
      const lv = this.add.text(16, 16, '1', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(1, 1);
      c.add([box, icon, lv]);
      (c as any).__icon = icon;
      (c as any).__lv = lv;
      this.slotRoot.add(c);
      this.slotIcons.push(c);
    }

    const size = this.L.slotSize;
    ids.forEach((id, i) => {
      const c = this.slotIcons[i];
      c.setVisible(true);
      const def = MOVES[id];
      const box = c.list[0] as Phaser.GameObjects.Rectangle;
      box.setDisplaySize(size, size);
      box.setStrokeStyle(2, def ? def.color : 0x24404f);
      const icon = (c as any).__icon as Phaser.GameObjects.Image;
      if (def) {
        icon.setTexture(`pk_${def.pokeId}`);
        icon.setScale((size / 64) * 0.9);
      }
      const lv = (c as any).__lv as Phaser.GameObjects.Text;
      lv.setPosition(size / 2 - 3, size / 2 - 3);
      lv.setText(String(this.gs.combat.getMoveLevel(id)));
    });

    for (let i = ids.length; i < this.slotIcons.length; i++) {
      this.slotIcons[i].setVisible(false);
    }

    this.layoutSlots();
  }

  /** 招式槽排列：底部居中，按可见项排布 */
  private layoutSlots() {
    const { width } = this.scale;
    const visible = this.slotIcons.filter((c) => c.visible);
    const n = visible.length;
    if (!n) return;
    const size = this.L.slotSize;
    const gap = this.L.slotGap;
    const totalW = n * size + (n - 1) * gap;
    const startX = (width - totalW) / 2 + size / 2;

    visible.forEach((c, i) => {
      c.setPosition(startX + i * (size + gap), this.L.slotY);
    });
  }
}
