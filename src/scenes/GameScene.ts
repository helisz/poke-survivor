import Phaser from 'phaser';
import { MOVES, MOVE_LIST, RARITY_WEIGHT } from '../data/moves';
import { expForLevel, RUN_SECONDS, loadSave, type PlayerStats } from '../data/stats';
import { MAP_THEMES, themeIndexAtProgress } from '../data/maps';
import { Player } from '../objects/Player';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { Ground } from '../systems/Ground';
import type { TraitId } from '../data/stats';
import { EVOLUTIONS, canEvolve, type EvolutionDef } from '../data/evolutions';

export interface UpgradeOption {
  kind: 'newmove' | 'upgrade' | 'stat' | 'evolve';
  id: string;
  title: string;
  desc: string;
  color: number;
  apply: () => void;
  /** 进化卡专用：进化后的宝可梦图鉴 ID，用于卡片显示大图 */
  portraitId?: number;
  /** 新招式卡：稀有度，用于卡片描边分级 */
  rarity?: 'common' | 'rare' | 'epic';
}

export class GameScene extends Phaser.Scene {
  player!: Player;
  combat!: CombatSystem;
  enemies!: EnemySystem;
  private ground!: Ground;
  /** 当前地图主题索引 */
  private mapIndex = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick?: { x: number; y: number };

  level = 1;
  exp = 0;
  expNext = expForLevel(1);
  elapsed = 0;
  paused = false;
  runEnded = false;
  private spawnAccum = 0;
  private eliteTimer = 0;
  private bossSpawned = { 200: false, 280: false } as Record<number, boolean>;
  private bossRef: Phaser.Physics.Arcade.Sprite | null = null;
  private orbGroup!: Phaser.Physics.Arcade.Group;

  onLevelUp?: () => void;

  constructor() { super('Game'); }

  create(data: { trait: TraitId; starterMove?: string }) {
    this.runEnded = false;
    this.paused = false;
    this.level = 1;
    this.exp = 0;
    this.expNext = expForLevel(1);
    this.elapsed = 0;
    this.spawnAccum = 0;
    this.eliteTimer = 0;
    this.pendingLevelUps = 0;
    this.bossSpawned = { 200: false, 280: false };

    this.makeDotTexture();
    this.makeOrbTexture();

    this.cameras.main.setBackgroundColor('#0a0f14');
    this.ground = new Ground(this);

    // 世界无限：给一个很大的边界
    this.physics.world.setBounds(-1e6, -1e6, 2e6, 2e6);

    this.player = new Player(this, 0, 0, data.trait);
    // 开发者模式倍率（主菜单/游戏内 ⚙ 可调）
    const save = loadSave();
    // 记下不含 dev 倍率的基础值，改倍率时用它重算，避免连乘
    this.baseDamageMul = this.player.stats.damageMul;
    this.baseTakenMul = this.player.stats.damageTakenMul;
    this.baseExpMul = this.player.stats.expMul;
    this.player.stats.damageMul *= save.devDmgMul ?? 1;
    this.player.stats.damageTakenMul *= save.devTakenMul ?? 0;
    this.player.stats.expMul *= save.devExpMul ?? 3;
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.enemies = new EnemySystem(this);

    // 经验球组
    this.orbGroup = this.physics.add.group({ allowGravity: false });

    this.combat = new CombatSystem(this, this.player, this.enemies);
    this.combat.onKill = (x, y, isElite, isBoss) => {
      // 经验随时间成长：前 60 秒 1×，之后线性提升，5 分钟时约 2.6×
      const t = this.elapsed;
      const timeMul = 1 + Math.min(t / 200, 1.6);
      const base = isBoss ? 60 : isElite ? 18 : 1;
      this.dropOrb(x, y, Math.max(1, Math.round(base * timeMul)), isElite, isBoss);
      if (isBoss) this.cameras.main.shake(300, 0.01);
    };

    // 初始招式：随机给一个池内招式
    // 初始招式：开局选定的伙伴，否则随机
    const startMove = data.starterMove
      ?? Phaser.Utils.Array.GetRandom(MOVE_LIST.filter((m) => m.category !== 'summon')).id;
    this.starterMove = startMove;
    this.combat.addMove(startMove);

    // 输入
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as any;

    // 启动 UI
    this.scene.launch('UI', { game: this });

    // 简单虚拟摇杆（触屏）
    this.setupTouch();
  }

  private setupTouch() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.paused || this.runEnded) return;
      this.joystick = { x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.joystick || !p.isDown) return;
      const dx = p.x - this.joystick.x;
      const dy = p.y - this.joystick.y;
      if (Math.hypot(dx, dy) > 6) {
        (this as any).__joyVec = { x: dx, y: dy };
      }
    });
    this.input.on('pointerup', () => {
      this.joystick = undefined;
      (this as any).__joyVec = undefined;
    });
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;
    if (this.runEnded || this.paused) {
      this.player.moveWith(0, 0, dt);
      return;
    }
    this.elapsed += dt;

    // 移动输入
    let vx = 0, vy = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) vx -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) vy -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) vy += 1;
    const joy = (this as any).__joyVec;
    if (joy && vx === 0 && vy === 0) { vx = joy.x; vy = joy.y; }

    this.player.moveWith(vx, vy, dt);
    this.player.layoutFollowers();
    this.player.updateTimers(dt);

    this.ground.update(this.cameras.main.scrollX, this.cameras.main.scrollY,
      this.scale.width, this.scale.height);

    // 地图推进：按整局进度切换主题
    const prog = this.elapsed / RUN_SECONDS;
    const want = themeIndexAtProgress(prog);
    if (want !== this.mapIndex) {
      this.mapIndex = want;
      this.ground.applyTheme(want);
      this.onMapChange(want);
    }

    // 刷怪
    this.updateSpawning(dt);
    this.enemies.update(this.player.x, this.player.y, time);

    // 战斗
    this.combat.update(delta, time);

    // 敌人接触伤害
    this.checkPlayerHit();

    // 经验球吸附
    this.updateOrbs(dt);

    if (this.player.isDead) this.endRun(false);
    if (this.elapsed >= RUN_SECONDS) this.endRun(true);
  }

  /** 切换地图时的横幅提示 */
  private onMapChange(index: number) {
    const theme = MAP_THEMES[index];
    const w = this.scale.width, h = this.scale.height;
    const cy = h * 0.42;

    const name = this.add.text(w / 2, cy, theme.name, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif',
      fontSize: '30px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(0);

    const jp = this.add.text(w / 2, cy + 28, theme.nameJp, {
      fontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
      fontSize: '13px', color: '#9fc4dd',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(0);

    const line = this.add.rectangle(w / 2, cy + 52, 0, 2, 0x449ddf, 0.9)
      .setScrollFactor(0).setDepth(300);

    this.tweens.add({ targets: name, alpha: 1, y: cy - 6, duration: 320, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: jp, alpha: 1, duration: 420, delay: 120 });
    this.tweens.add({ targets: line, width: 120, duration: 420, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: [name, jp], alpha: 0, delay: 1400, duration: 600,
    });
    this.tweens.add({
      targets: line, alpha: 0, width: 0, delay: 1400, duration: 600,
      onComplete: () => { name.destroy(); jp.destroy(); line.destroy(); },
    });

    // 全屏氛围色闪一下，强化换图感
    const flash = this.add.rectangle(0, 0, w, h, theme.ambient, 0.22)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(299);
    this.tweens.add({ targets: flash, alpha: 0, duration: 700, onComplete: () => flash.destroy() });
  }

  private updateSpawning(dt: number) {
    const t = this.elapsed;
    // 刷怪速率：按 5 分钟局压缩（原 15 分钟参数 ×3）
    // 开局 ~1.2/s，之后每 20 秒 +1.2/s，封顶 12/s
    const rate = Math.min(1.2 + t * 0.06, 12);
    this.spawnAccum += dt * rate;
    const hpMul = 1 + t / 40;
    const speedMul = (1 + t / 200) * this.ground.theme.enemySpeedMul;

    const cap = 260;
    const batch = t < 40 ? 1 : t < 100 ? 2 : t < 180 ? 3 : 4;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      if (this.enemies.countActive() >= cap) continue;
      for (let i = 0; i < batch; i++) this.spawnRing(hpMul, speedMul);
    }

    // 精英：每 20 秒一波（原 60 秒）
    this.eliteTimer += dt;
    if (this.eliteTimer >= 20) {
      this.eliteTimer = 0;
      const n = 1 + Math.floor(t / 80);
      for (let i = 0; i < n; i++) {
        const p = this.ringPosition(360);
        this.enemies.spawn('elite', p.x, p.y, hpMul + 0.5, speedMul, 16);
      }
    }

    // BOSS：200 秒 / 280 秒（原 600 / 840）
    for (const sec of [200, 280]) {
      if (!this.bossSpawned[sec] && this.elapsed >= sec) {
        this.bossSpawned[sec] = true;
        const p = this.ringPosition(420);
        this.bossRef = this.enemies.spawn('boss', p.x, p.y, 1, 1, 26);
        this.cameras.main.flash(400, 120, 0, 0);
        this.events.emit('boss-announce');
      }
    }
  }

  private ringPosition(dist: number) {
    const ang = Math.random() * Math.PI * 2;
    const d = dist + Math.random() * 60;
    return { x: this.player.x + Math.cos(ang) * d, y: this.player.y + Math.sin(ang) * d };
  }

  private spawnRing(hpMul: number, speedMul: number) {
    const p = this.ringPosition(560);
    this.enemies.spawn('normal', p.x, p.y, hpMul, speedMul, 8);
  }

  private checkPlayerHit() {
    if (this.player.hurtTimer > 0) return;  // 无敌帧内不做检测，避免一次性被多只怪叠死
    const hb = this.player.getBounds();
    let hit = false;
    this.enemies.forEachActive((e) => {
      if (hit) return;
      if (Phaser.Geom.Intersects.RectangleToRectangle(hb, e.getBounds())) {
        // 接触伤害 = 基础伤害的 55%；手机屏更小更难走位，降到 42%
        const dmgScale = this.scale.width < 520 ? 0.28 : 0.38;
        this.player.takeDamage((e.getData('dmg') as number) * dmgScale);
        hit = true;
      }
    });
  }

  private dropOrb(x: number, y: number, value: number, isElite = false, isBoss = false) {
    const orb = this.orbGroup.get(x, y, 'orb') as Phaser.Physics.Arcade.Image | null;
    if (!orb) return;
    orb.setActive(true).setVisible(true).setDepth(5);
    orb.setData('value', value);
    orb.setAlpha(1);

    // 颜色分层：BOSS 金 / 精英紫 / 普通按价值蓝绿
    if (isBoss) {
      orb.setTint(0xffd75e);      // 金色
      orb.setScale(1.7);
    } else if (isElite) {
      orb.setTint(0xb06bff);      // 紫色，一眼分辨
      orb.setScale(1.35);
    } else {
      orb.setTint(value >= 3 ? 0x63c256 : 0x4592e0);
      orb.setScale(value >= 3 ? 1.05 : 0.85);
    }

    // 精英/BOSS 加一圈光晕，掉在地上也好找
    if (isElite || isBoss) {
      const glow = this.add.circle(x, y, isBoss ? 16 : 12, isBoss ? 0xffd75e : 0xb06bff, 0.28).setDepth(4);
      this.tweens.add({
        targets: glow, scale: 1.8, alpha: 0, duration: 700, repeat: 1,
        onComplete: () => glow.destroy(),
      });
    }

    (orb.body as Phaser.Physics.Arcade.Body).setEnable(true);
    (orb.body as Phaser.Physics.Arcade.Body).reset(x, y);
  }

  private updateOrbs(dt: number) {
    const px = this.player.x, py = this.player.y;
    const pickup = this.player.stats.pickup;
    for (const o of this.orbGroup.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!o.active) continue;
      const d = Phaser.Math.Distance.Between(px, py, o.x, o.y);
      if (d < pickup) {
        // 吸附
        const ang = Math.atan2(py - o.y, px - o.x);
        o.x += Math.cos(ang) * 420 * dt;
        o.y += Math.sin(ang) * 420 * dt;
      }
      if (d < 18) {
        const gain = (o.getData('value') as number) * this.player.stats.expMul;
        o.setActive(false).setVisible(false);
        (o.body as Phaser.Physics.Arcade.Body).setEnable(false);
        this.gainExp(gain);
      }
      if (d > 3000) { o.setActive(false).setVisible(false); (o.body as Phaser.Physics.Arcade.Body).setEnable(false); }
    }
  }

  gainExp(amount: number) {
    this.exp += amount;
    while (this.exp >= this.expNext) {
      this.exp -= this.expNext;
      this.level++;
      this.expNext = expForLevel(this.level);
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && !this.paused) {
      this.paused = true;
      this.scene.pause();
      this.scene.launch('LevelUp', { game: this });
    }
  }

  pendingLevelUps = 0;

  /** UI 层调用：卡牌选择完成 */
  resumeFromLevelUp() {
    this.pendingLevelUps--;
    if (this.pendingLevelUps > 0) {
      this.scene.launch('LevelUp', { game: this });
    } else {
      this.paused = false;
      this.scene.resume();
    }
  }

  /** 本局伙伴宝可梦的招式 id（开局选定，抽卡优先同族/同系） */
  starterMove?: string;

  /** 不含开发者倍率的基础数值，用于游戏内改倍率时重算 */
  baseDamageMul = 1;
  baseTakenMul = 1;
  baseExpMul = 1;

  /** 找出当前满足条件、且本局还没进化到那一步的进化项 */
  pendingEvolutions(): { moveId: string; evo: EvolutionDef }[] {
    const out: { moveId: string; evo: EvolutionDef }[] = [];
    const ctx = { elapsed: this.elapsed, level: this.level, ownedMove: '' };
    for (const moveId of this.combat.slotIds) {
      const chain = EVOLUTIONS[moveId];
      if (!chain) continue;
      const stage = this.combat.getEvoStage(moveId);
      // 一局每个招式最多进化 1 次（策划案：一局最多进化 2 次，按招式计）
      if (stage >= 1) continue;
      const next = chain[stage];
      if (!next) continue;
      if (canEvolve(next, ctx)) out.push({ moveId, evo: next });
    }
    return out;
  }

  buildUpgradeOptions(): UpgradeOption[] {
    const pool: UpgradeOption[] = [];
    const owned = this.combat.slotIds;

    // ── 进化：满足条件的优先塞进池子（策划案 §4.4） ──
    this.pendingEvolutions().forEach(({ moveId, evo }) => {
      pool.push({
        kind: 'evolve', id: `evo_${moveId}_${evo.toId}`,
        title: `进化 · ${evo.name}`,
        desc: evo.note,
        color: MOVES[moveId].color,
        portraitId: evo.toId,
        apply: () => this.combat.evolve(moveId, evo),
      });
    });

    // 招式升级
    for (const id of owned) {
      const def = MOVES[id];
      const lv = this.combat.getMoveLevel(id);
      pool.push({
        kind: 'upgrade', id: `up_${id}`, title: `${def.name}  Lv.${lv + 1}`,
        desc: `伤害 +18%（当前 Lv.${lv}）`, color: def.color,
        apply: () => this.combat.upgradeMove(id),
      });
    }

    // 新招式（未满 6 格）：按稀有度加权抽取，优先补齐「系别多样性」
    if (owned.length < 6) {
      const ownedTypes = new Set(owned.map((id) => MOVES[id]?.type));
      const avail = MOVE_LIST.filter((m) => !owned.includes(m.id) && m.id !== 'morningsun');
      // 加权：稀有度基数 × 系别奖励（已有同系的降权，新系别升权）
      const scored = avail.map((def) => {
        let w = RARITY_WEIGHT[def.rarity ?? 'common'];
        if (ownedTypes.has(def.type)) w *= 0.45;
        else if (ownedTypes.size > 0) w *= 1.6;
        // 有进化链的稍微加权（可养成）
        if (def.hasEvolution) w *= 1.25;

        // ── 专属化：本局伙伴同系加权，能导向进化 ──
        if (this.starterMove && this.starterMove !== def.id) {
          const starter = MOVES[this.starterMove];
          if (starter) {
            if (MOVES[def.id].type === starter.type) w *= 2.2;   // 同系亲和
            if (def.hasEvolution) w *= 1.3;                       // 可养成优先
          }
        }
        return { def, w };
      });
      const total = scored.reduce((a, b) => a + b.w, 0);
      const picked: typeof scored = [];
      const poolTmp = scored.slice();
      // 抽 2 个候选新招式（三选一里通常占 1~2 个位置）
      for (let k = 0; k < 2 && poolTmp.length; k++) {
        const sum = poolTmp.reduce((a, b) => a + b.w, 0);
        let r = Math.random() * sum;
        let idx = 0;
        for (let i = 0; i < poolTmp.length; i++) {
          r -= poolTmp[i].w;
          if (r <= 0) { idx = i; break; }
        }
        picked.push(poolTmp[idx]);
        poolTmp.splice(idx, 1);
      }
      for (const { def } of picked) {
        const rar = def.rarity ?? 'common';
        const rarTag = rar === 'epic' ? '史诗 ' : rar === 'rare' ? '稀有 ' : '';
        const rarColor = rar === 'epic' ? 0xb06bff : rar === 'rare' ? 0x449ddf : def.color;
        pool.push({
          kind: 'newmove', id: `new_${def.id}`,
          title: `新招式 · ${rarTag}${def.name}`,
          desc: `${def.desc}　${def.type}系`,
          color: rarColor,
          rarity: rar,
          apply: () => this.combat.addMove(def.id),
        });
      }
    }

    // 属性加成
    const statUpgrades: UpgradeOption[] = [
      { kind: 'stat', id: 'atk', title: '力量强化', desc: '伤害 +12%', color: 0xf0703c, apply: () => { this.player.stats.damageMul *= 1.12; } },
      { kind: 'stat', id: 'spd', title: '疾行', desc: '移速 +8%', color: 0x449ddf, apply: () => { this.player.stats.speed *= 1.08; } },
      { kind: 'stat', id: 'hp', title: '体力强化', desc: '最大 HP +20 并回满', color: 0x63c256, apply: () => { this.player.stats.maxHp += 20; this.player.stats.hp = this.player.stats.maxHp; } },
      { kind: 'stat', id: 'pick', title: '磁力', desc: '拾取范围 +25%', color: 0xf7d02c, apply: () => { this.player.stats.pickup *= 1.25; } },
      { kind: 'stat', id: 'cd', title: '迅捷', desc: '招式冷却 -8%', color: 0x8a5fbf, apply: () => { this.player.stats.cooldownMul *= 0.92; } },
    ];
    pool.push(...statUpgrades);

    // 抽 3 个不重复；进化卡优先占位
    Phaser.Utils.Array.Shuffle(pool);
    const chosen: UpgradeOption[] = [];
    const usedTitles = new Set<string>();

    // 先进化卡（保证满足条件时一定能看到）
    for (const o of pool) {
      if (o.kind !== 'evolve') continue;
      if (chosen.length >= 3) break;
      usedTitles.add(o.title);
      chosen.push(o);
    }

    for (const o of pool) {
      if (chosen.length >= 3) break;
      if (usedTitles.has(o.title)) continue;
      usedTitles.add(o.title);
      chosen.push(o);
    }
    return chosen;
  }

  private endRun(survived: boolean) {
    if (this.runEnded) return;
    this.runEnded = true;
    this.scene.launch('GameOver', {
      game: this,
      survived,
      time: this.elapsed,
      level: this.level,
      kills: this.combat.kills,
    });
  }

  private makeDotTexture() {
    if (this.textures.exists('dot')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 6);
    g.generateTexture('dot', 12, 12);
    g.destroy();
  }

  private makeOrbTexture() {
    if (this.textures.exists('orb')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6, 6, 5);
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(4, 4, 2);
    g.generateTexture('orb', 12, 12);
    g.destroy();
  }

  get stats(): PlayerStats { return this.player.stats; }
}
