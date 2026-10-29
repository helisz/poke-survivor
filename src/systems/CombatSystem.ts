import Phaser from 'phaser';
import { MOVES, type MoveDef } from '../data/moves';
import type { EvolutionDef } from '../data/evolutions';
import type { Player } from '../objects/Player';
import type { EnemySystem } from './EnemySystem';

interface ActiveSlot {
  moveId: string;
  level: number;
  timer: number;
  /** 已进化次数（0 = 原始形态） */
  evoStage?: number;
  /** 进化带来的伤害倍率 */
  evoDmgMul?: number;
  /** 进化带来的冷却倍率 */
  evoCdMul?: number;
  /** 进化后的图鉴 ID（换图用） */
  evoPokeId?: number;
  /** 进化后的显示名 */
  evoName?: string;
}

/** 玩家持有的招式 → 自动释放 */
export class CombatSystem {
  private scene: Phaser.Scene;
  private player: Player;
  private enemies: EnemySystem;
  slots: ActiveSlot[] = [];
  private projectiles: Phaser.Physics.Arcade.Group;
  private slashFx: Phaser.GameObjects.Graphics[] = [];
  damageDealt = 0;
  kills = 0;

  onKill?: (x: number, y: number, isElite: boolean, isBoss: boolean) => void;

  constructor(scene: Phaser.Scene, player: Player, enemies: EnemySystem) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.projectiles = scene.physics.add.group({ allowGravity: false, maxSize: 400 });

    // 弹道命中检测
    scene.physics.add.overlap(this.projectiles, enemies.group, (projObj, enemyObj) => {
      const proj = projObj as Phaser.Physics.Arcade.Image;
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!proj.active || !enemy.active) return;
      this.hitEnemy(enemy, proj.getData('damage') as number);
      const pierceLeft = (proj.getData('pierce') as number) ?? 0;
      if (pierceLeft > 0) {
        proj.setData('pierce', pierceLeft - 1);
      } else {
        this.killProjectile(proj);
      }
    });
  }

  hasMove(id: string) { return this.slots.some((s) => s.moveId === id); }
  get slotCount() { return this.slots.length; }
  get slotIds() { return this.slots.map((s) => s.moveId); }

  addMove(id: string) {
    if (this.hasMove(id)) return;
    const def = MOVES[id];
    if (!def) return;
    this.slots.push({ moveId: id, level: 1, timer: def.cooldown * 0.35 });
    this.player.addFollower(`pk_${def.pokeId}`);
    this.player.moves.push(id);
  }

  upgradeMove(id: string) {
    const s = this.slots.find((x) => x.moveId === id);
    if (s) s.level++;
  }

  getMoveLevel(id: string) {
    return this.slots.find((s) => s.moveId === id)?.level ?? 0;
  }

  /** 某招式当前的进化阶段（0 = 未进化） */
  getEvoStage(id: string) {
    return this.slots.find((s) => s.moveId === id)?.evoStage ?? 0;
  }

  /** 某招式进化后的图鉴 ID（未进化返回原始） */
  getDisplayPokeId(moveId: string) {
    const s = this.slots.find((x) => x.moveId === moveId);
    return s?.evoPokeId ?? MOVES[moveId]?.pokeId;
  }

  /** 某招式当前显示名（进化后是进化名） */
  getDisplayName(moveId: string) {
    const s = this.slots.find((x) => x.moveId === moveId);
    return s?.evoName ?? MOVES[moveId]?.name ?? moveId;
  }

  /** 执行进化：换图、叠倍率、记阶段 */
  evolve(moveId: string, evo: EvolutionDef): boolean {
    const slot = this.slots.find((s) => s.moveId === moveId);
    if (!slot) return false;
    slot.evoStage = (slot.evoStage ?? 0) + 1;
    slot.evoDmgMul = (slot.evoDmgMul ?? 1) * evo.dmgMul;
    slot.evoCdMul = (slot.evoCdMul ?? 1) * evo.cdMul;
    slot.evoPokeId = evo.toId;
    slot.evoName = evo.name;
    // 跟随宝可梦换图
    this.player.updateFollowerTexture(moveId, `pk_${evo.toId}`);
    return true;
  }

  private now = 0;

  update(dtMs: number, time: number) {
    this.now = time;
    const followers = this.player.followerPositions();

    this.slots.forEach((slot, i) => {
      const def = MOVES[slot.moveId];
      slot.timer -= dtMs;
      if (slot.timer > 0) return;
      const cdMul = this.player.stats.cooldownMul / (1 + (slot.level - 1) * 0.12) * (slot.evoCdMul ?? 1);
      slot.timer = def.cooldown * cdMul;
      const origin = followers[i] ?? { x: this.player.x, y: this.player.y };
      this.fire(def, slot.level, origin.x, origin.y);
    });

    // 弹道出界回收
    for (const p of this.projectiles.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!p.active) continue;
      const life = (p.getData('life') as number) - dtMs;
      p.setData('life', life);
      if (life <= 0) this.killProjectile(p);
    }
  }

  private nearestEnemy(x: number, y: number, maxDist = 700) {
    let best: Phaser.Physics.Arcade.Sprite | null = null;
    let bestD = maxDist * maxDist;
    this.enemies.forEachActive((e) => {
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    });
    return best as Phaser.Physics.Arcade.Sprite | null;
  }

  private fire(def: MoveDef, level: number, ox: number, oy: number) {
    const slot = this.slots.find((s) => s.moveId === def.id);
    const evoMul = slot?.evoDmgMul ?? 1;
    const dmgMul = this.player.stats.damageMul * (1 + (level - 1) * 0.18) * evoMul;
    const damage = def.baseDamage * dmgMul;

    switch (def.category) {
      case 'projectile': this.fireProjectile(def, damage, ox, oy); break;
      case 'melee': this.fireMelee(def, damage, ox, oy); break;
      case 'aoe': this.fireAoe(def, damage, ox, oy); break;
      case 'aura': this.fireAura(def, damage, ox, oy); break;
      case 'summon':
        if (def.id === 'morningsun') this.player.heal(25 + level * 10);
        break;
    }
  }

  private fireProjectile(def: MoveDef, damage: number, ox: number, oy: number) {
    const target = this.nearestEnemy(ox, oy);
    const count = (def.count ?? 1) + Math.floor((this.getMoveLevel(def.id) - 1) / 2);
    const baseAng = target ? Math.atan2(target.y - oy, target.x - ox) : 0;
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i - (count - 1) / 2) * 0.16 : 0;
      const ang = baseAng + spread;
      const p = this.projectiles.get(ox, oy, 'dot') as Phaser.Physics.Arcade.Image | null;
      if (!p) continue;
      p.setActive(true).setVisible(true);
      p.setTintFill(def.color);
      p.setData('damage', damage);
      p.setData('pierce', def.pierce ?? 0);
      p.setData('life', 1600);
      const speed = def.projectileSpeed ?? 400;
      (p.body as Phaser.Physics.Arcade.Body).setEnable(true);
      (p.body as Phaser.Physics.Arcade.Body).setCircle(6, -2, -2);
      p.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
      p.setDepth(8);
    }
  }

  private fireMelee(def: MoveDef, damage: number, ox: number, oy: number) {
    const target = this.nearestEnemy(ox, oy, (def.range ?? 90) * 1.6);
    const ang = target ? Math.atan2(target.y - oy, target.x - ox) : this.playerAngle();
    const range = (def.range ?? 90) + (this.getMoveLevel(def.id) - 1) * 8;
    const hits = def.count ?? 1;

    // 视觉：扇形
    const g = this.scene.add.graphics().setDepth(9);
    g.fillStyle(def.color, 0.35);
    g.slice(ox, oy, range, ang - 0.7, ang + 0.7, false);
    g.fillPath();
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 180, onComplete: () => g.destroy() });

    // 伤害判定
    for (let h = 0; h < hits; h++) {
      this.enemies.forEachActive((e) => {
        const d = Phaser.Math.Distance.Between(ox, oy, e.x, e.y);
        if (d > range) return;
        const ea = Math.atan2(e.y - oy, e.x - ox);
        let diff = Phaser.Math.Angle.Wrap(ea - ang);
        if (Math.abs(diff) < 0.8) this.hitEnemy(e, damage);
      });
    }
  }

  private fireAoe(def: MoveDef, damage: number, ox: number, oy: number) {
    // AOE 落在玩家身上（自身爆发）
    const cx = this.player.x, cy = this.player.y;
    const radius = (def.range ?? 120) + (this.getMoveLevel(def.id) - 1) * 10;
    const g = this.scene.add.graphics().setDepth(9);
    g.fillStyle(def.color, 0.4);
    g.fillCircle(cx, cy, radius);
    g.lineStyle(3, def.color, 0.9);
    g.strokeCircle(cx, cy, radius);
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: 1.15, scaleY: 1.15, duration: 260, onComplete: () => g.destroy() });
    g.setPosition(0, 0);

    this.enemies.forEachActive((e) => {
      if (Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= radius) this.hitEnemy(e, damage);
    });
  }

  private fireAura(def: MoveDef, damage: number, ox: number, oy: number) {
    const radius = (def.range ?? 110) + (this.getMoveLevel(def.id) - 1) * 9;
    const cx = this.player.x, cy = this.player.y;
    // 简单视觉环
    const ring = this.scene.add.circle(cx, cy, radius, def.color, 0.12).setDepth(2);
    this.scene.tweens.add({ targets: ring, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    this.enemies.forEachActive((e) => {
      if (Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= radius) this.hitEnemy(e, damage);
    });
  }

  private playerAngle() {
    const f = this.player.facing;
    return f === 'down' ? Math.PI / 2 : f === 'up' ? -Math.PI / 2 : f === 'left' ? Math.PI : 0;
  }

  private hitEnemy(e: Phaser.Physics.Arcade.Sprite, damage: number) {
    this.damageDealt += damage;
    const died = this.enemies.damage(e, damage, this.now);
    if (died) {
      const kind = e.getData('kind') as string;
      this.kills++;
      this.onKill?.(e.x, e.y, kind === 'elite', kind === 'boss');
      // 小爆炸粒子感
      const fx = this.scene.add.circle(e.x, e.y, 14, 0xffffff, 0.6).setDepth(8);
      this.scene.tweens.add({ targets: fx, alpha: 0, scale: 2, duration: 200, onComplete: () => fx.destroy() });
    }
  }

  private killProjectile(p: Phaser.Physics.Arcade.Image) {
    (p.body as Phaser.Physics.Arcade.Body).setEnable(false);
    p.setActive(false).setVisible(false);
    p.setVelocity(0, 0);
  }
}
