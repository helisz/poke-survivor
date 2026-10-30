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
  /** 近战批次去重：volleyId → 该批已命中的敌人 */
  private volleyHit = new Map<number, Set<Phaser.Physics.Arcade.Sprite>>();
  private volleySeq = 1;
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

      // 近战去重：同一次出招的多条弹道重叠时，同一只怪只吃一次伤害。
      // 用 volleyId 标记同批弹道，perVolley 记录该批已命中的敌人。
      const volleyId = proj.getData('volleyId') as number | undefined;
      if (volleyId !== undefined) {
        const hit = this.volleyHit.get(volleyId);
        if (hit) {
          if (hit.has(enemy)) { this.killProjectile(proj); return; }
          hit.add(enemy);
        }
      }

      this.hitEnemy(
        enemy,
        proj.getData('damage') as number,
        proj.getData('evolved')
          ? {
              color: proj.getData('color') as number,
              accent: (proj.getData('accent') as number) ?? 0xffffff,
              particles: (proj.getData('evoHit') as number) || 18,
              shake: true,
            }
          : null,
      );

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

  /** 某招式进化后名字（未进化返回 undefined，卡面据此决定显示原始名） */
  getEvoName(moveId: string) {
    return this.slots.find((x) => x.moveId === moveId)?.evoName;
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

      // 火球分裂：飞出一段距离后炸成环状小子弹
      if (p.getData('splitDef') && !p.getData('splitDone')) {
        const left = (p.getData('splitIn') as number) - dtMs;
        if (left <= 0) { this.splitFireball(p); continue; }
        p.setData('splitIn', left);
      }

      // 弹体拖尾：炮弹/激光/闪电喷尾焰，近战弹道喷短促刃光
      const kind = p.getData('fx') as string;
      if (kind === 'shell' || kind === 'laser' || kind === 'bolt' || kind === 'slash') {
        const v = p.body!.velocity;
        const ang = Math.atan2(v.y, v.x);
        this.fx.shellTrail(p, p.x, p.y, ang, p.getData('color') as number, dtMs);
        // 进化弹体：额外撒辅色残影，拖尾明显更粗更长
        const trail = (p.getData('evoTrail') as number) ?? 0;
        if (trail > 0) {
          const accent = (p.getData('accent') as number) ?? 0xffffff;
          this.fx.shellTrail(p, p.x, p.y, ang, accent, dtMs * (1 + trail * 0.35));
          // 弹体自身向外冒一点光点，做出"能量溢出"的感觉
          this.fx.burst(p.x, p.y, accent, 1 + Math.floor(trail / 2), 40, 2.2, 200);
        }
      }
    }

    this.fx.update(dtMs);
  }

  /** 火球炸裂：主弹体消失，向四周撒出 6 颗小子弹 */
  private splitFireball(src: Phaser.Physics.Arcade.Image) {
    const def = src.getData('splitDef') as MoveDef;
    const damage = (src.getData('damage') as number) * 0.45;
    const color = src.getData('color') as number;
    const n = 6;
    this.fx.burst(src.x, src.y, color, 18, 200, 3.2, 320);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const p = this.projectiles.get(src.x, src.y, 'dot') as Phaser.Physics.Arcade.Image | null;
      if (!p) continue;
      p.setActive(true).setVisible(true);
      p.setTintFill(color);
      p.setScale(0.2);
      p.setData('damage', damage);
      p.setData('pierce', 0);
      p.setData('life', 420);
      p.setData('moveId', def.id);
      p.setData('color', color);
      p.setData('fx', 'shell');
      p.setData('hitList', []);
      p.setVelocity(Math.cos(a) * 380, Math.sin(a) * 380);
      (p.body as Phaser.Physics.Arcade.Body).setEnable(true);
      (p.body as Phaser.Physics.Arcade.Body).setSize(14, 14, true);
    }
    this.killProjectile(src);
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

  /** 把进化视觉参数转成 hitEnemy 需要的载荷；没进化则返回 null */
  private evoHitPayload(moveId: string): {
    color: number; accent: number; particles: number; shake: boolean;
  } | null {
    const evo = this.evoFxOf(moveId);
    if (!evo) return null;
    const def = MOVES[moveId];
    return {
      color: evo.color ?? def?.color ?? 0xffffff,
      accent: evo.accent ?? 0xffffff,
      particles: evo.hitParticles ?? 18,
      shake: !!evo.shake,
    };
  }

  /**
   * 取该招式当前的进化视觉参数：只有真的进化过（evoDmgMul 已被抬高）才返回，
   * 否则返回 undefined —— 没进化的招式外观一丝不变。
   */
  private evoFxOf(moveId: string): MoveDef['evo'] | undefined {
    const slot = this.slots.find((s) => s.moveId === moveId);
    if (!slot || (slot.evoDmgMul ?? 1) <= 1) return undefined;
    return MOVES[moveId]?.evo;
  }

  private fire(def: MoveDef, level: number, ox: number, oy: number) {
    const slot = this.slots.find((s) => s.moveId === def.id);
    const evoMul = slot?.evoDmgMul ?? 1;
    // 技能升级成长显著提高：每级 +18% → +42%。
    // 让"升级"成为主要的强度来源，玩家能明显感到越打越强。
    const dmgMul = this.player.stats.damageMul * (1 + (level - 1) * 0.42) * evoMul;
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
    // 该招式的特效形态。进化后整套视觉换成 evo 里定义的那套
    // （颜色更艳、形态可能整条换掉、弹体更大、带拖尾）——
    // 只改表现，伤害仍由上面的 damage 决定，所以调视觉不会把数值带跑。
    const evo = this.evoFxOf(def.id);
    const fxCfg = evo ?? def;
    const fxColor = evo?.color ?? def.color;
    const fxKind = evo?.kind ?? SKILL_FX[def.id] ?? 'shell';
    const isShell = fxKind === 'shell';

    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i - (count - 1) / 2) * spreadStep : 0;
      const ang = baseAng + spread;
      const p = this.projectiles.get(ox, oy, 'dot') as Phaser.Physics.Arcade.Image | null;
      if (!p) continue;
      p.setActive(true).setVisible(true);
      p.setTintFill(fxColor);
      // 进化形态的主色 + 辅色一起带上，命中处按这个配色出特效
      p.setData('damage', damage);
      p.setData('pierce', def.pierce ?? 0);
      p.setData('life', 1600);
      p.setData('moveId', def.id);
      p.setData('color', fxColor);
      p.setData('accent', evo?.accent ?? fxColor);
      p.setData('evolved', !!evo);
      p.setData('evoTrail', evo?.trail ?? 0);
      p.setData('evoHit', evo?.hitParticles ?? 0);
      // 电系：不发弹体，直接从施法者身上放射电弧并结算伤害
      if (def.style === 'lightning') {
        this.killProjectile(p);
        this.fireLightning(def, damage, ox, oy, target);
        return;
      }
      p.setData('fx', fxKind);
      p.setData('homing', homing);
      p.setData('chain', chain);
      // 火系分裂火球：飞行 260ms 后炸成多颗小子弹
      if (def.style === 'fireball') {
        p.setData('splitIn', 260);
        p.setData('splitDone', false);
        p.setData('splitDef', def);
      }
      p.setData('chainLeft', chain ? 2 : 0);
      p.setData('hitList', []);          // 已命中目标，避免连锁重复打同一个
      const speed = homing ? (def.projectileSpeed ?? 400) * 0.8 : (def.projectileSpeed ?? 400);
      (p.body as Phaser.Physics.Arcade.Body).setEnable(true);
      (p.body as Phaser.Physics.Arcade.Body).setCircle(6, -2, -2);
      p.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
      p.setDepth(8);

      if (evo?.scale) {
        // 进化形态：弹体统一按 evo.scale 放大，比任何原始形态都显眼
        p.setScale(evo.scale);
        if (homing) p.getData('speed') ?? p.setData('speed', speed);
      } else if (homing) {
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

    // 出招特效：按形态区分。进化形态用更粗的线宽和更大的起手圈
    const pulseR = evo ? 34 : 22;
    const laserW = evo ? 9 : 4;
    if (fxKind === 'bolt') {
      // 闪电系：直接朝最近的敌人劈一道折线
      if (target) {
        this.fx.bolt(ox, oy, target.x, target.y, fxColor);
        // 进化电弧：在主干两侧再补几道细分支，视觉上"电更猛"
        if (evo?.arc) {
          for (let k = 0; k < 2; k++) {
            const jx = target.x + Phaser.Math.Between(-34, 34);
            const jy = target.y + Phaser.Math.Between(-34, 34);
            this.fx.boltArc(ox, oy, Math.atan2(jy - oy, jx - ox),
              Math.hypot(jx - ox, jy - oy), evo.accent ?? fxColor, 0.3, 2);
          }
        }
      }
      this.fx.castPulse(ox, oy, fxColor, pulseR);
    } else if (fxKind === 'laser') {
      // 激光系：瞬发一条亮线打到第一个敌人
      // 先画宽的辅色辉光打底，再叠窄的主色亮线，才有"炮"的厚度
      if (evo && target) {
        this.fx.laser(ox, oy, target.x, target.y, evo.accent ?? fxColor, laserW * 2.2);
      }
      if (target) this.fx.laser(ox, oy, target.x, target.y, fxColor, laserW);
      this.fx.castPulse(ox, oy, fxColor, pulseR);
    } else {
      // 炮弹系：起手能量圈，弹体自己带尾焰
      this.fx.castPulse(ox, oy, fxColor, evo ? 26 : 18);
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

  /**
   * 近战重构：不再画扇形，改发真实短程弹道，靠射程衰减消失。
   * 三种流派：
   *   bar  —— 并排弹道齐射（连续拳、雷光拳）
   *   fan  —— 扇形散射多弹道（龙之爪、铁头、火焰踢）
   *   sweep—— 宽扇形弹幕墙（水流尾、叶刃、闪焰冲锋）
   */
  private fireMelee(def: MoveDef, damage: number, ox: number, oy: number) {
    const traits = def.traits ?? [];
    const flurry = traits.includes('flurry');
    const sweep = traits.includes('sweep');
    const lvl = this.getMoveLevel(def.id) - 1;

    const target = this.nearestEnemy(ox, oy, Math.min((def.range ?? 90) * 2.2, this.screenAimRadius()));
    const ang = target ? Math.atan2(target.y - oy, target.x - ox) : this.playerAngle();

    // 射程随等级增长
    const range = (def.range ?? 90) * 1.6 + lvl * 16;

    if (sweep) {
      // 弹幕墙：宽度随等级增加，弹数 7 → 13
      const arcs = 7 + Math.min(lvl * 2, 6);
      // 初期弧度压低 40%（1.5 → 0.9），升级再逐步张开
      const spread = 0.9 + lvl * 0.12;
      const vid = this.newVolley();
      for (let i = 0; i < arcs; i++) {
        const a = ang - spread / 2 + (spread * i) / (arcs - 1);
        this.meleeBolt(ox, oy, a, range, def, damage, 0.34, vid);
      }
      this.fx.burst(ox + Math.cos(ang) * 26, oy + Math.sin(ang) * 26, def.color, 8, 130, 2.8, 180);
    } else if (def.style === 'lightning') {
      // 电系近战：从身边向外放射多束电弧（不放弹道）
      const branches = 3 + Math.min(lvl, 4);
      const spread = 0.5 + lvl * 0.1;
      this.fx.boltArc(ox, oy, ang, range, def.color, spread, branches);
      this.damageArc(ox, oy, ang, range, spread, damage, def);
    } else if (flurry) {
      // 并排弹道齐射：3 条 → 5 条，间距逐渐拉开
      const lanes = 3 + Math.min(Math.floor(lvl / 2), 2);
      const gap = 12 + lvl * 1.5;
      const vid = this.newVolley();
      for (let i = 0; i < lanes; i++) {
        const off = (i - (lanes - 1) / 2) * gap;
        const px = ox + Math.cos(ang + Math.PI / 2) * off;
        const py = oy + Math.sin(ang + Math.PI / 2) * off;
        if (def.style === 'fist') this.fx.fistWave(px, py, ang, def.color);
        this.meleeBolt(px, py, ang, range * 1.15, def, damage, 0.26, vid);
      }
    } else {
      // 扇形散射：弹道数量随等级增加
      const shots = 3 + Math.min(lvl, 4);
      // 初期弧度压低 40%（0.55 → 0.33），升级再逐步张开
      const spread = 0.33 + lvl * 0.09;
      const vid = this.newVolley();
      for (let i = 0; i < shots; i++) {
        const a = ang - spread / 2 + (spread * i) / Math.max(1, shots - 1);
        if (def.style === 'fist') this.fx.fistWave(ox, oy, a, def.color);
        this.meleeBolt(ox, oy, a, range, def, damage, 0.3, vid);
      }
    }
  }

  /** 开一批新弹道，返回批次号（用于同批去重） */
  private newVolley(): number {
    const id = this.volleySeq++;
    this.volleyHit.set(id, new Set());
    // 只保留最近 12 批，避免长期运行内存增长
    if (this.volleyHit.size > 12) {
      const oldest = this.volleyHit.keys().next().value;
      if (oldest !== undefined && oldest < id - 8) this.volleyHit.delete(oldest);
    }
    return id;
  }

  /** 电系投射：从施法者向外放电，命中沿电弧路径的敌人 */
  private fireLightning(
    def: MoveDef, damage: number, ox: number, oy: number,
    target: Phaser.Physics.Arcade.Sprite | null,
  ) {
    const range = Math.min((def.range ?? 300) * 1.5, this.screenAimRadius());
    const ang = target ? Math.atan2(target.y - oy, target.x - ox) : this.playerAngle();
    // 主束 + 两侧小分叉
    this.fx.boltArc(ox, oy, ang, range, def.color, 0.34, 3);
    this.damageArc(ox, oy, ang, range, 0.34, damage, def);
  }

  /** 对一段扇形电弧内的敌人结算伤害（每个敌人只吃一次） */
  private damageArc(
    ox: number, oy: number, ang: number, range: number,
    spread: number, damage: number, def: MoveDef,
  ) {
    const hit = new Set<Phaser.Physics.Arcade.Sprite>();
    this.enemies.forEachActive((e) => {
      if (!e.active || hit.has(e)) return;
      const d = Phaser.Math.Distance.Between(ox, oy, e.x, e.y);
      if (d > range + 20) return;
      const ea = Math.atan2(e.y - oy, e.x - ox);
      let diff = Math.abs(Phaser.Math.Angle.Wrap(ea - ang));
      if (diff > spread / 2 + 0.12) return;
      hit.add(e);
      this.hitEnemy(e, damage, this.evoHitPayload(def.id));
    });
  }

  /** 近战弹道实体：短射程、带粒子拖尾、命中一次即消失 */
  private meleeBolt(
    ox: number, oy: number, ang: number, range: number,
    def: MoveDef, damage: number, scale: number,
    volleyId?: number,
  ) {
    const p = this.projectiles.get(ox, oy, 'dot') as Phaser.Physics.Arcade.Image | null;
    if (!p) return;
    const speed = 620;
    p.setActive(true).setVisible(true);
    p.setTintFill(def.color);
    p.setScale(scale);
    p.setData('damage', damage);
    p.setData('pierce', def.traits?.includes('pierce') ? 1 : 0);
    p.setData('life', (range / speed) * 1000);
    p.setData('moveId', def.id);
    p.setData('color', def.color);
    p.setData('fx', 'slash');
    p.setData('hitList', []);
    if (volleyId !== undefined) p.setData('volleyId', volleyId);
    p.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    const body = p.body as Phaser.Physics.Arcade.Body;
    body.setEnable(true);
    body.setSize(18, 18, true);
    this.fx.castPulse(ox, oy, def.color, 16);
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

    const evoHit = this.evoHitPayload(def.id);
    this.enemies.forEachActive((e) => {
      if (Phaser.Math.Distance.Between(cx, cy, e.x, e.y) <= radius) this.hitEnemy(e, damage, evoHit);
    });
  }

  private fireAura(def: MoveDef, damage: number, ox: number, oy: number) {
    // 范围收敛：判定半径按原值一半，每级成长同步缩小
    const radius = (def.range ?? 110) * 0.72 + (this.getMoveLevel(def.id) - 1) * 7;
    const cx = this.player.x, cy = this.player.y;
    const evo = this.evoFxOf(def.id);
    const ringColor = evo?.color ?? def.color;
    const ringAccent = evo?.accent ?? def.color;

    // 视觉环：外圈亮边 + 内圈填充，范围更直观
    const ring = this.scene.add.circle(cx, cy, radius, ringColor, evo ? 0.22 : 0.16).setDepth(2);
    const edge = this.scene.add.circle(cx, cy, radius, ringColor, 0)
      .setStrokeStyle(evo ? 3.5 : 2.5, ringColor, evo ? 0.75 : 0.55).setDepth(3);
    const fade = [ring, edge];

    // 第三层：进化光环夹一圈缓慢旋转的符文点 —— 一眼看出这圈"更高级"。
    // 用普通圆形代替精灵图，不额外加载素材。
    if (evo) {
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        const dot = this.scene.add.circle(
          cx + Math.cos(a) * radius, cy + Math.sin(a) * radius,
          i % 2 === 0 ? 3.6 : 2.4, ringAccent, 0.9,
        ).setDepth(4);
        this.scene.tweens.add({
          targets: dot,
          // 相对自身绕圈：位移到下一个 1/8 圆位
          x: cx + Math.cos(a + Math.PI / 4) * radius,
          y: cy + Math.sin(a + Math.PI / 4) * radius,
          alpha: 0, duration: 420, ease: 'Sine.easeInOut',
          onComplete: () => dot.destroy(),
        });
        fade.push(dot);
      }
      // 进化光环的外圈再补一道更宽的辅色光晕
      const halo = this.scene.add.circle(cx, cy, radius + 5, ringAccent, 0)
        .setStrokeStyle(6, ringAccent, 0.16).setDepth(2);
      fade.push(halo);
    }

    this.scene.tweens.add({
      targets: fade, alpha: 0, duration: 340,
      onComplete: () => { ring.destroy(); edge.destroy(); },
    });
    // 环上粒子：绕圈飞散，让光环有「持续灼烧」的感觉
    const nP = evo ? 18 : 12;
    for (let i = 0; i < nP; i++) {
      const a = (Math.PI * 2 * i) / nP;
      this.fx.burst(cx + Math.cos(a) * radius * 0.9, cy + Math.sin(a) * radius * 0.9,
        ringColor, evo ? 3 : 2, evo ? 100 : 70, evo ? 3 : 2.4, 260);
    }
    // 持续灼烧：首跳全额，之后 2 跳各 40%（每 0.35 秒一跳）
    const tick = (n: number) => {
      if (n <= 0) return;
      const px = this.player.x, py = this.player.y;
      const evoHit = this.evoHitPayload(def.id);
      this.enemies.forEachActive((e) => {
        if (Phaser.Math.Distance.Between(px, py, e.x, e.y) <= radius) {
          this.hitEnemy(e, damage * (n === 3 ? 1 : 0.4), evoHit);
        }
      });
      if (n > 1) this.scene.time.delayedCall(350, () => tick(n - 1));
    };
    tick(3);
  }

  private playerAngle() {
    const f = this.player.facing;
    return f === 'down' ? Math.PI / 2 : f === 'up' ? -Math.PI / 2 : f === 'left' ? Math.PI : 0;
  }

  /**
   * 结算一次伤害。
   *
   * evo 非空表示这一下是「进化招式」打的 —— 除了伤害本身，
   * 还要出专属命中特效：更密的粒子、一圈冲击环、轻微震屏。
   * 普通招式传 null，表现和以前完全一致。
   */
  private hitEnemy(
    e: Phaser.Physics.Arcade.Sprite,
    damage: number,
    evo?: { color: number; accent: number; particles: number; shake: boolean } | null,
  ) {
    this.damageDealt += damage;
    if (evo) this.evoHitFx(e.x, e.y, evo);
    const died = this.enemies.damage(e, damage, this.now);
    if (died) {
      const kind = e.getData('kind') as string;
      this.kills++;
      Sfx.kill(kind === 'elite' || kind === 'boss');
      this.onKill?.(e.x, e.y, kind === 'elite', kind === 'boss');
      // 击杀爆炸：一个柔和外扩的光环 + 少量碎片。
      // 不用强闪光和大冲击环 —— 一屏几十只怪同时死时会晃眼，
      // 这里靠「半透明环缓慢外扩 + 粒子飘散」表达消散感。
      const big = kind === 'boss' ? 3 : kind === 'elite' ? 2 : 1;
      this.killPuff(e.x, e.y, big, kind === 'boss' || kind === 'elite');
    }
  }

  /**
   * 进化招式的命中特效。
   *
   * 震屏必须节流：进化招式一秒可能打七八下，每下都震会晕。
   * 这里限制到每 220ms 最多震一次，其余只出粒子和冲击环。
   */
  private evoHitFx(x: number, y: number, evo: { color: number; accent: number; particles: number; shake: boolean }) {
    // 主色粒子向外炸，辅色点缀形成双色爆点
    this.fx.burst(x, y, evo.color, evo.particles, 260, 3.4, 360);
    this.fx.burst(x, y, evo.accent, Math.max(6, Math.round(evo.particles * 0.4)), 180, 2.6, 300);
    // 冲击环：这是"这一下很重"最直观的信号
    this.fx.shockRing(x, y, evo.color, 26, 300);
    if (evo.shake) {
      const now = this.now;
      if (now - this.lastEvoShake > 220) {
        this.lastEvoShake = now;
        this.scene.cameras.main.shake(70, 0.0035);
      }
    }
  }

  /**
   * 怪物死亡的小爆炸：柔和、不突兀。
   * 用一圈快速淡出的半透明光环 + 十几颗慢速碎片，
   * 强度随体型放大，精英/BOSS 额外多一点。
   */
  private killPuff(x: number, y: number, big: number, loud: boolean) {
    const ring = this.scene.add.circle(x, y, 6 * big, 0xffffff, 0.55).setDepth(7);
    ring.setStrokeStyle(2 * big, 0xfff2c4, 0.9);
    ring.setFillStyle(0xffffff, 0);
    this.scene.tweens.add({
      targets: ring,
      radius: 22 * big,
      alpha: 0,
      duration: 260 + 60 * big,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    // 碎片：数量克制，速度低，寿命短
    this.fx.burst(x, y, 0xfff2c4, Math.round(6 * big), 90 * big, 2.2 * big, 260);
    if (loud) this.fx.burst(x, y, 0xffffff, 4, 60, 1.6, 260);
  }

  /** 上次因进化招式震屏的时刻，用于节流 */
  private lastEvoShake = -9999;

  private killProjectile(p: Phaser.Physics.Arcade.Image) {
    (p.body as Phaser.Physics.Arcade.Body).setEnable(false);
    p.setActive(false).setVisible(false);
    p.setVelocity(0, 0);
    this.fx.forget(p);
  }
}
