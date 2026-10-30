import Phaser from 'phaser';
import { BASE_STATS, TRAITS, MAX_SLOTS, PLAYER_SCALE, GLOBAL_SCALE, type PlayerStats, type TraitId } from '../data/stats';
import { Sfx } from '../systems/Sfx';

export class Player extends Phaser.Physics.Arcade.Sprite {
  stats: PlayerStats;
  facing: 'down' | 'up' | 'left' | 'right' = 'down';
  hurtTimer = 0;
  moves: string[] = [];
  private followers: Phaser.GameObjects.Image[] = [];
  /** 每个跟随宝可梦脚下一片阴影（浮空 → 阴影比本体更靠下） */
  private followerShadows: Phaser.GameObjects.Ellipse[] = [];
  /** 主角脚下的阴影 */
  private heroShadow?: Phaser.GameObjects.Ellipse;
  private followerRadius = Math.round(46 * GLOBAL_SCALE);
  private bob = 0;
  /** 走路动画相位：只在移动时推进，停下归零 */
  private stepPhase = 0;
  /** 是否正在移动（决定走路动画是否推进） */
  private walking = false;
  /** 基准缩放：构造时记下 PLAYER_SCALE，避免和挤压拉伸互相覆盖 */
  private walkBaseScale = 0;
  /** 最近一次受击：数值 / 序号 / 时间戳，供 UI 显示扣血数字 */
  lastDamage = 0;
  damageSeq = 0;
  damageAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, trait: TraitId) {
    super(scene, x, y, 'ash', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.stats = { ...BASE_STATS };
    this.applyTrait(trait);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.stats.radius, 48 / 2 - this.stats.radius, 48 / 2 - this.stats.radius);
    body.setCollideWorldBounds(true);
    this.setDepth(10);
    // 与普通怪同尺寸（普通怪 0.62 × 0.75 全局缩放 ≈ 0.465）
    this.setScale(PLAYER_SCALE);
    this.walkBaseScale = PLAYER_SCALE;

    // 主角脚下阴影：贴地，宽度跟随角色，压在地面之上、角色之下
    this.heroShadow = scene.add.ellipse(x, y + 14, 34, 13, 0x000000, 0.32)
      .setDepth(6);
  }

  private applyTrait(trait: TraitId) {
    const t = TRAITS.find((x) => x.id === trait);
    if (!t) return;
    switch (trait) {
      case 'swift':    this.stats.speed *= 1.06; break;
      case 'iron':
        this.stats.maxHp += 12;
        this.stats.hp = this.stats.maxHp;
        this.stats.damageTakenMul *= 0.95;
        break;
      case 'affinity':
        this.stats.pickup *= 1.15;
        this.stats.expMul *= 1.05;
        break;
      case 'power':    this.stats.damageMul *= 1.05; break;
      case 'haste':    this.stats.cooldownMul *= 0.96; break;
      case 'vitality':
        this.stats.maxHp += 18;
        this.stats.hp = this.stats.maxHp;
        break;
      case 'scholar':  this.stats.expMul *= 1.08; break;
      case 'magnet':   this.stats.pickup *= 1.25; break;
      case 'guard':    this.stats.damageTakenMul *= 0.92; break;
    }
  }

  /**
   * 限时 buff：吃到「护盾 / 利剑」后开始计时，到点自动撤销。
   * key → 剩余秒数。UI 直接读这张表显示倒计时。
   */
  buffs: Partial<Record<'shield' | 'sword', number>> = {};
  /** 到期时要撤销的加成，到点执行一次 */
  private buffReverts: Partial<Record<'shield' | 'sword', () => void>> = {};

  addFollower(key: string) {
    const fx = this.x + 0;
    const img = this.scene.add.image(fx, this.y, key).setScale(0.375 * GLOBAL_SCALE).setDepth(9);
    this.followers.push(img);
    // 浮空宝可梦的阴影：只画在地上，不跟着本体上浮
    const sh = this.scene.add.ellipse(fx, this.y + 18, 24, 9, 0x000000, 0.26).setDepth(6);
    this.followerShadows.push(sh);
  }

  /** 进化换图：follower 顺序与招式槽一致 */
  updateFollowerTexture(moveId: string, newKey: string) {
    const idx = this.moves.indexOf(moveId);
    if (idx < 0) return;
    const f = this.followers[idx];
    if (!f) return;
    // 进化特效：放大闪光
    f.setTexture(newKey);
    this.scene.tweens.add({
      targets: f, scale: { from: 0.75 * GLOBAL_SCALE, to: 0.375 * GLOBAL_SCALE }, duration: 420, ease: 'Back.easeOut',
    });
    const flash = this.scene.add.circle(f.x, f.y, 26, 0xffffff, 0.85).setDepth(12);
    this.scene.tweens.add({
      targets: flash, scale: 2.4, alpha: 0, duration: 420,
      onComplete: () => flash.destroy(),
    });
  }

  /** 同步跟随宝可梦环绕位置 */
  layoutFollowers() {
    const n = this.followers.length;
    this.followers.forEach((f, i) => {
      const ang = (Math.PI * 2 * i) / Math.max(1, n) - Math.PI / 2 + this.bob * 0.4;
      const tx = this.x + Math.cos(ang) * this.followerRadius;
      const ty = this.y + Math.sin(ang) * this.followerRadius;
      f.setPosition(Phaser.Math.Linear(f.x, tx, 0.25), Phaser.Math.Linear(f.y, ty, 0.25));
      f.setDepth(this.y > f.y ? 8 : 11);
      // 阴影跟随水平位置，但纵向固定偏下 —— 宝可梦是浮空的，
      // 影子落在地面上，玩家能一眼看出「它在飘」
      const sh = this.followerShadows[i];
      if (sh) {
        sh.x = f.x;
        sh.y = f.y + 16;
        sh.setDepth(6);
      }
    });
  }

  followerPositions(): { x: number; y: number }[] {
    return this.followers.map((f) => ({ x: f.x, y: f.y }));
  }

  moveWith(vx: number, vy: number, dt: number) {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len; vy /= len;
      body.setVelocity(vx * this.stats.speed, vy * this.stats.speed);
      if (Math.abs(vx) > Math.abs(vy)) this.facing = vx > 0 ? 'right' : 'left';
      else this.facing = vy > 0 ? 'down' : 'up';
    } else {
      body.setVelocity(0, 0);
    }
    const frameMap = { down: 0, up: 1, left: 2, right: 3 };
    this.setFrame(frameMap[this.facing]);
    this.bob += dt;

    // 走路动画：素材只有 4 个方向各 1 帧，没有脚步分解图，
    // 所以用「上下起伏 + 横向倾斜 + 轻微挤压」模拟迈步。
    if (len > 0) {
      this.walking = true;
      this.stepPhase += dt * 9.5;
    } else {
      this.walking = false;
      this.stepPhase = 0;
    }
    this.applyWalkVisual();
    this.setDepth(10 + (this.y / 100000));
  }

  /**
   * 把走路相位换算成渲染层的变化。只动 displayOrigin 与 scale/rotation，
   * 不改 x/y，所以物理体和碰撞完全不受影响。
   */
  private applyWalkVisual() {
    const base = this.walkBaseScale || this.scaleX || PLAYER_SCALE;
    if (!this.walking) {
      this.setRotation(0);
      this.setScale(base);
      this.setDisplayOrigin(this.width / 2, this.height / 2);
      return;
    }

    const wave = Math.sin(this.stepPhase);
    const lift = wave * 1.6;                       // 上下起伏 ±1.6px
    this.setDisplayOrigin(this.width / 2, this.height / 2 + lift);

    if (this.facing === 'left' || this.facing === 'right') {
      // 横向移动：左右轻微摇晃 + 身体随步伐倾斜
      this.setRotation(wave * 0.06 * (this.facing === 'right' ? 1 : -1));
      this.setScale(base, base * (1 + Math.abs(wave) * 0.05));
    } else {
      // 纵向移动：不旋转，用挤压/拉伸表现迈步节奏
      this.setRotation(0);
      this.setScale(base * (1 - Math.abs(wave) * 0.035), base * (1 + Math.abs(wave) * 0.05));
    }
  }

  /** 受击：闪烁 + 变红，不用半透明（保持角色可见） */
  takeDamage(amount: number) {
    if (this.hurtTimer > 0) return;
    const real = amount * this.stats.damageTakenMul;
    this.stats.hp = Math.max(0, this.stats.hp - real);
    // 供 UI 显示扣血飘字：记录数值 + 序号（同一帧多次伤害可分辨）
    this.lastDamage = real;
    this.damageSeq++;
    this.damageAt = this.scene.time.now;
    this.hurtTimer = 0.5;
    Sfx.hurt();
    this.setTint(0xff6b6b);
    this.scene.time.delayedCall(120, () => {
      if (this.active && this.hurtTimer > 0) this.setTint(0xffffff);
    });
    this.scene.time.delayedCall(240, () => {
      if (this.active) this.clearTint();
    });
  }

  heal(amount: number) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  updateTimers(dt: number) {
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    // 主角阴影贴地跟随，宽度随走路挤压轻微变化
    if (this.heroShadow) {
      this.heroShadow.x = this.x;
      this.heroShadow.y = this.y + 14;
    }
  }

  get isDead() { return this.stats.hp <= 0; }
}
