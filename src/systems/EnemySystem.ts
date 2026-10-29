import Phaser from 'phaser';
import { ENEMY_POOL, ELITE_POOL, BOSS_POOL } from '../data/pokedex';

export type EnemyKind = 'normal' | 'elite' | 'boss';

/** 敌人用 Phaser Group，并通过池复用 */
export class EnemySystem {
  group: Phaser.Physics.Arcade.Group;
  private scene: Phaser.Scene;
  /** 血条图形层（一次绘制所有敌人血条，比每个敌人挂对象省） */
  private hpGfx: Phaser.GameObjects.Graphics;
  /** 伤害数字池 */
  private dmgPool: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.group = scene.physics.add.group({
      runChildUpdate: false,
      maxSize: 320,
    });
    this.hpGfx = scene.add.graphics().setDepth(30);
  }

  /** 飘出伤害数字 */
  showDamage(x: number, y: number, amount: number, kind: string) {
    const t = this.dmgPool.pop() ?? this.scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontStyle: 'bold', fontSize: '13px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(40);
    t.setActive(true).setVisible(true).setAlpha(1).setScale(1);
    t.setPosition(x + Phaser.Math.Between(-6, 6), y - 8);
    t.setText(String(Math.round(amount)));
    t.setFontSize(kind === 'boss' ? 17 : kind === 'elite' ? 15 : 12);
    t.setColor(kind === 'normal' ? '#ffffff' : '#ffd75e');
    this.scene.tweens.add({
      targets: t, y: t.y - 26, alpha: 0,
      duration: 550, ease: 'Quad.easeOut',
      onComplete: () => { t.setActive(false).setVisible(false); this.dmgPool.push(t); },
    });
  }

  /** 绘制所有存活敌人血条（仅受伤后显示） */
  private drawHpBars() {
    const g = this.hpGfx;
    g.clear();
    for (const e of this.group.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!e.active) continue;
      const hp = e.getData('hp') as number;
      const maxHp = e.getData('maxHp') as number;
      if (!maxHp || hp >= maxHp) continue;  // 满血不显示
      const kind = e.getData('kind') as string;
      const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
      const w = kind === 'boss' ? 54 : kind === 'elite' ? 34 : 20;
      const h = kind === 'boss' ? 5 : 3;
      const x = e.x - w / 2;
      const y = e.y - e.displayHeight / 2 - 8;
      g.fillStyle(0x000000, 0.75); g.fillRect(x - 1, y - 1, w + 2, h + 2);
      const col = ratio > 0.5 ? 0x63c256 : ratio > 0.25 ? 0xf7d02c : 0xd0402c;
      g.fillStyle(col, 1); g.fillRect(x, y, w * ratio, h);
    }
  }

  private pickKey(kind: EnemyKind): string {
    const rnd = this.scene.game.registry;
    const list = kind === 'boss' ? BOSS_POOL : kind === 'elite' ? ELITE_POOL : ENEMY_POOL;
    const id = Phaser.Utils.Array.GetRandom(list);
    return `pk_${id}`;
  }

  spawn(kind: EnemyKind, x: number, y: number, hpMul = 1, speedMul = 1, dmg = 8) {
    const key = this.pickKey(kind);
    let e = this.group.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!e) return null;
    e.setActive(true).setVisible(true);
    e.setTexture(key);
    e.setAngle(0);
    e.setAlpha(1);
    e.setScale(kind === 'boss' ? 2.1 : kind === 'elite' ? 1.35 : 0.62 + Math.random() * 0.08);

    const baseHp = kind === 'boss' ? 3000 : kind === 'elite' ? 260 : 26;
    const baseSpeed = kind === 'boss' ? 62 : kind === 'elite' ? 92 : 74;

    e.setData('kind', kind);
    e.setData('hp', baseHp * hpMul);
    e.setData('maxHp', baseHp * hpMul);
    e.setData('speed', baseSpeed * speedMul * (0.9 + Math.random() * 0.25));
    e.setData('dmg', kind === 'boss' ? 26 : kind === 'elite' ? 16 : dmg);
    e.setData('flashUntil', 0);
    e.setData('isBlackened', kind !== 'normal');

    if (kind !== 'normal') this.applyBlacken(e);
    else e.clearTint();

    const body = e.body as Phaser.Physics.Arcade.Body;
    const r = kind === 'boss' ? 30 : kind === 'elite' ? 20 : 11;
    body.setCircle(r, e.width / 2 - r, e.height / 2 - r);
    body.setEnable(true);
    body.reset(x, y);
    return e;
  }

  /** 黑化：暗色 + 红色描边感（用 tint + alpha） */
  private applyBlacken(e: Phaser.GameObjects.Sprite) {
    e.setTint(0x6a4a7a);
    e.setData('isBlackened', true);
  }

  update(playerX: number, playerY: number, time: number) {
    const kids = this.group.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (const e of kids) {
      if (!e.active) continue;
      const body = e.body as Phaser.Physics.Arcade.Body;
      const ang = Math.atan2(playerY - e.y, playerX - e.x);
      const spd = e.getData('speed') as number;
      body.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
      e.setDepth(6 + e.y / 100000);
      // 命中闪白结束
      const fu = e.getData('flashUntil') as number;
      if (fu && time > fu) {
        if (e.getData('isBlackened')) this.applyBlacken(e); else e.clearTint();
        e.setData('flashUntil', 0);
      }
      // 出界回收
      const dist = Phaser.Math.Distance.Between(e.x, e.y, playerX, playerY);
      if (dist > 2200) this.recycle(e);
    }
    this.drawHpBars();
  }

  damage(e: Phaser.Physics.Arcade.Sprite, amount: number, time: number) {
    const hp = (e.getData('hp') as number) - amount;
    e.setData('hp', hp);
    e.setTint(0xffffff);
    e.setData('flashUntil', time + 70);
    this.showDamage(e.x, e.y, amount, e.getData('kind') as string);
    if (hp <= 0) {
      this.recycle(e);
      return true;
    }
    return false;
  }

  recycle(e: Phaser.Physics.Arcade.Sprite) {
    const body = e.body as Phaser.Physics.Arcade.Body;
    body.setEnable(false);
    e.setActive(false).setVisible(false);
    e.clearTint();
  }

  // 供外部判定：遍历存活敌人
  forEachActive(cb: (e: Phaser.Physics.Arcade.Sprite) => void) {
    for (const e of this.group.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (e.active) cb(e);
    }
  }

  countActive() {
    let n = 0;
    this.forEachActive(() => n++);
    return n;
  }
}
