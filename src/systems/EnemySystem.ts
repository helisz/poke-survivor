import Phaser from 'phaser';
import { BOSS_POOL, ELITE_POOL, ENEMY_POOL, isFloating, isFloatingMon } from '../data/pokedex';
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
    // 只从「贴图已加载」的候选中挑：按需加载没到位时，
    // 随机撞上未加载的 id 会拿到 __MISSING 占位图（一块纯黑）。
    const ready = list.filter((id) => this.scene.textures.exists(`pk_${id}`));
    const pickFrom = ready.length > 0 ? ready : list;
    const id = Phaser.Utils.Array.GetRandom(pickFrom);
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

  /** 本局已记录过的 id，避免每刷一只怪就写一次 localStorage */
  private seenThisRun = new Set<number>();

  /**
   * 跳跃/浮空时的阴影同步。
   *
   * 和 ensureShadow 的差别：这个每帧调用，允许缩放和透明度变化。
   * 精灵本体用视觉偏移上移，影子必须留在「地面高度」（body.y），
   * 否则影子会跟着飞起来，离地感全没了。
   *
   * @param scaleMul 阴影缩放倍率（跳起时变小 = 离地更高）
   * @param alphaMul 阴影透明度倍率（跳起时变淡）
   */
  private syncShadow(e: Phaser.Physics.Arcade.Sprite, scaleMul: number, alphaMul: number) {
    const sh = this.shadows.get(e);
    if (!sh) { this.ensureShadow(e); return; }
    const body = e.body as Phaser.Physics.Arcade.Body;
    const kind = e.getData('kind') as EnemyKind;
    const floating = e.getData('floating') as boolean;
    const baseW = e.displayWidth * (kind === 'boss' ? 0.62 : kind === 'elite' ? 0.7 : 0.78);
    const baseH = Math.max(4, baseW * 0.32);
    const baseAlpha = floating ? 0.2 : kind === 'boss' ? 0.3 : 0.26;
    // 影子固定在物理体位置（地面），不跟随视觉偏移
    const dy = kind === 'boss' ? 30 : floating ? 20 : 14;

    sh.setSize(baseW * scaleMul, baseH * scaleMul)
      .setFillStyle(0x000000, baseAlpha * alphaMul)
      .setPosition(body.center.x, body.center.y + dy)
      .setDepth(5)
      .setVisible(e.active);
  }

  /**
   * 图鉴：记录这只怪见过。
   * 只在内存里按 key 去重，真正落盘交给 GameScene 结束时统一写一次。
   */
  private markSeen(key: string) {
    const id = Number(key.replace('pk_', ''));
    if (!id || this.seenThisRun.has(id)) return;
    this.seenThisRun.add(id);
  }

  /** 本局见过的敌人 id（供 GameScene 结算时并入存档） */
  getSeenIds(): number[] {
    return [...this.seenThisRun];
  }

  spawn(kind: EnemyKind, x: number, y: number, hpMul = 1, speedMul = 1, dmg = 8) {
    const key = this.pickKey(kind);
    // 按需加载下贴图可能还没到位：此时 group.get 会拿到 __MISSING 占位图，
    // 画出来就是一块纯黑。直接跳过本次生成，等下一帧再刷。
    if (!this.scene.textures.exists(key)) return null;
    let e = this.group.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!e) return null;
    // 图鉴：这只怪第一次出现在场上就算「见过」
    this.markSeen(key);
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

    // 移动表现：浮空 / 蹦跳。数据层按属性判定，BOSS 一律浮空。
    const pkId = Number(key.replace('pk_', ''));
    e.setData('floating', isFloatingMon(pkId, kind === 'boss'));
    // 相位随机错开，否则一屏怪同步跳动像集体做操
    e.setData('hopPhase', Math.random() * Math.PI * 2);
    // 跳跃频率由速度反推：跑得快的跳得急，慢的跳得缓。
    // clamp 到 0.9~2.0 Hz，避免极慢怪一秒跳半下、极快怪抖成噪点。
    const spd0 = e.getData('speed') as number;
    e.setData('hopHz', Phaser.Math.Clamp(0.9 + (spd0 - 62) / 90, 0.9, 2.0));
    // 精英/BOSS 幅度小：体型太大跳起来会飞出画面
    e.setData('hopAmp', kind === 'boss' ? 2.0 : kind === 'elite' ? 3.0 : 4.5 + Math.random() * 1.5);

    if (kind !== 'normal') this.applyBlacken(e);
    else e.clearTint();

    const body = e.body as Phaser.Physics.Arcade.Body;
    // 判定圈：随 GLOBAL_SCALE 缩小，保持和视觉尺寸贴合
    const base = kind === 'boss' ? 38 : kind === 'elite' ? 26 : 16;
    const r = Math.round(base * GLOBAL_SCALE);
    body.setCircle(r, e.width / 2 - r, e.height / 2 - r);
    body.setEnable(true);
    body.reset(x, y);
    // 记住原始 offset：跳跃时每帧改写 offset.y，回收复用时必须还原
    e.setData('origOffsetY', body.offset.y);
    // 立刻摆好阴影，避免第一帧出现「没影子」的闪烁
    this.ensureShadow(e);
    return e;
  }

  /**
   * 每帧物理跑完后，把跳跃偏移应用到渲染位置。
   *
   * 时机很关键：postupdate 时 body 已经算完并写回 sprite.y，
   * 此时我们再加偏移，既不影响本帧判定，也不会被下一帧的
   * updateFromGameObject 当成新位置读回去。
   */
  installLiftHook(scene: Phaser.Scene) {
    // ① 物理 step 之前：把上一帧加的偏移还原掉，让 body 读到真实地面位置
    scene.events.on('preupdate', () => {
      for (const e of this.group.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        if (!e.active) continue;
        const applied = e.getData('appliedLift') as number | undefined;
        if (applied) { e.y += applied; e.setData('appliedLift', 0); }
      }
    });
    // ② 物理 step 之后：再加上本帧的新偏移，只影响渲染
    scene.events.on('postupdate', () => {
      for (const e of this.group.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        if (!e.active) continue;
        const lift = e.getData('pendingLift') as number | undefined;
        if (lift) { e.y -= lift; e.setData('appliedLift', lift); }
      }
    });
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

      // ── 移动表现：只动视觉，不动物理体 ──
      // 关键：body 决定碰撞/命中/寻路。setY 会带着 body 一起走，
      // 怪跳起来就真的飞走了，命中判定全乱。
      // 所以要「先让物理跑完，再把 sprite 抬起来」：
      //   sprite.y = body 对应的正常显示位置 - lift
      // Physics 只在 step 里改 body，我们每帧在 update 末尾覆盖 sprite.y，
      // body 位置始终代表真实碰撞点，渲染却是跳着的。
      const phase = (e.getData('hopPhase') as number) ?? 0;
      const amp = (e.getData('hopAmp') as number) ?? 4;
      let lift = 0;
      if (e.getData('floating')) {
        // 浮空：缓慢上下浮动，周期 ~2.6 秒，与速度无关
        const tt = time / 1000;
        const bob = Math.sin(tt * 2.42 + phase);
        lift = amp * 0.55 - bob * amp * 0.55;
        this.syncShadow(e, 0.9, 0.75);
      } else {
        // 蹦跳：|sin| 给出抛物线感 —— 落地快、顶点慢
        const hz = (e.getData('hopHz') as number) ?? 1.4;
        const tt = time / 1000;
        const jump = Math.abs(Math.sin(tt * Math.PI * hz + phase));
        lift = jump * amp;
        this.syncShadow(e, 1 - jump * 0.3, 1 - jump * 0.45);
      }
      // 记录本帧要抬多少，真正应用在 postupdate（物理算完之后）。
      // 物理流程：preUpdate(从 sprite.y 读位置) → step → postUpdate(y += dy)
      // 我们在 update 里只能算数值，改动必须在 postUpdate 之后再落到 e.y，
      // 否则会被 body 的增量位移覆盖或叠加，产生漂移。
      e.setData('pendingLift', lift);

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
    // 还原跳跃偏移，否则对象池复用后新怪一出生就是「抬着」的
    const applied = e.getData('appliedLift') as number | undefined;
    if (applied) { e.y += applied; e.setData('appliedLift', 0); }
    e.setData('pendingLift', 0);
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
