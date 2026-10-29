import Phaser from 'phaser';
import { BASE_STATS, TRAITS, MAX_SLOTS, type PlayerStats, type TraitId } from '../data/stats';

export class Player extends Phaser.Physics.Arcade.Sprite {
  stats: PlayerStats;
  facing: 'down' | 'up' | 'left' | 'right' = 'down';
  hurtTimer = 0;
  moves: string[] = [];
  private followers: Phaser.GameObjects.Image[] = [];
  private followerRadius = 46;
  private bob = 0;

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
    this.setScale(1.15);
  }

  private applyTrait(trait: TraitId) {
    const t = TRAITS.find((x) => x.id === trait);
    if (!t) return;
    if (trait === 'swift') {
      this.stats.speed *= 1.15;
    } else if (trait === 'iron') {
      this.stats.maxHp += 25;
      this.stats.hp = this.stats.maxHp;
      this.stats.damageTakenMul *= 0.9;
    } else if (trait === 'affinity') {
      this.stats.pickup *= 1.4;
      this.stats.expMul *= 1.1;
    }
  }

  addFollower(key: string) {
    const fx = this.x + 0;
    const img = this.scene.add.image(fx, this.y, key).setScale(0.75).setDepth(9);
    this.followers.push(img);
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
    this.setDepth(10 + (this.y / 100000));
  }

  takeDamage(amount: number) {
    if (this.hurtTimer > 0) return;
    this.stats.hp = Math.max(0, this.stats.hp - amount * this.stats.damageTakenMul);
    this.hurtTimer = 0.5;
    this.scene.tweens.add({ targets: this, alpha: 0.3, duration: 80, yoyo: true, repeat: 4 });
  }

  heal(amount: number) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  updateTimers(dt: number) {
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
  }

  get isDead() { return this.stats.hp <= 0; }
}
