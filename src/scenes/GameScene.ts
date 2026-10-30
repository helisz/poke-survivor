import Phaser from 'phaser';
import { MOVES, MOVE_LIST, RARITY_WEIGHT } from '../data/moves';
import { expForLevel, RUN_SECONDS, loadSave, writeSave, type PlayerStats } from '../data/stats';
import { MAP_THEMES, stageScale, STAGE_COUNT } from '../data/maps';
import { Player } from '../objects/Player';
import { CombatSystem } from '../systems/CombatSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { Sfx } from '../systems/Sfx';
import { Ground } from '../systems/Ground';
import { PickupSystem } from '../systems/PickupSystem';
import { PICKUP_DEFS, type PickupKind } from '../data/pickups';
import type { TraitId } from '../data/stats';
import { EVOLUTIONS, canEvolve, evoLadderFor, type EvolutionDef } from '../data/evolutions';
import { applyPerm, rerollsPerRun } from '../data/stats';
import { POKEMON_PLAYABLE, POKEDEX_NAME, BOSS_POOL } from '../data/pokedex';
import { ensureSprites } from '../data/lazySprites';
import { killScore, clearBonus, type ScoreKind } from '../data/score';
import { UI } from '../ui/Theme';

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
  /** 该卡对应的宝可梦图鉴 ID（卡片右侧显示头像） */
  pokeId?: number;
  /** 该卡对应的宝可梦名字 */
  pokeName?: string;
}

/** 属性卡的权重系数：1 = 与一张招式卡同等机会，0.5 = 半概率 */
const STAT_CARD_WEIGHT = 0.5;

/**
 * 小怪刷新：**必须在当前视口之外**，且离屏幕边缘有固定余量。
 *
 * 不能写死半径 —— 视口随设备宽度、窗口缩放、相机 zoom 变化，
 * 固定 190 在大屏上会直接刷在玩家脸上，在小屏上又太远。
 * 这里每帧按相机实际可见矩形算：取半宽/半高的对角线长度
 * （即视口四个角到中心的距离）再留 30px 余量，
 * 保证任何角度刷出来的怪都在屏幕外，不会凭空出现在视野里。
 */
const SPAWN_MARGIN = 30;
/** 视口外再往外多铺多远（摇杆/呼吸空间），越界也不会绕回来 */
const SPAWN_BAND = 70;

export class GameScene extends Phaser.Scene {
  player!: Player;
  combat!: CombatSystem;
  enemies!: EnemySystem;
  private ground!: Ground;
  /** 当前地图主题索引（= 关卡序号，整局固定不切换） */
  private mapIndex = 0;
  /** 本关的强度倍率（攻击 / 血量 / 速度，按关卡连乘） */
  private stageScale = { atk: 1, hp: 1, spd: 1 };

  /** 本局剩余重掷次数（局外「赌神」等级决定，每局重置） */
  rerollsLeft = 0;
  /** 属性强化的叠加层数（UI 底部小图标展示） */
  statStacks: Record<string, number> = {};

  /** 记录一次属性强化，同步给 UI */
  addStatStack(id: string) {
    this.statStacks[id] = (this.statStacks[id] ?? 0) + 1;
    const ui = this.scene.get('UI') as any;
    ui?.refreshBuffs?.();
  }
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
  /** 终局 BOSS：时间到后刷出，击杀才过关 */
  private finalBossSpawned = false;
  /** 本局累计得分（击杀分 + 通关奖励）。UIScene 每帧读取显示。 */
  score = 0;
  private bossSkillTimer = 0;
  /** 冰系 BOSS 命中后的减速状态（避免重复命中叠加） */
  private frostActive = false;
  private frostBaseSpeed = 0;
  private frostTimer?: Phaser.Time.TimerEvent;
  private bossBarBg?: Phaser.GameObjects.Rectangle;
  private bossBarFill?: Phaser.GameObjects.Rectangle;
  private bossNameText?: Phaser.GameObjects.Text;
  /** 终局 BOSS 实际刷出的宝可梦（决定血条名字） */
  private bossPokemonName?: string;
  private bossPokemonId?: number;
  private bossBarW = 300;
  private orbGroup!: Phaser.Physics.Arcade.Group;
  private healGroup!: Phaser.Physics.Arcade.Group;
  private chestGroup!: Phaser.Physics.Arcade.Group;
  /** 宝箱生成计时（每 45 秒一个） */
  private chestTimer = 0;
  private static readonly CHEST_INTERVAL = 45;
  /** 拾取时撞上未弹完的升级，挂起等升级结束再弹 */
  private pendingChest = false;
  /** UI 有需要读场上道具的剩余时间，放 public */
  pickups!: PickupSystem;
  /** 护盾剩余秒数（>0 无敌）。UI 左下角读它显示倒计时 */
  shieldTimer = 0;
  /** 利剑剩余秒数（>0 双倍伤害）。UI 左下角读它显示倒计时 */
  swordTimer = 0;
  private pickupArrowGfx?: Phaser.GameObjects.Graphics;

  onLevelUp?: () => void;

  constructor() { super('Game'); }

  create(data: { trait: TraitId; starterMove?: string; stage?: number }) {
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

    // 本局关卡：地图整局固定，不再随进度轮换
    const stage = Math.max(0, Math.min(STAGE_COUNT - 1, Math.floor(data.stage ?? 0)));
    this.mapIndex = stage;
    this.stageScale = stageScale(stage);
    this.ground.applyTheme(stage);

    // 按需加载本局会用到的贴图：本关小怪/精英 + 全部 BOSS + 可玩伙伴 + 进化目标。
    // 只加载这一关需要的，不再首屏拉全 166 张。
    this.preloadRunSprites(stage);

    // 世界无限：给一个很大的边界
    this.physics.world.setBounds(-1e6, -1e6, 2e6, 2e6);

    // 本局重掷次数：局外「赌神」每级 +1
    this.rerollsLeft = rerollsPerRun(loadSave().perm.gamble ?? 0);

    this.player = new Player(this, 0, 0, data.trait);
    // 应用商店购买的局外永久升级
    {
      const sv = loadSave();
      const boosted = applyPerm(this.player.stats, sv.perm);
      this.player.stats.maxHp = boosted.maxHp;
      this.player.stats.hp = boosted.maxHp;
      this.player.stats.damageMul = boosted.damageMul;
      this.player.stats.speed = boosted.speed;
      this.player.stats.pickup = boosted.pickup;
      this.player.stats.expMul = boosted.expMul;
      this.player.stats.cooldownMul = boosted.cooldownMul;
    }
    // 开发者模式倍率（主菜单/游戏内 ⚙ 可调）
    const save = loadSave();
    // 记下不含 dev 倍率的基础值，改倍率时用它重算，避免连乘
    this.baseDamageMul = this.player.stats.damageMul;
    this.baseTakenMul = this.player.stats.damageTakenMul;
    this.baseExpMul = this.player.stats.expMul;
    this.player.stats.damageMul *= save.devDmgMul ?? 1;
    // 默认 1（正常伤害）。曾经是 ?? 0 = 无敌，字段缺失时会变成打不死
    this.player.stats.damageTakenMul *= save.devTakenMul ?? 1;
    // 默认 1：曾经的 ?? 3 是测试期为了快速升级硬塞的，会让所有玩家的
    // 经验获取变成 3 倍（把基础 1.5 顶成 4.5），正式版必须归位。
    this.player.stats.expMul *= save.devExpMul ?? 1;
    // 镜头拉近 1.25 倍：人物/怪物/地图一起放大，可视范围收窄约 36%。
    // 刷怪半径、离屏回收、伤害数字换算都走 cam.zoom，会自动跟着收缩，
    // 不需要另外调参。
    this.cameras.main.setZoom(1.25);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.enemies = new EnemySystem(this);
    this.enemies.installLiftHook(this);

    // 经验球组
    this.orbGroup = this.physics.add.group({ allowGravity: false });
    // 回血球组
    this.healGroup = this.physics.add.group({ allowGravity: false });
    this.chestGroup = this.physics.add.group({ allowGravity: false });
    this.makeChestTexture();
    this.pickups = new PickupSystem(this);
    this.makeHealOrbTexture();

    this.combat = new CombatSystem(this, this.player, this.enemies);
    this.combat.onKill = (x, y, isElite, isBoss) => {
      // 经验随时间成长：前 60 秒 1×，之后线性提升，5 分钟时约 2.6×
      const t = this.elapsed;
      const timeMul = 1 + Math.min(t / 200, 1.6);
      // 记分：终局 BOSS 用 finalboss 档，中途 BOSS 用 miniboss 档
      const kind = isBoss
        ? (this.finalBossSpawned ? 'finalboss' : 'miniboss')
        : isElite ? 'elite' : 'normal';
      this.score += killScore(kind, this.mapIndex, t);

      const base = isBoss ? 120 : isElite ? 36 : 2;
      const mapExp = this.ground.theme.expMul ?? 1;
      this.dropOrb(x, y, Math.max(1, Math.round(base * timeMul * mapExp)), isElite, isBoss);
      if (isBoss) this.cameras.main.shake(300, 0.01);

      // 回血球掉率：随时间递减，开局 5%，到 5 分钟降到 1%。
      // 前期给足容错，后期压缩补给，逼玩家靠走位而不是靠回血硬扛。
      // BOSS 必掉、精英走 3 倍于当下的普通掉率。
      const prog = Math.min(this.elapsed / RUN_SECONDS, 1);
      const healBase = 0.05 - 0.04 * prog;
      const healChance = isBoss ? 1 : isElite ? Math.min(healBase * 3, 0.2) : healBase;
      if (Math.random() < healChance) {
        this.dropHealOrb(x, y);
        if (isBoss) this.dropHealOrb(x + 18, y + 10);
      }

      // 终局 BOSS 死亡 → 过关
      if (isBoss && this.finalBossSpawned) {
        const boss = this.bossRef;
        if (!boss || !boss.active) {
          this.hideBossBar();
          this.time.delayedCall(600, () => this.endRun(true));
        }
      }
    };

    // 初始招式：随机给一个池内招式
    // 初始招式：开局选定的伙伴，否则随机
    const startMove = data.starterMove
      ?? Phaser.Utils.Array.GetRandom(MOVE_LIST.filter((m) => m.category !== 'summon')).id;
    this.starterMove = startMove;
    this.combat.addMove(startMove);

    // 图鉴：本局选用的伙伴记入「伙伴」页（用招式反查宝可梦 id）
    this.markPartnerSeen(startMove);

    // 输入
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as any;

    // 启动 UI
    this.scene.launch('UI', { game: this });

    // 简单虚拟摇杆（触屏）
    this.setupTouch();

    // 开局先撒一圈初始怪：否则第一只怪要等刷怪累积（0.6/s 起）才出现，
    // 这段时间玩家只是空跑。给 8 只贴着屏幕边缘的，开局立刻有东西打。
    //
    // 按需加载下贴图是异步的：等本关池子就绪再撒，否则会撒出一圈黑块。
    const hpMul0 = 1 * this.stageScale.hp;
    const spdMul0 = 1 * this.stageScale.spd;
    const theme = MAP_THEMES[stage];
    const needIds = new Set<number>([
      ...(theme?.enemyPool ?? []), ...(theme?.elitePool ?? []), ...BOSS_POOL,
    ]);
    const allReady = [...needIds].every((id) => this.textures.exists(`pk_${id}`));
    if (allReady) {
      for (let i = 0; i < 8; i++) this.spawnRing(hpMul0, spdMul0);
    } else {
      ensureSprites(this, [...needIds], () => {
        if (this.runEnded) return;
        for (let i = 0; i < 8; i++) this.spawnRing(hpMul0, spdMul0);
      });
    }
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
      // 死区收到 3px：轻推即响应，不用大幅拖才能动
      if (Math.hypot(dx, dy) > 3) {
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
    // 摇杆优先于键盘（触屏时通常无键盘输入）
    if (joy) { vx = joy.x; vy = joy.y; }

    this.player.moveWith(vx, vy, dt);
    this.player.layoutFollowers();
    this.player.updateTimers(dt);

    this.ground.update(this.cameras.main.scrollX, this.cameras.main.scrollY,
      this.scale.width, this.scale.height);

    // 刷怪
    this.updateSpawning(dt);
    this.enemies.update(this.player.x, this.player.y, time);

    // 战斗
    this.combat.update(delta, time);

    // 敌人接触伤害
    this.checkPlayerHit();

    // 经验球吸附
    this.updateOrbs(dt);
    this.updatePickups(dt);
    this.updateChests(dt);
    this.updateChestsPickup(dt);

    if (this.player.isDead) { this.endRun(false); return; }
    // 时间到不再直接过关 —— 必须击杀终局 BOSS
    if (this.elapsed >= RUN_SECONDS && !this.finalBossSpawned) this.spawnFinalBoss();
    this.updateBossBar();
    this.updateBossSkill(delta);
  }

  /** 时间到：刷出终局 BOSS，杀掉才算过关 */
  private spawnFinalBoss() {
    this.finalBossSpawned = true;
    // 终局 BOSS 同样从屏幕外进场，给玩家一个"它来了"的准备时间
    const p = this.ringPosition(this.offscreenRadius(), SPAWN_BAND);
    const boss = this.enemies.spawn('boss', p.x, p.y, 1, 1, 30);
    this.bossRef = boss;
    if (boss) {
      // 记住实际刷出来的是哪只 BOSS：血条上的名字必须跟着贴图走，
      // 不能写死「黑化超梦」—— BOSS_POOL 里还有班基拉斯。
      const texKey = boss.texture.key;
      const pkId = Number(texKey.replace('pk_', ''));
      this.bossPokemonName = POKEDEX_NAME[pkId] ?? '神秘 BOSS';
      this.bossPokemonId = pkId;
      // BOSS 血量同样吃关卡倍率；终局 BOSS 血量翻倍（6600 → 13200 基础）
      const hp = 3000 * 2.2 * 2 * this.stageScale.hp;
      boss.setData('hp', hp);
      boss.setData('maxHp', hp);
      boss.setData('isFinal', true);
      boss.setScale(boss.scaleX * 1.25, boss.scaleY * 1.25);
      // 记录出生世界坐标，用于技能判定
      boss.setData('spawnX', p.x);
      boss.setData('spawnY', p.y);
    }
    this.cameras.main.flash(600, 160, 0, 0);
    this.cameras.main.shake(500, 0.014);
    Sfx.bossSpawn();
    // 清场：所有小怪/精英直接消失（不给经验，纯清场）
    this.cullMinions();
    this.onFinalBossAnnounce();
  }

  /** BOSS 登场清场：移除除 BOSS 外的所有敌人 */
  private cullMinions() {
    const boss = this.bossRef;
    for (const e of this.enemies.group.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      if (!e.active || e === boss) continue;
      // 消失特效：粉紫爆散
      this.combat.fx.burst(e.x, e.y, 0xb06bff, 6, 170, 2.6, 260);
      (e.body as Phaser.Physics.Arcade.Body).setEnable(false);
      e.setActive(false).setVisible(false);
    }
  }

  get mapThemeIndex() { return this.mapIndex; }

  /** 当前时间阶段（0~5），按整局进度均分成 6 段 */
  get timeStage() {
    return Math.min(5, Math.floor((this.elapsed / RUN_SECONDS) * 6));
  }

  /**
   * 调试：跳到指定时间阶段。
   *
   * 改版后地图在一局内固定不切换，这 6 个按钮只跳时间轴 ——
   * 让时间成长（血量、速度、刷怪密度、精英波次）跳到对应阶段，
   * 地图和怪物池保持不变。
   */
  /** 当前时间阶段（开发者跳转用；0~5，仅影响显示，不影响地图） */
  devTimeStage = 0;

  jumpToMap(index: number) {
    const i = Math.max(0, Math.min(5, index));
    this.devTimeStage = i;
    this.mapIndex = Math.max(0, Math.min(STAGE_COUNT - 1, this.mapIndex));
    // 对齐到该时间段的开头
    this.elapsed = (i / 6) * RUN_SECONDS + 0.5;
    // 清掉已经触发过的 BOSS 标记，允许重新触发
    this.bossSpawned = { 200: this.elapsed >= 200, 280: this.elapsed >= 280 };
    this.eliteTimer = 0;
    // 地图不换，只给一个轻提示
    this.flashTimeStage(i);
  }

  /** 时间阶段跳转的轻量提示（不换地图，只提示时间点） */
  private flashTimeStage(stage: number) {
    const w = this.scale.width, h = this.scale.height;
    const label = `${stage * 50} 秒 · 强度阶段 ${stage + 1}/6`;
    const t = this.add.text(w / 2, h * 0.42, label, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(300).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, y: h * 0.42 - 8, duration: 220, ease: 'Cubic.easeOut' });
    this.tweens.add({
      targets: t, alpha: 0, delay: 900, duration: 400,
      onComplete: () => t.destroy(),
    });
  }

  /** 切换地图时的横幅提示 */
  private onMapChange(index: number) {
    Sfx.mapChange();
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

    const line = this.add.rectangle(w / 2, cy + 52, 0, 2, UI.primary, 0.9)
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

  private updatePickups(dt: number) {
    if (!this.pickups) return;
    const cam = this.cameras.main;
    this.pickups.update(dt, this.player.x, this.player.y, cam);

    // 护盾/利剑倒计时
    if (this.shieldTimer > 0) this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    if (this.swordTimer > 0) {
      this.swordTimer = Math.max(0, this.swordTimer - dt);
      const base = this.baseDamageMul;
      this.player.stats.damageMul = this.swordTimer > 0 ? base * 2 : base;
    }

    // 拾取判定
    for (const obj of this.pickups.groupRef.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!obj.active) continue;
      const d = Phaser.Math.Distance.Between(obj.x, obj.y, this.player.x, this.player.y);
      if (d < 26) this.applyPickup(obj);
    }

    this.drawPickupArrows();
  }

  private applyPickup(obj: Phaser.Physics.Arcade.Image) {
    const kind = obj.getData('kind') as PickupKind;
    const def = PICKUP_DEFS[kind];
    if (kind === 'magnet') {
      // 吸取全场经验球
      for (const o of this.orbGroup.getChildren() as Phaser.Physics.Arcade.Image[]) {
        if (!o.active) continue;
        o.setData('magnetized', true);
      }
      this.cameras.main.flash(220, 120, 40, 40);
    } else if (kind === 'shield') {
      this.shieldTimer = 15;
      this.cameras.main.flash(220, 60, 130, 200);
    } else {
      // 不要在这里重设 baseDamageMul —— 那是「本局基础伤害」，
      // 被改成当前值（含双倍）后，利剑到期还原就会一路翻倍上去。
      this.swordTimer = 15;
      this.cameras.main.flash(220, 200, 170, 50);
    }
    Sfx.select();
    const label = this.add.text(obj.x, obj.y - 10, `${def.name}!`, {
      fontFamily: 'sans-serif', fontSize: '14px', fontStyle: 'bold',
      color: `#${def.color.toString(16).padStart(6, '0')}`,
      stroke: '#041018', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9);
    this.tweens.add({
      targets: label, y: obj.y - 44, alpha: 0, duration: 800,
      onComplete: () => label.destroy(),
    });
    this.pickups.consume(obj);
  }

  /** 屏幕外道具在屏幕边缘画箭头 */
  private drawPickupArrows() {
    if (!this.pickupArrowGfx) {
      this.pickupArrowGfx = this.add.graphics().setScrollFactor(0).setDepth(480);
    }
    const g = this.pickupArrowGfx;
    g.clear();
    const cam = this.cameras.main;
    const w = this.scale.width, h = this.scale.height;
    const margin = 34;

    for (const a of this.pickups.arrows) {
      if (a.onScreen) continue;
      // 世界坐标 → 屏幕坐标
      const sx = (a.x - cam.worldView.x) * cam.zoom;
      const sy = (a.y - cam.worldView.y) * cam.zoom;
      const cxs = w / 2, cys = h / 2;
      const ang = Math.atan2(sy - cys, sx - cxs);
      // 投影到屏幕边缘矩形
      const hw = w / 2 - margin, hh = h / 2 - margin;
      const t = Math.min(
        Math.abs(hw / Math.cos(ang)) || Infinity,
        Math.abs(hh / Math.sin(ang)) || Infinity,
      );
      const ax = cxs + Math.cos(ang) * t;
      const ay = cys + Math.sin(ang) * t;

      const color = PICKUP_DEFS[a.kind].color;
      g.fillStyle(color, 0.95);
      g.beginPath();
      const s = 9;
      g.moveTo(ax + Math.cos(ang) * s, ay + Math.sin(ang) * s);
      g.lineTo(ax + Math.cos(ang + 2.5) * s, ay + Math.sin(ang + 2.5) * s);
      g.lineTo(ax + Math.cos(ang - 2.5) * s, ay + Math.sin(ang - 2.5) * s);
      g.closePath();
      g.fillPath();
    }
  }

  private updateSpawning(dt: number) {
    // 终局 BOSS 阶段：不再刷任何小怪
    if (this.finalBossSpawned) return;
    const t = this.elapsed;
    // 刷怪速率：极平缓的幂曲线，全程几乎线性微增
    // 开局 0.5/s，120 秒 2.2/s，300 秒 3.5/s
    const theme = this.ground.theme;
    // 地图同步给怪物池
    this.enemies.theme = theme;
    const rate = (0.62 + 3.3 * Math.pow(Math.min(t, RUN_SECONDS) / RUN_SECONDS, 0.65))
      * (theme.spawnMul ?? 1);
    this.spawnAccum += dt * rate;
    // 血量成长：原 1 + t/45 在 2 分钟就涨到 3.7 倍，太陡。
    // 改为 300 秒内从 1 涨到 2.2 倍，前段几乎持平，后段缓慢加速。
    // 血量成长放缓：原 1.2 系数 → 0.55，指数 1.35 → 1.5。
    // 后期（5 分钟）从 2.20 倍降到 1.55 倍，减负约 30%；
    // 前 2 分钟几乎持平，避免开局变得太软。
    // 血量 = 时间成长 × 本关血量倍率（关卡连乘，第 6 关 2.49×）
    const hpMul = (1 + 0.55 * Math.pow(Math.min(t, 300) / 300, 1.5)) * this.stageScale.hp;
    // 速度成长：原 1 + t/220 在 5 分钟涨到 2.36 倍，主角固定速度必被追上。
    // 改为 300 秒内只涨到 1.18 倍，且前 90 秒完全不加速。
    const speedMul = (1 + 0.18 * Math.pow(Math.max(0, Math.min(t, 300) - 90) / 210, 1.5))
      * this.stageScale.spd;

    // 同屏怪物上限。设计值 300 —— 手机端 260 会明显感觉“打到一半没怪了”。
    const cap = 300;
    // 每帧最多批量刷出数：全程保持 1-2，避免整屏瞬间涌出
    const batch = t < 120 ? 1 : t < 240 ? 2 : 3;
    while (this.spawnAccum >= 1) {
      this.spawnAccum -= 1;
      if (this.enemies.countActive() >= cap) continue;
      for (let i = 0; i < batch; i++) this.spawnRing(hpMul, speedMul);
    }

    // 精英：每 30 秒一波，数量随时间缓慢增加
    this.eliteTimer += dt;
    if (this.eliteTimer >= 30) {
      this.eliteTimer = 0;
      const n = 1 + Math.floor(t / 120);
      for (let i = 0; i < n; i++) {
        // 精英也从视口外进场，不用固定 360（大屏上会直接刷在视野里）
        const p = this.ringPosition(this.offscreenRadius(), SPAWN_BAND);
        this.enemies.spawn('elite', p.x, p.y, hpMul + 0.5, speedMul, 16);
      }
    }

    // BOSS：200 秒 / 280 秒（原 600 / 840）
    for (const sec of [200, 280]) {
      if (!this.bossSpawned[sec] && this.elapsed >= sec) {
        this.bossSpawned[sec] = true;
        const p = this.ringPosition(this.offscreenRadius(), SPAWN_BAND);
        this.bossRef = this.enemies.spawn('boss', p.x, p.y, 1, 1, 26);
        this.cameras.main.flash(400, 120, 0, 0);
        this.events.emit('boss-announce');
      }
    }
  }

  /**
   * 当前视口「一定看不到」的最小半径。
   *
   * 取可见矩形的半对角线（四个角到屏幕中心的最远距离），
   * 再加上固定余量。这样无论从哪个角度往外量，都保证在屏幕外。
   */
  private offscreenRadius(): number {
    const cam = this.cameras.main;
    const halfW = cam.width / cam.zoom / 2;
    const halfH = cam.height / cam.zoom / 2;
    return Math.hypot(halfW, halfH) + SPAWN_MARGIN;
  }

  /**
   * 在玩家周围的环形上取一个点，半径由调用方给。
   *
   * 老接口保留（BOSS/精英还按固定半径刷），但注意：
   * 小怪走 offscreenRadius()，不传死值。
   */
  private ringPosition(dist: number, jitter = 40) {
    const ang = Math.random() * Math.PI * 2;
    const d = dist + Math.random() * jitter;
    return { x: this.player.x + Math.cos(ang) * d, y: this.player.y + Math.sin(ang) * d };
  }

  /**
   * 普通小怪刷新点：**每次都从当前视口之外冒出来**。
   *
   * 半径 = 视口半对角线 + 30 余量，再随机往外推 0~70，
   * 所以怪一定在屏幕外，且不会远到要走十几秒才现身。
   */
  private spawnRing(hpMul: number, speedMul: number) {
    const p = this.ringPosition(this.offscreenRadius(), SPAWN_BAND);
    this.enemies.spawn('normal', p.x, p.y, hpMul, speedMul, 8);
  }

  private checkPlayerHit() {
    if (this.shieldTimer > 0) return;   // 护盾期间完全无敌
    if (this.player.hurtTimer > 0) return;  // 无敌帧内不做检测，避免一次性被多只怪叠死
    const hb = this.player.getBounds();
    let hit = false;
    this.enemies.forEachActive((e) => {
      if (hit) return;
      if (Phaser.Geom.Intersects.RectangleToRectangle(hb, e.getBounds())) {
        // 接触伤害 = 基础伤害的 55%；手机屏更小更难走位，降到 42%
        // 再乘本关的攻击倍率（关卡连乘，第 6 关约 2.01×）
        const dmgScale = this.scale.width < 520 ? 0.28 : 0.38;
        this.player.takeDamage((e.getData('dmg') as number) * dmgScale * this.stageScale.atk);
        hit = true;
      }
    });
  }

  /** 掉落回血球（恢复 20% 最大生命） */
  private dropHealOrb(x: number, y: number) {
    const orb = this.healGroup.get(x, y, 'healorb') as Phaser.Physics.Arcade.Image | null;
    if (!orb) return;
    orb.setActive(true).setVisible(true).setDepth(5).setScale(0.9);
    orb.setData('heal', 0.2);
    orb.setAlpha(1);
    orb.clearTint();
    const body = orb.body as Phaser.Physics.Arcade.Body;
    body.setEnable(true);
    body.reset(x, y);

    // 光晕：绿色脉冲，跟经验球区分
    const glow = this.add.circle(x, y, 14, 0x2bd85a, 0.4).setDepth(4);
    this.tweens.add({
      targets: glow, scale: 1.7, alpha: 0, duration: 650, repeat: 2,
      onComplete: () => glow.destroy(),
    });
    // 出现时轻微弹跳
    this.tweens.add({
      targets: orb, scale: { from: 1.25, to: 0.9 }, duration: 260, ease: 'Back.Out',
    });
  }

  private dropOrb(x: number, y: number, value: number, isElite = false, isBoss = false) {
    const orb = this.orbGroup.get(x, y, 'orb') as Phaser.Physics.Arcade.Image | null;
    if (!orb) return;
    orb.setActive(true).setVisible(true).setDepth(5);
    orb.setData('value', value);
    orb.setAlpha(1);

    // 颜色分层：BOSS 金 / 精英紫 / 普通按价值蓝绿
    // 纹理 16px、主体半径 6，这里的 scale 让实际显示比原来更小巧
    if (isBoss) {
      orb.setTint(0xffd75e);      // 金色
      orb.setScale(1.15);
    } else if (isElite) {
      orb.setTint(0xb06bff);      // 紫色，一眼分辨
      orb.setScale(0.95);
    } else {
      orb.setTint(value >= 3 ? 0x63c256 : 0x4592e0);
      orb.setScale(value >= 3 ? 0.75 : 0.62);
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

  // ---------- 宝箱 ----------

  /**
   * 宝箱纹理：金色木箱 + 锁扣。
   * 和经验球/回血球一样用代码画，不走图片资源。
   */
  private makeChestTexture() {
    if (this.textures.exists('chest')) return;
    const S = 26, w = 20, h = 15, x = (S - w) / 2, y = (S - h) / 2 + 2;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // 箱体：棕木色
    g.fillStyle(0x8a5a2b, 1); g.fillRoundedRect(x, y, w, h, 2);
    // 箱盖：略亮，上方一条
    g.fillStyle(0xa9713a, 1); g.fillRoundedRect(x, y, w, h * 0.42, 2);
    // 金色描边
    g.lineStyle(1.6, 0xf0c14a, 1); g.strokeRoundedRect(x, y, w, h, 2);
    // 金色竖条（包角）
    g.fillStyle(0xf0c14a, 1);
    g.fillRect(x + 3, y, 2, h);
    g.fillRect(x + w - 5, y, 2, h);
    // 锁扣
    g.fillStyle(0xffe27a, 1);
    g.fillRoundedRect(x + w / 2 - 2.5, y + h * 0.42 - 2.5, 5, 6, 1);

    g.generateTexture('chest', S, S);
    g.destroy();
  }

  /**
   * 每隔 CHEST_INTERVAL 秒在玩家周围刷一个宝箱。
   * 位置取玩家视线外一圈，避免直接刷在脚下「白送」。
   */
  private updateChests(dt: number) {
    // 终局 BOSS 阶段不再刷宝箱：此时玩家在决战，多一张卡反而打断节奏
    if (this.finalBossSpawned || this.runEnded) return;

    this.chestTimer += dt;
    if (this.chestTimer < GameScene.CHEST_INTERVAL) return;
    this.chestTimer -= GameScene.CHEST_INTERVAL;
    this.spawnChest();
  }

  private spawnChest() {
    // 场景外一圈随机位置，玩家要走过去拿
    const p = this.ringPosition(this.offscreenRadius() * 0.85, 40);
    const chest = this.chestGroup.get(p.x, p.y, 'chest') as Phaser.Physics.Arcade.Image | null;
    if (!chest) return;

    // 1.35 倍：26px 纹理在手机上只有指甲盖大，放大到明显能看见
    chest.setActive(true).setVisible(true).setDepth(5).setScale(1.35);
    chest.setAlpha(1);
    (chest.body as Phaser.Physics.Arcade.Body).setEnable(true);
    (chest.body as Phaser.Physics.Arcade.Body).reset(p.x, p.y);

    // 出场：放大弹一下 + 金色光晕，提醒玩家「这里有东西」
    this.tweens.add({
      targets: chest, scale: { from: 0.5, to: 1.55 }, duration: 320, ease: 'Back.Out',
      onComplete: () => chest.setScale(1.35),
    });
    const glow = this.add.circle(p.x, p.y, 20, 0xffd75e, 0.35).setDepth(4);
    this.tweens.add({
      targets: glow, scale: 2.0, alpha: 0, duration: 800, repeat: 2,
      onComplete: () => glow.destroy(),
    });
    // 常驻光晕：纯描边缩到低透明度后肉眼几乎不可见，
    // 改成「实心金圆底 + 描边」，脉冲时始终保持可辨认的亮度。
    const halo = this.add.circle(p.x, p.y, 18, 0xffd75e, 0.28)
      .setStrokeStyle(2.5, 0xffe9a0, 0.95)
      .setDepth(4);
    this.tweens.add({
      targets: halo,
      scale: { from: 0.9, to: 1.28 }, alpha: { from: 0.95, to: 0.45 },
      duration: 820, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    chest.setData('halo', halo);
    // 上下浮动，一眼看出是「可拾取物」而不是地形
    this.tweens.add({
      targets: chest, y: p.y - 4, duration: 780, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    this.events.emit('chest-spawned');
  }

  private updateChestsPickup(dt: number) {
    const px = this.player.x, py = this.player.y;
    const pickup = this.player.stats.pickup;
    for (const c of this.chestGroup.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!c.active) continue;
      const halo = c.getData('halo') as Phaser.GameObjects.Arc | null;
      if (halo) halo.setPosition(c.x, c.y);

      // 用 sprite 坐标算距离：浮动补间只改 sprite.y，不动 physics body
      const d = Phaser.Math.Distance.Between(px, py, c.x, c.y);
      // 宝箱不吸附，必须走过去踩到，避免「满屏自动捡」
      if (d < 26) {
        this.openChestBox(c);
      }
    }
  }

  /** 打开宝箱：销毁宝箱，弹三选一 */
  private openChestBox(chest: Phaser.Physics.Arcade.Image) {
    const halo = chest.getData('halo') as Phaser.GameObjects.Arc | null;
    if (halo) { this.tweens.killTweensOf(halo); halo.destroy(); }
    // 停掉浮动补间，否则对象池复用时新宝箱会继承旧的 y 动画
    this.tweens.killTweensOf(chest);

    this.combat.fx.burst(chest.x, chest.y, 0xffd75e, 20, 240, 3.2, 400);
    Sfx.levelUp();
    chest.setActive(false).setVisible(false);
    (chest.body as Phaser.Physics.Arcade.Body).setEnable(false);

    // 和升级共用同一套三选一界面。
    // 若此刻还有没弹完的升级，先把升级弹完，宝箱留到下一次
    // （否则两个三选一会互相覆盖）。
    if (this.pendingLevelUps > 0) {
      this.chestTimer = 0;
      this.pendingChest = true;
      return;
    }
    this.paused = true;
    this.scene.pause();
    this.scene.launch('LevelUp', { game: this, fromChest: true });
  }

  // ---------- 宝箱挑选结束 ----------

  private updateOrbs(dt: number) {
    const px = this.player.x, py = this.player.y;
    const pickup = this.player.stats.pickup;
    for (const o of this.orbGroup.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!o.active) continue;
      const d = Phaser.Math.Distance.Between(px, py, o.x, o.y);
      // 磁铁效果：全场经验无视距离高速飞向玩家
      if (d < pickup || o.getData('magnetized')) {
        const ang = Math.atan2(py - o.y, px - o.x);
        const spd = o.getData('magnetized') ? 1200 : 420;
        o.x += Math.cos(ang) * spd * dt;
        o.y += Math.sin(ang) * spd * dt;
      }
      if (d < 18) {
        const gain = (o.getData('value') as number) * this.player.stats.expMul;
        o.setActive(false).setVisible(false);
        (o.body as Phaser.Physics.Arcade.Body).setEnable(false);
        Sfx.pickup();
        this.gainExp(gain);
      }
      if (d > 3000) { o.setActive(false).setVisible(false); (o.body as Phaser.Physics.Arcade.Body).setEnable(false); }
    }

    // 回血球拾取（同样的吸附范围，但恢复 20% 最大生命）
    for (const h of this.healGroup.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!h.active) continue;
      const d = Phaser.Math.Distance.Between(px, py, h.x, h.y);
      if (d < pickup) {
        const ang = Math.atan2(py - h.y, px - h.x);
        h.x += Math.cos(ang) * 420 * dt;
        h.y += Math.sin(ang) * 420 * dt;
      }
      if (d < 20) {
        const pct = (h.getData('heal') as number) ?? 0.2;
        // 活力特性等回血加成：按倍率放大恢复量
        const amount = Math.round(this.player.stats.maxHp * pct * this.player.stats.healMul);
        this.player.heal(amount);
        Sfx.heal();
        this.combat.fx.burst(h.x, h.y, 0x2bd85a, 14, 200, 3, 300);
        // 飘字提示
        this.showHealFloat(h.x, h.y, amount);
        h.setActive(false).setVisible(false);
        (h.body as Phaser.Physics.Arcade.Body).setEnable(false);
      }
      if (d > 3000) { h.setActive(false).setVisible(false); (h.body as Phaser.Physics.Arcade.Body).setEnable(false); }
    }
  }

  /** 拾取回血球的绿色飘字 */
  private showHealFloat(x: number, y: number, amount: number) {
    const t = this.add.text(x, y - 8, `+${amount}`, {
      fontFamily: 'sans-serif', fontSize: '15px', fontStyle: 'bold',
      color: '#5cf07a', stroke: '#062b10', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(9);
    this.tweens.add({
      targets: t, y: y - 40, alpha: 0, duration: 700,
      onComplete: () => t.destroy(),
    });
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
      Sfx.levelUp();
      this.scene.pause();
      this.scene.launch('LevelUp', { game: this });
    }
  }

  pendingLevelUps = 0;

  /** 宝箱三选一选完：不消耗升级次数，直接恢复 */
  resumeFromChest() {
    if (this.pendingLevelUps > 0) {
      this.scene.launch('LevelUp', { game: this });
    } else {
      this.paused = false;
      this.scene.resume();
    }
  }

  /** UI 层调用：卡牌选择完成 */
  resumeFromLevelUp() {
    this.pendingLevelUps--;
    if (this.pendingLevelUps > 0) {
      this.scene.launch('LevelUp', { game: this });
    } else if (this.pendingChest) {
      // 升级弹完，轮到挂起的宝箱
      this.pendingChest = false;
      this.scene.launch('LevelUp', { game: this, fromChest: true });
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
      // 允许逐级进化：已进化 N 次 → 下一次要满足「招式 Lv.(5×(N+1))」
      const ladder = evoLadderFor(moveId, stage);
      if (!ladder) continue;
      const next = ladder.def;
      const moveCtx = { ...ctx, moveLevel: this.combat.getMoveLevel(moveId) };
      // 多级进化只看招式等级门槛（每 5 级一次），不再看玩家总等级/时长
      if (stage > 0) {
        if (this.combat.getMoveLevel(moveId) >= ladder.moveLevel) {
          out.push({ moveId, evo: next });
        }
        continue;
      }
      // 第一次进化：老规则保留（玩家等级 / 存活时长 / 招式 8 级任一）
      if (canEvolve(next, moveCtx)) out.push({ moveId, evo: next });
    }
    return out;
  }

  /** 按招式 id 反查宝可梦中文名（用可玩池作映射） */
  private pokeNameOf(moveId: string): string {
    return POKEMON_PLAYABLE.find((p) => p.move === moveId)?.name ?? '';
  }

  buildUpgradeOptions(): UpgradeOption[] {
    const pool: UpgradeOption[] = [];
    /** pool 里每个下标的抽取权重，缺省为 1 */
    const statWeights = new Map<number, number>();
    const owned = this.combat.slotIds;

    // ── 进化：满足条件的优先塞进池子（策划案 §4.4） ──
    this.pendingEvolutions().forEach(({ moveId, evo }) => {
      pool.push({
        kind: 'evolve', id: `evo_${moveId}_${evo.toId}`,
        // 标题只写「进化」：名字可能长到 11 个字（电击魔兽 · 觉醒形态），
        // 塞进标题会压住卡片中间的图标。名字本来就会显示在大图下方，
        // desc 不再重复，否则换行后顶到卡片底沿。
        title: '进化',
        desc: evo.note,
        color: MOVES[moveId].color,
        portraitId: evo.toId,
        pokeId: evo.toId, pokeName: evo.name,
        apply: () => {
          const ok = this.combat.evolve(moveId, evo);
          // 进化成功才放仪式感演出，避免槽位已满等失败情况白播一场
          if (ok) this.playEvolveCeremony(moveId, evo);
        },
      });
    });

    // 招式升级
    for (const id of owned) {
      const def = MOVES[id];
      const lv = this.combat.getMoveLevel(id);
      // 进化后：卡面用进化后的招式名和宝可梦，玩家看到的就是雷丘而不是皮卡丘
      const evoName = this.combat.getEvoName(id);
      const displayName = evoName ?? def.name;
      const displayPokeId = this.combat.getDisplayPokeId(id) ?? def.pokeId;
      pool.push({
        kind: 'upgrade', id: `up_${id}`, title: `${displayName}  Lv.${lv + 1}`,
        desc: `伤害 +18%（当前 Lv.${lv}）`, color: def.color,
        pokeId: displayPokeId,
        pokeName: POKEDEX_NAME[displayPokeId] ?? this.pokeNameOf(id),
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
          pokeId: def.pokeId, pokeName: this.pokeNameOf(def.id),
          apply: () => {
            this.combat.addMove(def.id);
            // 图鉴：升级拿到的伙伴同样要记入「伙伴」页。
            // 之前只记了开局那一只，所以用完 6 个伙伴只解锁 1~2 个。
            this.markPartnerSeen(def.id);
          },
        });
      }
    }

    // 属性加成
    // 前 3 级不给属性卡：开局只让玩家抽招式/进化，先把构筑立起来，
    // 避免前三次升级就被「伤害 +12%」这类万金油占掉。
    // 3 级之后按权重抽取，整体出现频率随后期逐步抬升。
    if (this.level > 3) {
      const statUpgrades: UpgradeOption[] = [
        { kind: 'stat', id: 'atk', title: '力量强化', desc: '伤害 +12%', color: 0xf0703c, apply: () => { this.player.stats.damageMul *= 1.12; this.addStatStack('atk'); } },
        { kind: 'stat', id: 'spd', title: '疾行', desc: '移速 +8%', color: 0x449ddf, apply: () => { this.player.stats.speed *= 1.08; this.addStatStack('spd'); } },
        { kind: 'stat', id: 'hp', title: '体力强化', desc: '最大 HP +20 并回满', color: 0x63c256, apply: () => { this.player.stats.maxHp += 20; this.player.stats.hp = this.player.stats.maxHp; this.addStatStack('hp'); } },
        { kind: 'stat', id: 'pick', title: '磁力', desc: '拾取范围 +25%', color: 0xf7d02c, apply: () => { this.player.stats.pickup *= 1.25; this.addStatStack('pick'); } },
        { kind: 'stat', id: 'cd', title: '迅捷', desc: '招式冷却 -8%', color: 0x8a5fbf, apply: () => { this.player.stats.cooldownMul *= 0.92; this.addStatStack('cd'); } },
      ];
      // 权重：每张属性卡从 1 张降为 STAT_WEIGHT 份，权重随等级线性回升，
      // 满 12 级回到 1.0（与原来一张顶一份持平），所以只是整体下调、不是永久削弱。
      const statWeight = Phaser.Math.Clamp((this.level - 3) / 9, 0.15, 1) * STAT_CARD_WEIGHT;
      for (const s of statUpgrades) {
        // 用同一份卡片的引用，靠 poolWeights 记权重，选中后再去重
        pool.push(s);
        statWeights.set(pool.length - 1, statWeight);
      }
    }

    // 抽 3 个不重复；进化卡优先占位
    // 用「权重 × 随机数」排序代替纯 shuffle：属性卡权重低，自然排到后面，
    // 但不至于完全抽不到（权重 0.5 仍有约一半的机会挤进前三）。
    const weighted = pool.map((o, i) => ({
      o,
      k: (statWeights.get(i) ?? 1) * Math.random(),
    }));
    weighted.sort((a, b) => b.k - a.k);
    const ordered = weighted.map((w) => w.o);

    const chosen: UpgradeOption[] = [];
    const usedTitles = new Set<string>();

    // 先进化卡（保证满足条件时一定能看到）
    for (const o of ordered) {
      if (o.kind !== 'evolve') continue;
      if (chosen.length >= 3) break;
      usedTitles.add(o.title);
      chosen.push(o);
    }

    for (const o of ordered) {
      if (chosen.length >= 3) break;
      if (usedTitles.has(o.title)) continue;
      usedTitles.add(o.title);
      chosen.push(o);
    }
    return chosen;
  }

  /**
   * 第四层：进化瞬间的仪式感。
   *
   * 四拍连招，总长约 1.1 秒，全程不影响玩家操作：
   *  1. 全屏短暂去饱和（camera.postFX 没开时降级为闪白），突出「变身」的瞬间
   *  2. 一道彩色冲击波从玩家身上炸开，颜色用招式主色
   *  3. 技能槽那一格放大回弹一下（Back 缓动）
   *  4. 底部技能槽短暂高亮
   * 所有补间都设成不阻塞输入，玩家边打边看。
   */
  private playEvolveCeremony(moveId: string, evo: EvolutionDef) {
    const cam = this.cameras.main;
    const def = MOVES[moveId];
    const evoFx = def?.evo;
    const main = evoFx?.color ?? def?.color ?? 0xffffff;
    const accent = evoFx?.accent ?? 0xffffff;
    const px = this.player.x, py = this.player.y;

    // 1. 视觉冲击：轻微闪白 + 短促震动（比普通命中重，但不刺眼）
    cam.flash(220, 240, 240, 255);
    cam.shake(260, 0.006);

    // 2. 冲击波：两道同心圆由内向外炸开，一主一辅
    const ring1 = this.add.circle(px, py, 14, main, 0);
    ring1.setStrokeStyle(6, main, 0.9).setDepth(20);
    const ring2 = this.add.circle(px, py, 14, accent, 0);
    ring2.setStrokeStyle(3, accent, 0.8).setDepth(21);
    this.tweens.add({
      targets: ring1, radius: 116, alpha: 0, duration: 520, ease: 'Cubic.easeOut',
      onComplete: () => ring1.destroy(),
    });
    this.tweens.add({
      targets: ring2, radius: 82, alpha: 0, duration: 640, ease: 'Cubic.easeOut', delay: 70,
      onComplete: () => ring2.destroy(),
    });

    // 3. 粒子：从玩家身上向外炸一圈彩色光点
    this.combat.fx.burst(px, py, main, 30, 320, 4, 620);
    this.combat.fx.burst(px, py, accent, 16, 220, 3, 520);

    // 4. 技能槽：放大回弹 + 高亮，让玩家立刻知道「是这一格变强了」
    this.events.emit('evolve-ceremony', { moveId, color: main, accent });
    void evo;
  }

  // ── 终局 BOSS：血条 / 宣告 / 技能 ──────────────────────────

  /** 屏幕底部 Boss 血条 */
  private onFinalBossAnnounce() {
    const w = this.scale.width, h = this.scale.height;
    const narrow = w < 640;
    // 主相机是 zoom=1.25，GameScene 里的 HUD 会被一起放大。
    // setScrollFactor(0) 只固定位置、不取消缩放，所以这里要把尺寸先除掉 zoom，
    // 渲染回屏幕上才是预期的像素尺寸 —— 否则 330px 的血条会被画成 413px 直接溢出屏幕。
    const z = this.cameras.main.zoom || 1;
    const barW = (Math.min(narrow ? w - 60 : 460, w - 60)) / z;
    const barH = 12 / z;
    // 底部已有技能栏 + 属性图标 + 摇杆区，血条放在它们上方
    const y = h - (narrow ? 170 : 120);

    // 名字
    const bossLabel = `${this.bossPokemonName ?? '终局'} · 终局`;
    this.bossNameText = this.add.text(w / 2, y - 24 / z, bossLabel, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: `${(narrow ? 15 : 17) / z}px`, fontStyle: 'bold', color: '#ff6b6b',
      stroke: '#1a0000', strokeThickness: 4 / z,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(420);

    // 底槽
    this.bossBarBg = this.add.rectangle(w / 2, y, barW, barH, 0x1a0a10, 0.9)
      .setOrigin(0.5).setScrollFactor(0).setDepth(420)
      .setStrokeStyle(1.5 / z, 0x8b1a2b);

    // 血条本体：左端固定在底槽左侧，用 scaleX 从左往右收缩
    this.bossBarFill = this.add.rectangle(w / 2 - barW / 2, y, barW, barH - 4 / z, 0xd63b4d, 1)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(421);
    this.bossBarW = barW;

    // 顶部大字宣告
    const banner = this.add.text(w / 2, h * 0.38, 'BOSS 来袭', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: `${(narrow ? 38 : 48) / z}px`, fontStyle: 'bold', color: '#ff4d4d',
      stroke: '#000000', strokeThickness: 6 / z,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(420).setAlpha(0).setScale(0.6);

    this.tweens.add({
      targets: banner, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out',
      hold: 900, yoyo: true, onComplete: () => banner.destroy(),
    });

    // 提示：击杀才能过关
    this.add.text(w / 2, y + 22 / z, '击杀 BOSS 才能过关', {
      fontFamily: 'sans-serif', fontSize: `${(narrow ? 11 : 12) / z}px`, color: '#ffb3b3',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(420).setName('bossHint');
  }

  /** 每帧刷新 Boss 血条 */
  private updateBossBar() {
    const boss = this.bossRef;
    if (!this.bossBarFill) return;
    if (!boss || !boss.active) {
      this.hideBossBar();
      return;
    }
    const hp = boss.getData('hp') as number;
    const maxHp = boss.getData('maxHp') as number;
    const ratio = Phaser.Math.Clamp(hp / Math.max(1, maxHp), 0, 1);
    // 中心原点：用 scaleX 收缩，保持左端与底槽对齐
    this.bossBarFill.scaleX = ratio;

    // 濒死闪红
    if (ratio < 0.25) {
      this.bossBarFill.fillColor = 0xff2a2a;
    } else {
      this.bossBarFill.fillColor = 0xd63b4d;
    }
  }

  private hideBossBar() {
    this.bossBarBg?.destroy(); this.bossBarBg = undefined;
    this.bossBarFill?.destroy(); this.bossBarFill = undefined;
    this.bossNameText?.destroy(); this.bossNameText = undefined;
    (this.children.getByName('bossHint') as Phaser.GameObjects.Text)?.destroy();
  }

  /** 终局 BOSS 技能：按属性走不同招式，每招都带粒子效果 */
  private updateBossSkill(dtMs: number) {
    const boss = this.bossRef;
    if (!boss || !boss.active || !boss.getData('isFinal')) return;

    this.bossSkillTimer += dtMs;
    if (this.bossSkillTimer < 2400) return;
    this.bossSkillTimer = 0;

    const hp = boss.getData('hp') as number;
    const maxHp = boss.getData('maxHp') as number;
    const enraged = hp / Math.max(1, maxHp) < 0.4;
    const prof = this.bossProfile();
    Sfx.bossSkill();

    switch (prof.kind) {
      case 'dragon': this.skillDragonRush(boss, prof, enraged); break;
      case 'storm':  this.skillThunderStorm(boss, prof, enraged); break;
      case 'ice':    this.skillIceShards(boss, prof, enraged); break;
      case 'water':  this.skillTidalWave(boss, prof, enraged); break;
      case 'rock':   this.skillRockQuake(boss, prof, enraged); break;
      default:       this.skillPsyWave(boss, prof, enraged); break;
    }
  }

  /** 按 BOSS 种类给出招式配置：颜色、粒子数、弹速都跟着属性走 */
  private bossProfile(): { kind: string; main: number; accent: number; motes: number } {
    switch (this.bossPokemonId) {
      case 150: return { kind: 'psy',    main: 0xc060ff, accent: 0xff7ae0, motes: 22 }; // 超梦：超能紫
      case 151: return { kind: 'psy',    main: 0xff8ad0, accent: 0xffe0f4, motes: 26 }; // 梦幻：粉光
      case 145: return { kind: 'storm',  main: 0xffe74d, accent: 0x8ad0ff, motes: 24 }; // 闪电鸟：雷黄
      case 144: return { kind: 'ice',    main: 0x7fd8ff, accent: 0xe6f9ff, motes: 24 }; // 急冻鸟：冰蓝
      case 131: return { kind: 'water',  main: 0x4aa8ff, accent: 0xa8e4ff, motes: 22 }; // 拉普拉斯：水蓝
      case 112: return { kind: 'rock',   main: 0xc08a4a, accent: 0xf0d59a, motes: 20 }; // 钻角犀兽：土石
      default:  return { kind: 'psy',    main: 0xff4d4d, accent: 0xffb3b3, motes: 18 };
    }
  }

  /** 地面系：震地 + 碎石飞溅 */
  private skillRockQuake(boss: Phaser.Physics.Arcade.Sprite, prof: { main: number; accent: number; motes: number }, enraged: boolean) {
    const fx = this.combat.fx;
    // 蓄力：脚下尘环
    fx.shockRing(boss.x, boss.y, prof.accent, 30, 260);
    this.cameras.main.shake(120, 0.004);

    this.time.delayedCall(340, () => {
      if (!boss.active) return;
      const n = enraged ? 14 : 10;
      const baseAng = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const a = baseAng + (Math.PI * 2 * i) / n;
        this.spawnBossBullet(boss.x, boss.y, a, enraged ? 240 : 200, prof.main, 2.2);
      }
      fx.burst(boss.x, boss.y, prof.accent, prof.motes, 280, 5, 520);
      fx.shockRing(boss.x, boss.y, prof.main, 110, 380);
      this.cameras.main.shake(240, 0.009);
    });
  }

  /** 水系：浪涌三连，扇形推进 */
  private skillTidalWave(boss: Phaser.Physics.Arcade.Sprite, prof: { main: number; accent: number; motes: number }, enraged: boolean) {
    const fx = this.combat.fx;
    const ang = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    const waves = enraged ? 3 : 2;
    for (let w = 0; w < waves; w++) {
      this.time.delayedCall(w * 220, () => {
        if (!boss.active) return;
        const n = enraged ? 13 : 11;
        for (let i = 0; i < n; i++) {
          const spread = (i / (n - 1) - 0.5) * 1.9;
          this.spawnBossBullet(boss.x, boss.y, ang + spread, 190 + w * 25, prof.main, 2.4);
        }
        fx.burst(boss.x, boss.y, prof.accent, 12, 190, 3.5, 380);
        fx.castPulse(boss.x, boss.y, prof.accent, 26);
      });
    }
    this.cameras.main.shake(140, 0.004);
  }

  /** 冰系：冰棱散射，命中冻结减速 */
  private skillIceShards(boss: Phaser.Physics.Arcade.Sprite, prof: { main: number; accent: number; motes: number }, enraged: boolean) {
    const fx = this.combat.fx;
    const ang = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    fx.castPulse(boss.x, boss.y, prof.accent, 30);

    this.time.delayedCall(300, () => {
      if (!boss.active) return;
      const n = enraged ? 9 : 7;
      for (let i = 0; i < n; i++) {
        const a = ang + (i / (n - 1) - 0.5) * 1.4;
        this.spawnBossBullet(boss.x, boss.y, a, 260, prof.main, 2.6, true);
      }
      // 冰霜炸开：一排小碎晶
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 40;
        fx.burst(boss.x + Math.cos(a) * d, boss.y + Math.sin(a) * d, prof.accent, 6, 120, 3, 460);
      }
      this.cameras.main.shake(160, 0.005);
    });
  }

  /** 电系：落雷三连，每道上一击落点周边再炸一圈 */
  private skillThunderStorm(boss: Phaser.Physics.Arcade.Sprite, prof: { main: number; accent: number; motes: number }, enraged: boolean) {
    const fx = this.combat.fx;
    const strikes = enraged ? 4 : 3;
    for (let k = 0; k < strikes; k++) {
      this.time.delayedCall(k * 300, () => {
        if (!boss.active) return;
        // 第一道砸玩家当前位置附近，后续随机偏移，避免全部重叠
        const jitter = k === 0 ? 0 : 90;
        const tx = this.player.x + Phaser.Math.Between(-jitter, jitter);
        const ty = this.player.y + Phaser.Math.Between(-jitter, jitter);
        // 从 BOSS 到落点拉一条电弧
        fx.bolt(boss.x, boss.y, tx, ty, prof.main);
        fx.burst(tx, ty, prof.main, prof.motes, 260, 4, 460);
        fx.shockRing(tx, ty, prof.accent, 80, 320);
        // 落点伤害
        const d = Phaser.Math.Distance.Between(tx, ty, this.player.x, this.player.y);
        if (d < 54) this.player.takeDamage(enraged ? 12 : 10);
        this.cameras.main.shake(150, 0.006);
      });
    }
  }

  /** 超能系：念力脉冲 + 追踪光球 */
  private skillPsyWave(boss: Phaser.Physics.Arcade.Sprite, prof: { main: number; accent: number; motes: number }, enraged: boolean) {
    const fx = this.combat.fx;
    // 蓄力环：向外扩散两层
    fx.shockRing(boss.x, boss.y, prof.accent, 40, 400);
    this.time.delayedCall(150, () => {
      if (boss.active) fx.shockRing(boss.x, boss.y, prof.main, 64, 460);
    });

    this.time.delayedCall(420, () => {
      if (!boss.active) return;
      const n = enraged ? 6 : 4;
      const baseAng = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
      for (let i = 0; i < n; i++) {
        const a = baseAng + (i / n) * Math.PI * 2;
        this.spawnBossBullet(boss.x, boss.y, a, 165, prof.main, 3.0);
      }
      fx.burst(boss.x, boss.y, prof.accent, prof.motes, 230, 4, 520);
      fx.castPulse(boss.x, boss.y, prof.main, 40);
    });
  }

  /** 龙/近战系：冲锋突进 + 冲击波 */
  private skillDragonRush(boss: Phaser.Physics.Arcade.Sprite, prof: { main: number; accent: number; motes: number }, enraged: boolean) {
    const fx = this.combat.fx;
    const ang = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    const dash = enraged ? 640 : 480;
    boss.setVelocity(Math.cos(ang) * dash, Math.sin(ang) * dash);
    fx.burst(boss.x, boss.y, prof.main, prof.motes, 250, 4.5, 380);
    this.cameras.main.shake(120, 0.004);

    this.time.delayedCall(420, () => {
      if (!boss.active) return;
      boss.setVelocity(0, 0);
      fx.shockRing(boss.x, boss.y, prof.accent, 90, 340);
      fx.burst(boss.x, boss.y, prof.accent, 16, 200, 4, 420);
      // 冲锋后甩一圈弹
      const n = enraged ? 12 : 8;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        this.spawnBossBullet(boss.x, boss.y, a, enraged ? 220 : 185, prof.main, 2.2);
      }
    });
  }

  /** BOSS 弹幕 */
  private spawnBossBullet(x: number, y: number, ang: number, speed: number,
                          color = 0xff3355, scale = 1.6, frost = false) {
    const b = this.physics.add.image(x, y, 'dot')
      .setDepth(7).setTintFill(color).setScale(scale);
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.setEnable(true);
    body.setCircle(6, -2, -2);
    b.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    this.combat.fx.burst(x, y, color, 3, 90, 2, 180);

    // 命中玩家判定
    const timer = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        if (!b.active) { timer.remove(); return; }
        const d = Phaser.Math.Distance.Between(b.x, b.y, this.player.x, this.player.y);
        if (d < 22) {
          this.player.takeDamage(frost ? 9 : 14);
          if (frost) {
            // 冰弹命中附带减速：把移速压到 70%，1.2 秒后恢复
            this.applyFrost();
          }
          this.combat.fx.burst(b.x, b.y, color, 8, 160, 3, 220);
          b.destroy(); timer.remove();
        }
      },
    });
    // 3.2 秒后自动销毁
    this.time.delayedCall(3200, () => { if (b.active) b.destroy(); timer.remove(); });
  }

  /** 冰弹命中：短暂减速。重复命中不叠加，只重置计时 */
  private applyFrost() {
    const st = this.player.stats;
    if (!this.frostActive) {
      this.frostActive = true;
      this.frostBaseSpeed = st.speed;
      st.speed *= 0.7;
    }
    this.frostTimer?.remove();
    this.frostTimer = this.time.delayedCall(1200, () => {
      if (this.frostActive) {
        st.speed = this.frostBaseSpeed;
        this.frostActive = false;
      }
    });
  }

  private endRun(survived: boolean) {
    if (this.runEnded) return;
    this.runEnded = true;
    // 开发者面板是「暂停 Game + 在 UI 上叠面板」。
    // 如果暂停期间玩家死了（比如重置把无敌关掉），GameOver 会挂在一个
    // 停住的场景上，玩家看到的就是画面冻结、点哪儿都没反应的「卡死」。
    // 所以结束前必须先把暂停解开。
    if (this.paused) {
      this.paused = false;
      this.scene.resume();
    }
    if (survived) Sfx.win(); else Sfx.lose();

    // 图鉴：本局见过的敌人一次性并入存档（不是每刷一只写一次）
    {
      const sv = loadSave();
      const seen = new Set(sv.seenEnemies ?? []);
      let changed = false;
      for (const id of this.enemies.getSeenIds()) {
        if (!seen.has(id)) { seen.add(id); changed = true; }
      }
      if (changed) { sv.seenEnemies = [...seen]; writeSave(sv); }
    }
    // 通关奖励：只有活到最后并击杀终局 BOSS 才有
    if (survived) {
      this.score += clearBonus(this.mapIndex);
    }

    // 写入本关最高分 + 判断是否破纪录
    const sv2 = loadSave();
    const best = Array.isArray(sv2.stageBest) && sv2.stageBest.length === STAGE_COUNT
      ? [...sv2.stageBest] : new Array(STAGE_COUNT).fill(0);
    const prevBest = best[this.mapIndex] ?? 0;
    const isNewRecord = this.score > prevBest;
    if (isNewRecord) {
      best[this.mapIndex] = this.score;
      sv2.stageBest = best;
      writeSave(sv2);
    }

    // 通关：解锁下一关（只在真实进度上前进，不受开发者全解锁影响）
    if (survived) {
      const sv = loadSave();
      const cleared = this.mapIndex;
      if (cleared >= (sv.stageProgress ?? 0)) {
        sv.stageProgress = Math.min(STAGE_COUNT - 1, cleared + 1);
        writeSave(sv);
      }
    }
    // 通知 UI 收掉可能还开着的开发者面板，否则它会盖在结算页上
    this.events.emit('run-ended');
    this.scene.launch('GameOver', {
      game: this,
      survived,
      time: this.elapsed,
      level: this.level,
      kills: this.combat.kills,
      score: this.score,
      prevBest,
      isNewRecord,
    });
  }

  /**
   * 加载某一关要用到的全部贴图。
   *
   * 一关 18 小怪 + 3~4 精英 ≈ 22 张，加上 6 BOSS、24 伙伴、8 进化目标，
   * 约 60 张 —— 比首屏 166 张省了三分之二。怪物贴图没到位会画成
   * 空白方块，所以必须在开打前请求，而不是刷出怪物时再临时加载。
   */
  /**
   * 把某个招式对应的宝可梦记入图鉴「伙伴」页。
   *
   * 开局招式 + 每个升级拿到的招式都要调。以前只在开局调一次，
   * 玩家一局用满 6 个伙伴却只解锁 1~2 个图鉴。
   */
  private markPartnerSeen(moveId: string) {
    const partnerId = MOVES[moveId]?.pokeId;
    if (!partnerId) return;
    const sv = loadSave();
    const seen = new Set(sv.seenPartners ?? []);
    if (seen.has(partnerId)) return;
    seen.add(partnerId);
    sv.seenPartners = [...seen];
    writeSave(sv);
  }

  private preloadRunSprites(stage: number) {
    const theme = MAP_THEMES[stage];
    const ids = new Set<number>([
      ...(theme?.enemyPool ?? []),
      ...(theme?.elitePool ?? []),
      ...BOSS_POOL,
      ...POKEMON_PLAYABLE.map((p) => p.id as number),
    ]);
    // 进化目标：伙伴觉醒/进化后要换图
    for (const list of Object.values(EVOLUTIONS)) {
      for (const evo of list) ids.add(evo.toId);
    }
    ensureSprites(this, [...ids]);
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
    // 珍珠质感：球面明暗渐变 + 左上高光 + 底部反光
    // 纹理尺寸 16×16，主体半径 6（比原来小），tint 仍由调用方决定颜色
    const S = 16;
    const cx = 8, cy = 8, R = 6;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // 1) 由外到内叠同心圆模拟球面：边缘偏暗、中心偏亮
    const STEPS = 7;
    for (let i = STEPS; i >= 1; i--) {
      const t = i / STEPS;          // 1 → 外圈
      const r = R * t;
      // 亮度：外圈 0.62 → 内圈 1.0
      const lum = 0.62 + 0.38 * (1 - t);
      const v = Math.round(255 * lum);
      g.fillStyle(Phaser.Display.Color.GetColor(v, v, v), 1);
      g.fillCircle(cx, cy, r);
    }

    // 2) 球体边缘压暗一圈，强化立体轮廓
    g.lineStyle(1, 0x000000, 0.22);
    g.strokeCircle(cx, cy, R - 0.5);

    // 3) 左上高光：亮点 + 柔光晕
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(cx - 2.4, cy - 2.4, 2.4);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 2.6, cy - 2.6, 1.3);

    // 4) 右下反光：模拟环境反射，珍珠感的关键
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(cx + 2.2, cy + 2.4, 1.4);

    g.generateTexture('orb', S, S);
    g.destroy();
  }

  /** 回血球纹理：绿色珍珠 + 十字医疗符号 */
  private makeHealOrbTexture() {
    if (this.textures.exists('healorb')) return;
    const S = 18, cx = 9, cy = 9, R = 7;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // 球面渐变（绿色）
    const STEPS = 7;
    for (let i = STEPS; i >= 1; i--) {
      const t = i / STEPS;
      const lum = 0.55 + 0.45 * (1 - t);
      const col = Phaser.Display.Color.GetColor(
        Math.round(40 * lum), Math.round(220 * lum), Math.round(90 * lum));
      g.fillStyle(col, 1);
      g.fillCircle(cx, cy, R * t);
    }
    // 外圈描边
    g.lineStyle(1.5, 0x0a3a18, 0.7);
    g.strokeCircle(cx, cy, R - 0.5);
    // 白色十字（医疗符号）
    g.fillStyle(0xffffff, 0.95);
    g.fillRect(cx - 1.5, cy - 4, 3, 8);
    g.fillRect(cx - 4, cy - 1.5, 8, 3);
    // 左上高光
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(cx - 2.6, cy - 2.6, 2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 2.8, cy - 2.8, 1.1);

    g.generateTexture('healorb', S, S);
    g.destroy();
  }

  get stats(): PlayerStats { return this.player.stats; }
}
