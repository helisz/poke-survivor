import Phaser from 'phaser';
import { BOSS_POOL, ELITE_POOL, ENEMY_POOL, isFloating } from '../data/pokedex';
import { GLOBAL_SCALE } from '../data/stats';

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
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontStyle: 'bold', fontSize: '13px',
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
      // 终局 BOSS 的血量已由屏幕底部专属血条展示，头顶不再重复画
      if (e.getData('isFinal')) continue;
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

  /** 当前地图主题的专属怪物池（由 GameScene 每帧同步） */
  theme: { enemyPool?: number[]; elitePool?: number[] } | null = null;

  private pickKey(kind: EnemyKind): string {
    let list: number[];
    if (kind === 'boss') list = BOSS_POOL;
    else if (kind === 'elite') list = this.theme?.elitePool?.length ? this.theme.elitePool : ELITE_POOL;
    else list = this.theme?.enemyPool?.length ? this.theme.enemyPool : ENEMY_POOL;
    const id = Phaser.Utils.Array.GetRandom(list);
    return `pk_${id}`;
  }

  /** 每个敌人脚下一片阴影，浮空怪向下偏移 */
  private shadows = new Map<Phaser.Physics.Arcade.Sprite, Phaser.GameObjects.Ellipse>();

  /** 保证该敌人有一片阴影，并按大小/是否浮空摆好 */
  private ensureShadow(e: Phaser.Physics.Arcade.Sprite) {
    const kind = e.getData('kind') as EnemyKind;
    const id = Number(e.texture.key.replace('pk_', ''));
    const floating = isFloating(id);
    // 阴影宽度跟本体视觉宽度走，BOSS/精英更大更淡
    const w = e.displayWidth * (kind === 'boss' ? 0.62 : kind === 'elite' ? 0.7 : 0.78);
    const h = Math.max(4, w * 0.32);
    // 浮空怪：影子比脚底更低，并且更小更淡（离地越高越虚）
    const dy = kind === 'boss' ? 30 : floating ? 20 : 14;
    const alpha = floating ? 0.2 : kind === 'boss' ? 0.3 : 0.26;

    let sh = this.shadows.get(e);
    if (!sh) {
      sh = this.scene.add.ellipse(e.x, e.y + dy, w, h, 0x000000, alpha).setDepth(5);
      this.shadows.set(e, sh);
    } else {
      sh.setSize(w, h).setFillStyle(0x000000, alpha);
    }
    sh.setVisible(e.active);
    sh.setPosition(e.x, e.y + dy);
    sh.setDepth(5);
  }

  spawn(kind: EnemyKind, x: number, y: number, hpMul = 1, speedMul = 1, dmg = 8) {
    const key = this.pickKey(kind);
    let e = this.group.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!e) return null;
    e.setActive(true).setVisible(true);
    e.setTexture(key);
    e.setAngle(0);
    e.setAlpha(1);
    e.setScale((kind === 'boss' ? 2.1 : kind === 'elite' ? 1.35 : 0.62 + Math.random() * 0.08) * GLOBAL_SCALE);

    const baseHp = kind === 'boss' ? 3000 : kind === 'elite' ? 260 : 26;
    const baseSpeed = kind === 'boss' ? 62 : kind === 'elite' ? 92 : 74;

    e.setData('kind', kind);
    e.setData('hp', baseHp * hpMul);
    e.setData('maxHp', baseHp * hpMul);
    // 个体浮动收紧到 0.9~1.08：最慢的怪也比主角慢，玩家永远能拉开距离
    e.setData('speed', baseSpeed * speedMul * (0.9 + Math.random() * 0.18));
    e.setData('dmg', kind === 'boss' ? 26 : kind === 'elite' ? 16 : dmg);
    e.setData('flashUntil', 0);
    e.setData('isBlackened', kind !== 'normal');

    if (kind !== 'normal') this.applyBlacken(e);
    else e.clearTint();

    const body = e.body as Phaser.Physics.Arcade.Body;
    // 判定圈：随 GLOBAL_SCALE 缩小，保持和视觉尺寸贴合
    const base = kind === 'boss' ? 38 : kind === 'elite' ? 26 : 16;
    const r = Math.round(base * GLOBAL_SCALE);
    body.setCircle(r, e.width / 2 - r, e.height / 2 - r);
    body.setEnable(true);
    body.reset(x, y);
    // 立刻摆好阴影，避免第一帧出现「没影子」的闪烁
    this.ensureShadow(e);
    return e;
  }

  /** 场景关闭时把阴影一起清掉，防止重开一局残留 */
  destroy() {
    this.shadows.forEach((sh) => sh.destroy());
    this.shadows.clear();
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
      this.ensureShadow(e);
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
    // 阴影跟着一起收起来，不然地上会留下一个黑点
    this.shadows.get(e)?.setVisible(false);
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
