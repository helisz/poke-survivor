/**
 * 招式粒子特效系统
 *
 * 设计原则：
 * - 不用粒子发射器对象，直接用轻量「粒子池 + 手写更新」，避免 Phaser ParticleEmitter 的开销和 API 差异
 * - 每个招式按 MoveDef.fx 决定形态（laser / shell / bolt / burst / ring / beam）
 * - 所有特效走同一个 update，统一回收
 */

export type FxKind =
  | 'laser'   // 激光束：细长、瞬发、带余辉
  | 'shell'   // 炮弹：实体弹头 + 尾焰 + 拖尾
  | 'bolt'    // 闪电：折线抖动 + 分叉
  | 'burst'   // 范围爆炸：径向粒子 + 冲击环
  | 'ring'    // 扩散环：从中心外扩
  | 'beam'    // 光柱/扫射：粗光带 + 粒子
  | 'slash';  // 近战挥砍：刀光弧 + 火花

interface Particle {
  alive: boolean;
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  color: number;
  alpha: number;
  gravity: number;
  drag: number;
  /** 是否随时间缩小 */
  shrink: boolean;
}

/** 招式 → 特效形态映射（按招式 id） */
export const SKILL_FX: Record<string, FxKind> = {
  // 激光 / 光束类
  thunderbolt: 'bolt',
  flamethrower: 'laser',
  watergun: 'laser',
  razorleaf: 'slash',
  aurasphere: 'shell',
  shadowball: 'shell',
  dragonclaw: 'slash',
  psychic: 'ring',
  aquatail: 'slash',
  rockslide: 'burst',
  thunderpunch: 'bolt',
  flareblitz: 'slash',
  earthquake: 'ring',
  firespin: 'ring',
  ironhead: 'slash',
  sludgebomb: 'burst',
  blazekick: 'slash',
  mudslap: 'shell',
  leafblade: 'slash',
  confusion: 'bolt',
  cometpunch: 'slash',
  dragonrush: 'shell',
  bodyslam: 'burst',
  morningsun: 'ring',
};

export class FxSystem {
  private scene: Phaser.Scene;
  private pool: Particle[] = [];
  private g: Phaser.GameObjects.Graphics;
  /** 拖尾用的上一帧位置缓存，key 是对象引用 */
  private trails = new Map<object, { x: number; y: number; ang: number }>();

  constructor(scene: Phaser.Scene, maxParticles = 600) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(9);
    for (let i = 0; i < maxParticles; i++) {
      this.pool.push({
        alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
        size: 2, color: 0xffffff, alpha: 1, gravity: 0, drag: 0, shrink: true,
      });
    }
  }

  private spawn(
    x: number, y: number, vx: number, vy: number,
    color: number, size: number, life: number,
    opts?: { gravity?: number; drag?: number; shrink?: boolean },
  ) {
    const p = this.pool.find((q) => !q.alive);
    if (!p) return;
    p.alive = true;
    p.x = x; p.y = y;
    p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.size = size;
    p.color = color;
    p.alpha = 1;
    p.gravity = opts?.gravity ?? 0;
    p.drag = opts?.drag ?? 0.92;
    p.shrink = opts?.shrink ?? true;
  }

  /** 径向爆发：一圈粒子向外炸开 */
  burst(x: number, y: number, color: number, count = 18, speed = 220, size = 3.5, life = 420) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const s = speed * (0.55 + Math.random() * 0.75);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, color, size * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6));
    }
    // 中心白闪
    this.spawn(x, y, 0, 0, 0xffffff, size * 2.6, 130, { shrink: true });
  }

  /** 冲击环：视觉用 Graphics 环形 + 粒子点缀 */
  shockRing(x: number, y: number, color: number, radius: number, dur = 340) {
    const ring = this.scene.add.circle(x, y, 10, color, 0)
      .setStrokeStyle(6, color, 0.95).setDepth(9);
    this.scene.tweens.add({
      targets: ring, duration: dur,
      onUpdate: (tw) => {
        const r = 10 + (radius - 10) * tw.progress;
        ring.setRadius(r);
        ring.setStrokeStyle(6 * (1 - tw.progress * 0.75), color, 0.95 * (1 - tw.progress));
      },
      onComplete: () => ring.destroy(),
    });
    // 环上粒子
    for (let i = 0; i < 14; i++) {
      const a = (Math.PI * 2 * i) / 14;
      this.spawn(
        x + Math.cos(a) * radius * 0.35,
        y + Math.sin(a) * radius * 0.35,
        Math.cos(a) * 180, Math.sin(a) * 180,
        color, 3, dur * 0.8, { drag: 0.9 },
      );
    }
  }

  /** 激光束：从起点到终点画一条亮线 + 沿途粒子，快速消散 */
  laser(x1: number, y1: number, x2: number, y2: number, color: number, width = 5) {
    const g = this.scene.add.graphics().setDepth(9);
    // 外层光晕
    g.lineStyle(width * 2.6, color, 0.22);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    // 主线
    g.lineStyle(width, color, 0.95);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    // 白芯
    g.lineStyle(Math.max(1, width * 0.35), 0xffffff, 0.9);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();

    this.scene.tweens.add({
      targets: g, alpha: 0, duration: 190,
      onComplete: () => g.destroy(),
    });

    // 沿线粒子
    const dist = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const n = Math.min(18, Math.floor(dist / 16));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      this.spawn(px, py, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, color, 2.4, 240);
    }
  }

  /** 闪电折线：主链 + 分叉，抖动感强 */
  bolt(x1: number, y1: number, x2: number, y2: number, color: number) {
    const g = this.scene.add.graphics().setDepth(9);
    const segs = 9;
    const dx = (x2 - x1) / segs;
    const dy = (y2 - y1) / segs;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= segs; i++) {
      const jitter = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 22;
      // 垂直方向抖动
      const nx = -dy, ny = dx;
      const len = Math.hypot(nx, ny) || 1;
      pts.push({ x: x1 + dx * i + (nx / len) * jitter, y: y1 + dy * i + (ny / len) * jitter });
    }
    const drawLine = (lineWidth: number, col: number, alpha: number) => {
      g.lineStyle(lineWidth, col, alpha);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    };
    drawLine(9, color, 0.25);
    drawLine(4, color, 0.95);
    drawLine(1.6, 0xffffff, 0.9);

    // 分叉
    for (let b = 0; b < 2; b++) {
      const si = 2 + Math.floor(Math.random() * (segs - 3));
      const p = pts[si];
      const ang = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
      const blen = 26 + Math.random() * 22;
      g.lineStyle(2, color, 0.8);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + Math.cos(ang) * blen, p.y + Math.sin(ang) * blen);
      g.strokePath();
    }

    this.scene.tweens.add({ targets: g, alpha: 0, duration: 210, onComplete: () => g.destroy() });
    for (let i = 0; i < 6; i++) {
      const p = pts[1 + Math.floor(Math.random() * (pts.length - 2))];
      this.spawn(p.x, p.y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, color, 2.8, 260);
    }
  }

  /** 火球拖尾：弹体外层橘红光晕 + 内芯亮黄，翻腾感强 */
  fireTrail(x: number, y: number, ang: number, color: number, dtMs: number) {
    const back = ang + Math.PI;
    const rate = Math.min(6, Math.ceil(dtMs / 11));
    for (let i = 0; i < rate; i++) {
      const spread = (Math.random() - 0.5) * 1.5;
      const sp = 60 + Math.random() * 170;
      const light = Math.random();
      this.spawn(
        x + Math.cos(back + spread) * 4 + (Math.random() - 0.5) * 8,
        y + Math.sin(back + spread) * 4 + (Math.random() - 0.5) * 8,
        Math.cos(back + spread) * sp,
        Math.sin(back + spread) * sp,
        light < 0.3 ? 0xfff0b0 : light < 0.65 ? 0xffc247 : color,
        3 + Math.random() * 3.4,
        220 + Math.random() * 200,
        { drag: 0.86 },
      );
    }
    // 弹体胸口的一颗亮芯，制造"正在燃烧"的错觉
    this.spawn(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6,
      0, 0, 0xffffff, 2.6, 90, { shrink: true, drag: 1 });
  }

  /**
   * 炮弹尾焰：弹体每帧调用，沿速度反方向喷粒子
   * 用 key 缓存上一帧位置，还能顺手画一条渐隐拖尾
   */
  shellTrail(key: object, x: number, y: number, ang: number, color: number, dtMs: number) {
    const prev = this.trails.get(key);
    this.trails.set(key, { x, y, ang });

    // 尾焰：向速度反方向 + 侧向散开
    const back = ang + Math.PI;
    const rate = Math.min(4, Math.ceil(dtMs / 16));
    for (let i = 0; i < rate; i++) {
      const spread = (Math.random() - 0.5) * 0.9;
      const sp = 90 + Math.random() * 130;
      this.spawn(
        x + Math.cos(back + spread) * 6,
        y + Math.sin(back + spread) * 6,
        Math.cos(back + spread) * sp,
        Math.sin(back + spread) * sp,
        Math.random() < 0.35 ? 0xfff3c4 : color,
        2.6 + Math.random() * 2.2,
        190 + Math.random() * 130,
        { drag: 0.88 },
      );
    }

    // 拖尾：在上一帧和当前位置之间补点
    if (prev) {
      const d = Phaser.Math.Distance.Between(prev.x, prev.y, x, y);
      const n = Math.min(4, Math.floor(d / 8));
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        this.spawn(
          prev.x + (x - prev.x) * t,
          prev.y + (y - prev.y) * t,
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 40,
          color, 3.2, 200, { drag: 0.9 },
        );
      }
    }
  }

  /** 闪电劈落：从天而降的折线 + 末端爆点 */
  /**
   * 电系放电：从施法者身上向外放射的锯齿电弧（不是天上垂直劈落）。
   * @param ox,oy 放射起点（宝可梦位置）
   * @param ang   主方向
   * @param len   电弧长度
   * @param color 颜色
   * @param spread 放射张角（默认较窄，单束；大值为扇形多束）
   * @param branches 电弧束数
   */
  boltArc(
    ox: number, oy: number, ang: number, len: number,
    color: number, spread = 0.5, branches = 3,
  ) {
    const g = this.scene.add.graphics().setDepth(480);
    const paths: { x: number; y: number }[][] = [];

    for (let b = 0; b < branches; b++) {
      const baseAng = ang + (branches === 1 ? 0 : (b / (branches - 1) - 0.5) * spread);
      const pts: { x: number; y: number }[] = [{ x: ox, y: oy }];
      const steps = 6;
      let cx = ox, cy = oy;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const jitter = (Math.random() - 0.5) * len * 0.22 * (1 - t * 0.4);
        const perp = baseAng + Math.PI / 2;
        cx = ox + Math.cos(baseAng) * len * t + Math.cos(perp) * jitter;
        cy = oy + Math.sin(baseAng) * len * t + Math.sin(perp) * jitter;
        pts.push({ x: cx, y: cy });
      }
      paths.push(pts);
    }

    const draw = (alpha: number) => {
      g.clear();
      for (const pts of paths) {
        // 外层光晕
        g.lineStyle(6, color, 0.35 * alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
        // 主干
        g.lineStyle(3, color, 0.95 * alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
        // 内芯亮白
        g.lineStyle(1.3, 0xffffff, 0.9 * alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
        // 末端爆点
        const end = pts[pts.length - 1];
        this.burst(end.x, end.y, color, 5, 110, 2.2, 180);
      }
    };
    draw(1);

    // 起点电火花
    this.burst(ox, oy, color, 10, 150, 2.6, 200);

    this.scene.tweens.addCounter({
      from: 1, to: 0, duration: 190, ease: 'Quad.In',
      onUpdate: (tw) => draw(tw.getValue() ?? 0),
      onComplete: () => g.destroy(),
    });
  }

  /** 拳头挥出：一个带残影的拳形块沿方向冲出 */
  fistWave(x: number, y: number, ang: number, color: number) {
    const g = this.scene.add.graphics().setDepth(478);
    const draw = (t: number) => {
      g.clear();
      const d = 30 + t * 90;
      const cx = x + Math.cos(ang) * d;
      const cy = y + Math.sin(ang) * d;
      const s = 15 * (1 - t * 0.35);
      g.fillStyle(color, 0.9 * (1 - t * 0.6));
      g.fillCircle(cx, cy, s);
      g.lineStyle(2, 0xffffff, 0.5 * (1 - t));
      g.strokeCircle(cx, cy, s);
      // 指节小点
      for (let k = -1; k <= 1; k++) {
        const a2 = ang + Math.PI / 2;
        g.fillStyle(0xffffff, 0.6 * (1 - t));
        g.fillCircle(cx + Math.cos(a2) * k * s * 0.5, cy + Math.sin(a2) * k * s * 0.5, s * 0.16);
      }
    };
    draw(0);
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: 170, ease: 'Quad.Out',
      onUpdate: (tw) => draw(tw.getValue() ?? 0),
      onComplete: () => g.destroy(),
    });
  }

  /** 近战刀光：弧形亮边 + 火花飞溅 */
  slash(ox: number, oy: number, ang: number, halfAngle: number, range: number, color: number, dur = 220) {
    const g = this.scene.add.graphics().setDepth(9);
    // 扇形填充（半透明）
    g.fillStyle(color, 0.22);
    g.slice(ox, oy, range, ang - halfAngle, ang + halfAngle, false);
    g.fillPath();

    // 外弧高光：多条同心弧叠出刀光感
    for (let k = 0; k < 3; k++) {
      const r = range * (1 - k * 0.11);
      g.lineStyle(k === 0 ? 4 : 2, k === 0 ? 0xffffff : color, k === 0 ? 0.9 : 0.6);
      g.beginPath();
      g.arc(ox, oy, r, ang - halfAngle, ang + halfAngle, false);
      g.strokePath();
    }

    this.scene.tweens.add({
      targets: g, alpha: 0, duration: dur, scaleX: 1.06, scaleY: 1.06,
      onComplete: () => g.destroy(),
    });

    // 火花：沿弧线溅开
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = ang - halfAngle + (halfAngle * 2 * i) / n;
      const r = range * (0.7 + Math.random() * 0.3);
      this.spawn(
        ox + Math.cos(a) * r,
        oy + Math.sin(a) * r,
        Math.cos(a) * (120 + Math.random() * 140),
        Math.sin(a) * (120 + Math.random() * 140),
        Math.random() < 0.4 ? 0xffffff : color,
        2.4 + Math.random() * 1.8,
        260 + Math.random() * 140,
        { drag: 0.9 },
      );
    }
  }

  /** 施法起手：在施法者脚下放一圈能量，让「出招」有预兆 */
  castPulse(x: number, y: number, color: number, radius = 26) {
    const c = this.scene.add.circle(x, y, radius * 0.4, color, 0.5).setDepth(7);
    this.scene.tweens.add({
      targets: c, scale: 1.8, alpha: 0, duration: 220,
      onComplete: () => c.destroy(),
    });
    for (let i = 0; i < 7; i++) {
      const a = (Math.PI * 2 * i) / 7;
      this.spawn(x + Math.cos(a) * 8, y + Math.sin(a) * 8, Math.cos(a) * 60, Math.sin(a) * 60, color, 2.6, 200);
    }
  }

  /** 每帧更新所有粒子 */
  update(dtMs: number) {
    const g = this.g;
    g.clear();
    const dt = Math.min(dtMs, 50) / 1000;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dtMs;
      if (p.life <= 0) { p.alive = false; continue; }
      p.vy += p.gravity * dt;
      // 拖拽
      const d = Math.pow(p.drag, dtMs / 16);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const t = p.life / p.maxLife;
      const size = p.shrink ? p.size * (0.35 + 0.65 * t) : p.size;
      const alpha = Math.min(1, t * 1.4);

      g.fillStyle(p.color, alpha * 0.9);
      g.fillCircle(p.x, p.y, size);
    }
  }

  /** 弹体被销毁时清掉拖尾缓存，避免 Map 无限增长 */
  forget(key: object) { this.trails.delete(key); }

  clearTrails() { this.trails.clear(); }

  destroy() {
    this.g.destroy();
    this.pool.forEach((p) => { p.alive = false; });
    this.trails.clear();
  }
}
