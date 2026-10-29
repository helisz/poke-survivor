import Phaser from 'phaser';
import { MOVES, type MoveDef } from '../data/moves';
import type { EvolutionDef } from '../data/evolutions';
import type { Player } from '../objects/Player';
import type { EnemySystem } from './EnemySystem';
import { FxSystem, SKILL_FX } from './FxSystem';
import { Sfx } from './Sfx';

interface ActiveSlot {
  moveId: string;
  level: number;
  timer: number;
  /** 本次冷却的总时长（画冷却时钟用） */
  total?: number;
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
  fx: FxSystem;
  damageDealt = 0;
  kills = 0;

  onKill?: (x: number, y: number, isElite: boolean, isBoss: boolean) => void;

  constructor(scene: Phaser.Scene, player: Player, enemies: EnemySystem) {
    this.scene = scene;
    this.player = player;
    this.enemies = enemies;
    this.projectiles = scene.physics.add.group({ allowGravity: false, maxSize: 400 });
    this.fx = new FxSystem(scene);

    // 弹道命中检测
    scene.physics.add.overlap(this.projectiles, enemies.group, (projObj, enemyObj) => {
      const proj = projObj as Phaser.Physics.Arcade.Image;
      const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
      if (!proj.active || !enemy.active) return;
      // 只对「屏幕可见范围内」的敌人造成伤害：
      // 弹道会直线飞出屏幕，若目标在视野外则穿过去不结算
      if (!this.onScreen(enemy.x, enemy.y)) return;
      this.hitEnemy(enemy, proj.getData('damage') as number);

      // 记录命中，供追踪/连锁查重
      const hitList = (proj.getData('hitList') as Phaser.Physics.Arcade.Sprite[]) ?? [];
      if (!hitList.includes(enemy)) hitList.push(enemy);
      proj.setData('hitList', hitList);

      // chain：命中后跳到附近另一个未命中目标（最多 2 次）
      const chainLeft = (proj.getData('chainLeft') as number) ?? 0;
      if (chainLeft > 0) {
        const next = this.nearestEnemyExcluding(proj.x, proj.y, 240, hitList);
        if (next) {
          proj.setData('chainLeft', chainLeft - 1);
          const ang = Math.atan2(next.y - proj.y, next.x - proj.x);
          const sp = Math.hypot(proj.body!.velocity.x, proj.body!.velocity.y) || 400;
          proj.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
          const flash = this.scene.add.circle(proj.x, proj.y, 10, 0xffffff, 0.7).setDepth(9);
          this.scene.tweens.add({ targets: flash, alpha: 0, scale: 2, duration: 180, onComplete: () => flash.destroy() });
          return;   // 连锁后继续飞行，不消耗穿透
        }
      }

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

  /** 冷却进度：1 = 刚放完（满格等待），0 = 就绪。返回 0 表示可立即释放 */
  getCooldownProgress(index: number): number {
    const slot = this.slots[index];
    if (!slot) return 0;
    const total = slot.total ?? slot.timer;
    if (!total || total <= 0) return 0;
    return Phaser.Math.Clamp(slot.timer / total, 0, 1);
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
      slot.total = slot.timer;
      const origin = followers[i] ?? { x: this.player.x, y: this.player.y };
      this.fire(def, slot.level, origin.x, origin.y);
    });

    // 弹道出界回收 + 追踪弹转向 + 炮弹尾焰
    for (const p of this.projectiles.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!p.active) continue;
      if (p.getData('homing')) this.updateHoming(p);
      const life = (p.getData('life') as number) - dtMs;
      p.setData('life', life);
      if (life <= 0) { this.killProjectile(p); continue; }

      // 炮弹类：实时喷尾焰
      const kind = p.getData('fx') as string;
      if (kind === 'shell' || kind === 'laser' || kind === 'bolt') {
        const v = p.body!.velocity;
        const ang = Math.atan2(v.y, v.x);
        this.fx.shellTrail(p, p.x, p.y, ang, p.getData('color') as number, dtMs);
      }
    }

    this.fx.update(dtMs);
  }

  private nearestEnemy(x: number, y: number, maxDist = 700) {
    return this.nearestEnemyExcluding(x, y, maxDist, []);
  }

  /**
   * 屏幕上可见的索敌半径：以玩家为中心，取相机可视区域的半对角线。
   * 保证只打「看得见」的敌人，掉落物不会掉在屏幕外。
   */
  private screenAimRadius(): number {
    const cam = this.scene.cameras.main;
    const halfW = cam.width / cam.zoom / 2;
    const halfH = cam.height / cam.zoom / 2;
    return Math.hypot(halfW, halfH);
  }

  /** 世界坐标是否在当前相机可视矩形内（带一点外扩余量） */
  private onScreen(x: number, y: number, pad = 24): boolean {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    return x >= view.x - pad && x <= view.right + pad
        && y >= view.y - pad && y <= view.bottom + pad;
  }

  /** 最近敌人，跳过 exclude 列表中的目标 */
  private nearestEnemyExcluding(
    x: number, y: number, maxDist: number, exclude: Phaser.Physics.Arcade.Sprite[],
  ) {
    let best: Phaser.Physics.Arcade.Sprite | null = null;
    let bestD = maxDist * maxDist;
    this.enemies.forEachActive((e) => {
      if (exclude.includes(e)) return;
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
      case 'projectile': this.fireProjectile(def, damage, ox, oy); Sfx.shoot(); break;
      case 'melee': this.fireMelee(def, damage, ox, oy); Sfx.slash(); break;
      case 'aoe': this.fireAoe(def, damage, ox, oy); Sfx.shoot(); break;
      case 'aura': this.fireAura(def, damage, ox, oy); Sfx.shoot(); break;
      case 'summon':
        if (def.id === 'morningsun') this.player.heal(25 + level * 10);
        break;
    }
  }

  private fireProjectile(def: MoveDef, damage: number, ox: number, oy: number) {
    const traits = def.traits ?? [];
    const homing = traits.includes('homing');
    const chain = traits.includes('chain');
    const target = this.nearestEnemy(ox, oy, this.screenAimRadius());
    const count = (def.count ?? 1) + Math.floor((this.getMoveLevel(def.id) - 1) / 2);
    const baseAng = target ? Math.atan2(target.y - oy, target.x - ox) : 0;
    // spread 标签：扇形角度更大，否则默认小夹角
    const spreadStep = traits.includes('spread') ? 0.3 : 0.16;
    // 该招式的特效形态
    const fxKind = SKILL_FX[def.id] ?? 'shell';
    const isShell = fxKind === 'shell';

    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i - (count - 1) / 2) * spreadStep : 0;
      const ang = baseAng + spread;
      const p = this.projectiles.get(ox, oy, 'dot') as Phaser.Physics.Arcade.Image | null;
      if (!p) continue;
      p.setActive(true).setVisible(true);
      p.setTintFill(def.color);
      p.setData('damage', damage);
      p.setData('pierce', def.pierce ?? 0);
      p.setData('life', 1600);
      p.setData('moveId', def.id);
      p.setData('color', def.color);
      p.setData('fx', fxKind);
      p.setData('homing', homing);
      p.setData('chain', chain);
      p.setData('chainLeft', chain ? 2 : 0);
      p.setData('hitList', []);          // 已命中目标，避免连锁重复打同一个
      const speed = homing ? (def.projectileSpeed ?? 400) * 0.8 : (def.projectileSpeed ?? 400);
      (p.body as Phaser.Physics.Arcade.Body).setEnable(true);
      (p.body as Phaser.Physics.Arcade.Body).setCircle(6, -2, -2);
      p.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
      p.setDepth(8);

      if (homing) {
        // 追踪弹：稍微放大，视觉上区分
        p.setScale(1.25);
        p.setData('speed', speed);
      } else if (isShell) {
        // 炮弹：弹体更粗壮
        p.setScale(1.55);
      } else {
        p.setScale(1);
      }
    }

    // 出招特效：按形态区分
    if (fxKind === 'bolt') {
      // 闪电系：直接朝最近的敌人劈一道折线
      if (target) this.fx.bolt(ox, oy, target.x, target.y, def.color);
      this.fx.castPulse(ox, oy, def.color, 22);
    } else if (fxKind === 'laser') {
      // 激光系：瞬发一条亮线打到第一个敌人
      if (target) this.fx.laser(ox, oy, target.x, target.y, def.color, 4);
      this.fx.castPulse(ox, oy, def.color, 22);
    } else {
      // 炮弹系：起手能量圈，弹体自己带尾焰
      this.fx.castPulse(ox, oy, def.color, 18);
    }
  }

  /** 追踪弹每帧转向最近的敌人 */
  private updateHoming(p: Phaser.Physics.Arcade.Image) {
    const hitList = (p.getData('hitList') as Phaser.Physics.Arcade.Sprite[]) ?? [];
    const target = this.nearestEnemy(p.x, p.y, Math.min(420, this.screenAimRadius()));
    if (!target || hitList.includes(target)) return;
    const speed = (p.getData('speed') as number) ?? 320;
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    const cur = Math.atan2(p.body!.velocity.y, p.body!.velocity.x);
    const next = Phaser.Math.Angle.RotateTo(cur, want, 0.09);
    p.setVelocity(Math.cos(next) * speed, Math.sin(next) * speed);
  }

  private fireMelee(def: MoveDef, damage: number, ox: number, oy: number) {
    const traits = def.traits ?? [];
    const sweep = traits.includes('sweep');
    const flurry = traits.includes('flurry');

    // sweep 大角度横扫，普通近战窄扇形
    const halfAngle = sweep ? 1.15 : 0.7;
    const range = (def.range ?? 90) + (this.getMoveLevel(def.id) - 1) * 8;
    const hits = def.count ?? 1;

    // sweep 优先贴最近敌人方向；没有敌人时朝面向
    const target = this.nearestEnemy(ox, oy, Math.min(range * 1.8, this.screenAimRadius()));
    const ang = target ? Math.atan2(target.y - oy, target.x - ox) : this.playerAngle();

    // 视觉：刀光弧 + 火花
    const dur = flurry ? 130 : sweep ? 260 : 200;
    this.fx.slash(ox, oy, ang, halfAngle, range, def.color, dur);

    // 连击：补一圈点状爆点，跟横扫区分开
    if (flurry) {
      for (let k = 0; k < 3; k++) {
        const a = ang + (Math.random() - 0.5) * halfAngle * 1.6;
        const r = range * (0.4 + Math.random() * 0.5);
        this.fx.burst(ox + Math.cos(a) * r, oy + Math.sin(a) * r, def.color, 6, 150, 2.6, 220);
      }
    }

    // 命中判定：flurry 只看一帧但打多段，sweep 打全角度
    const targets: Phaser.Physics.Arcade.Sprite[] = [];
    this.enemies.forEachActive((e) => {
      const d = Phaser.Math.Distance.Between(ox, oy, e.x, e.y);
      if (d > range) return;
      const ea = Math.atan2(e.y - oy, e.x - ox);
      const diff = Phaser.Math.Angle.Wrap(ea - ang);
      if (Math.abs(diff) <= halfAngle + 0.1) targets.push(e);
    });

    for (let h = 0; h < hits; h++) {
      targets.forEach((e) => this.hitEnemy(e, damage));
    }
  }

  private fireAoe(def: MoveDef, damage: number, ox: number, oy: number) {
    const traits = def.traits ?? [];
    const slam = traits.includes('slam');
    const shockwave = traits.includes('shockwave');

    // slam：砸向最近敌人位置；否则自身爆发
    let cx = this.player.x, cy = this.player.y;
    if (slam) {
      const t = this.nearestEnemy(ox, oy, Math.min(420, this.screenAimRadius()));
      if (t) { cx = t.x; cy = t.y; }
    }
    const radius = (def.range ?? 120) + (this.getMoveLevel(def.id) - 1) * 10;

    if (slam) {
      // 落点预警圈 → 砸击爆开
      const mark = this.scene.add.circle(cx, cy, radius * 0.3, def.color, 0.15)
        .setStrokeStyle(2, def.color, 0.7).setDepth(9);
      this.scene.tweens.add({
        targets: mark, duration: 180,
        onUpdate: (tw) => mark.setRadius(radius * (0.3 + 0.7 * tw.progress)),
        onComplete: () => {
          mark.destroy();
          // 砸地：径向爆发 + 冲击环
          this.fx.burst(cx, cy, def.color, 26, 320, 4, 480);
          this.fx.shockRing(cx, cy, def.color, radius, 300);
        },
      });
    } else if (shockwave) {
      // 冲击波：多层扩散环，更强的「地面被掀开」感
      this.fx.shockRing(cx, cy, def.color, radius, 340);
      this.scene.time.delayedCall(90, () => this.fx.shockRing(cx, cy, def.color, radius * 0.72, 280));
      this.fx.burst(cx, cy, def.color, 16, 200, 3, 380);
      const inner = this.scene.add.circle(cx, cy, radius, def.color, 0.1).setDepth(8);
      this.scene.tweens.add({ targets: inner, alpha: 0, duration: 320, onComplete: () => inner.destroy() });
    } else {
      // nova：自身爆发 —— 中心闪光 + 径向粒子
      this.fx.burst(cx, cy, def.color, 30, 300, 4.2, 460);
      this.fx.shockRing(cx, cy, def.color, radius, 260);
      const g = this.scene.add.graphics().setDepth(9);
      g.fillStyle(def.color, 0.3);
      g.fillCircle(cx, cy, radius);
      this.scene.tweens.add({
        targets: g, alpha: 0, scaleX: 1.15, scaleY: 1.15, duration: 240,
        onComplete: () => g.destroy(),
      });
    }

    this.enemies.forEachActive((e) => {
      if (Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= radius) this.hitEnemy(e, damage);
    });
  }

  private fireAura(def: MoveDef, damage: number, ox: number, oy: number) {
    // 范围收敛：判定半径按原值一半，每级成长同步缩小
    const radius = (def.range ?? 110) * 0.72 + (this.getMoveLevel(def.id) - 1) * 7;
    const cx = this.player.x, cy = this.player.y;
    // 视觉环：外圈亮边 + 内圈填充，范围更直观
    const ring = this.scene.add.circle(cx, cy, radius, def.color, 0.16).setDepth(2);
    const edge = this.scene.add.circle(cx, cy, radius, def.color, 0)
      .setStrokeStyle(2.5, def.color, 0.55).setDepth(3);
    this.scene.tweens.add({
      targets: [ring, edge], alpha: 0, duration: 340,
      onComplete: () => { ring.destroy(); edge.destroy(); },
    });
    // 环上粒子：绕圈飞散，让光环有「持续灼烧」的感觉
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      this.fx.burst(cx + Math.cos(a) * radius * 0.9, cy + Math.sin(a) * radius * 0.9, def.color, 2, 70, 2.4, 260);
    }
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
      Sfx.kill(kind === 'elite' || kind === 'boss');
      this.onKill?.(e.x, e.y, kind === 'elite', kind === 'boss');
      // 击杀爆点：精英/BOSS 炸得更狠
      const big = kind === 'boss' ? 3 : kind === 'elite' ? 2 : 1;
      this.fx.burst(e.x, e.y, 0xfff2c4, 8 * big, 180 * big, 2.6 * big, 300);
    }
  }

  private killProjectile(p: Phaser.Physics.Arcade.Image) {
    (p.body as Phaser.Physics.Arcade.Body).setEnable(false);
    p.setActive(false).setVisible(false);
    p.setVelocity(0, 0);
    this.fx.forget(p);
  }
}
