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

  constructor() { super('UI'); }

  create(data: { game: GameScene }) {
    this.gs = data.game;
    this.slotIcons = [];  // 场景重启时必须清空，否则引用旧对象
    const { width, height } = this.scale;

    // 顶部：血条
    this.hpBg = this.add.rectangle(160, 30, 240, 16, 0x33121a).setOrigin(0, 0.5).setScrollFactor(0);
    this.hpBar = this.add.rectangle(160, 30, 240, 16, 0x63c256).setOrigin(0, 0.5).setScrollFactor(0);
    this.add.text(160, 44, '', { fontSize: '10px' });

    // 经验条（全宽顶部）
    const barW = Math.min(width - 40, 640);
    this.expBg = this.add.rectangle(width / 2, 8, barW, 6, 0x11202c).setOrigin(0.5, 0);
    this.expBar = this.add.rectangle(width / 2 - barW / 2, 8, 0, 6, 0x449ddf).setOrigin(0, 0);

    // 计时
    this.timeText = this.add.text(width / 2, 24, '0:00', {
      fontFamily: 'monospace', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // 左下：等级 / 击杀
    this.lvText = this.add.text(20, height - 60, 'Lv.1', {
      fontFamily: 'monospace', fontSize: '15px', color: '#449ddf', fontStyle: 'bold',
    });
    this.killText = this.add.text(20, height - 40, '击杀 0', {
      fontFamily: 'monospace', fontSize: '12px', color: '#8fa8b8',
    });

    // 招式槽
    this.slotRoot = this.add.container(0, 0);

    this.scale.on('resize', () => this.relayout());
    this.relayout();

    this.events.on('shutdown', () => { this.scale.off('resize', this.relayout, this); });
  }

  private relayout() {
    const { width } = this.scale;
    if (!this.expBg) return;
    const barW = Math.min(width - 40, 640);
    this.expBg.setPosition(width / 2, 8).setDisplaySize(barW, 6);
    this.expBar.setPosition(width / 2 - barW / 2, 8);
    this.timeText.setPosition(width / 2, 24);
  }

  update() {
    if (!this.gs || !this.gs.player) return;
    const s = this.gs.stats;

    // 血条
    const ratio = Phaser.Math.Clamp(s.hp / s.maxHp, 0, 1);
    // 用 displayWidth 而非 setSize：setSize 不刷新 displayWidth
    this.hpBg.setDisplaySize(240, 16);
    this.hpBar.setDisplaySize(240 * ratio, 16);
    this.hpBar.setFillStyle(ratio > 0.5 ? 0x63c256 : ratio > 0.25 ? 0xf7d02c : 0xd0402c);

    // 经验条
    const er = Phaser.Math.Clamp(this.gs.exp / this.gs.expNext, 0, 1);
    const baseW = this.expBg.displayWidth || Math.min(this.scale.width - 40, 640);
    this.expBar.setDisplaySize(baseW * er, 6);

    // 计时
    const left = Math.max(0, RUN_SECONDS - this.gs.elapsed);
    const m = Math.floor(left / 60), sec = Math.floor(left % 60);
    this.timeText.setText(`${m}:${String(sec).padStart(2, '0')}`);

    this.lvText.setText(`Lv.${this.gs.level}`);
    this.killText.setText(`击杀 ${this.gs.combat.kills}`);

    this.syncSlots();
  }

  private syncSlots() {
    const ids = this.gs.combat.slotIds;
    const { width, height } = this.scale;

    // 需要时创建
    while (this.slotIcons.length < ids.length) {
      const i = this.slotIcons.length;
      const c = this.add.container(0, 0);
      const box = this.add.rectangle(0, 0, 46, 46, 0x0e1a24).setStrokeStyle(2, 0x24404f);
      const icon = this.add.image(0, 0, 'pk_25').setScale(0.55);
      const lv = this.add.text(16, 10, '1', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1, 1);
      c.add([box, icon, lv]);
      (c as any).__icon = icon;
      (c as any).__lv = lv;
      this.slotRoot.add(c);
      this.slotIcons.push(c);
    }

    ids.forEach((id, i) => {
      const c = this.slotIcons[i];
      c.setVisible(true);
      const def = MOVES[id];
      const size = width < 520 ? 40 : 46;
      const gap = size + 6;
      const totalW = ids.length * gap;
      const startX = (width - totalW) / 2 + gap / 2;
      const y = height - (width < 520 ? 44 : 40);
      c.setPosition(startX + i * gap, y);
      const box = c.list[0] as Phaser.GameObjects.Rectangle;
      box.setDisplaySize(size, size);
      box.setStrokeStyle(2, def.color);
      const icon = (c as any).__icon as Phaser.GameObjects.Image;
      icon.setTexture(`pk_${def.pokeId}`);
      icon.setScale(size / 64 * 0.9);
      (c as any).__lv.setText(String(this.gs.combat.getMoveLevel(id)));
    });

    for (let i = ids.length; i < this.slotIcons.length; i++) {
      this.slotIcons[i].setVisible(false);
    }
  }
}
