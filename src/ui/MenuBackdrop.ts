import Phaser from 'phaser';
import { MAP_THEMES } from '../data/maps';
import { ENEMY_POOL } from '../data/pokedex';

/**
 * 主菜单动态背景。
 * - 地面纹理取自真实游戏的第一张图（草原），以匀速上卷制造「主角在向上走」的错觉
 * - 主角静止在正中央，方向朝上，尺寸与游戏内完全一致
 * - 若干低透明度的大号宝可梦从不同方向匀速划过
 * - 叠加少量技能粒子（电/火/冰的微光碎屑）增加质感
 */
export class MenuBackdrop {
  private scene: Phaser.Scene;
  private tile!: Phaser.GameObjects.TileSprite;
  private blotch!: Phaser.GameObjects.Image;
  private mist: Phaser.GameObjects.TileSprite[] = [];
  private hero!: Phaser.GameObjects.Sprite;
  private shadow?: Phaser.GameObjects.Ellipse;
  private flyers: { obj: Phaser.GameObjects.Image; vx: number; vy: number; spin: number }[] = [];
  private sparks: {
    obj: Phaser.GameObjects.Arc;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    color: number;
  }[] = [];
  private sparkTimer = 0;
  private scroll = 0;
  /** 地面向上卷动的速度（px/s）——数值不大但有存在感 */
  private readonly SCROLL_SPEED = 34;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = scene.scale;
    const theme = MAP_THEMES[0];

    this.buildTileTexture(theme);
    this.buildBlotchTexture(theme);

    // 地面：屏幕固定，只滚 tilePositionY
    this.tile = scene.add.tileSprite(0, 0, width, height, 'menu_tile')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    // 明暗层用单张大图（不平铺），彻底消除周期感
    this.blotch = scene.add.image(0, 0, 'menu_blotch')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-99);
    this.blotch.setDisplaySize(width * 1.4, height * 1.8);

    this.buildMistTexture();

    // 两层雾：速度不同，做出前后景视差
    for (let i = 0; i < 2; i++) {
      const m = scene.add.tileSprite(0, 0, width, height, 'menu_mist')
        .setOrigin(0, 0).setScrollFactor(0).setDepth(-95 + i)
        .setAlpha(i === 0 ? 0.10 : 0.06);
      this.mist.push(m);
    }

    this.buildHero();
    this.buildFlyers();
    this.spawnSparks(26);

    scene.events.once('shutdown', () => this.destroy());
  }

  // ---------- 纹理生成 ----------

  /**
   * 草地瓦片：用整数频率的正弦谐波叠加生成连续噪声场，
   * 在 x/y 方向都以 S 为周期 → 数学上真正无缝，放大缩小都不会出现方格接缝。
   */
  private buildTileTexture(theme: (typeof MAP_THEMES)[number]) {
    const S = 256;
    const key = 'menu_tile';
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, S, S);
    if (!tex) return;
    const ctx = tex.getContext();

    ctx.fillStyle = hex(theme.base);
    ctx.fillRect(0, 0, S, S);

    // 谐波噪声：几个整数频率的正弦叠加。
    // 频率 k 必须能被 S 整除对应周期，这里直接用 cos(2πkx/S) 保证无缝。
    const rnd = mulberry32(20261030);
    const octaves: { fx: number; fy: number; ph: number; amp: number }[] = [];
    for (let i = 0; i < 6; i++) {
      octaves.push({
        fx: 1 + Math.floor(rnd() * 5),
        fy: 1 + Math.floor(rnd() * 5),
        ph: rnd() * Math.PI * 2,
        amp: 1 / (1 + i * 0.7),
      });
    }
    const norm = octaves.reduce((s, o) => s + o.amp, 0);

    // 逐像素画出明暗起伏（256² 一次即可，不必每帧）
    const img = ctx.createImageData(S, S);
    const baseRGB = [
      (theme.base >> 16) & 255, (theme.base >> 8) & 255, theme.base & 255,
    ];
    const lightRGB = [
      (theme.noise[0] >> 16) & 255, (theme.noise[0] >> 8) & 255, theme.noise[0] & 255,
    ];
    const darkRGB = [
      (theme.patch >> 16) & 255, (theme.patch >> 8) & 255, theme.patch & 255,
    ];

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let v = 0;
        for (const o of octaves) {
          v += Math.cos((2 * Math.PI * o.fx * x) / S + (2 * Math.PI * o.fy * y) / S + o.ph) * o.amp;
        }
        v = v / norm;                    // -1 .. 1
        const t = v * 0.5 + 0.5;         // 0 .. 1

        // 三段混合：暗 → 基色 → 亮
        let r: number, g: number, b: number;
        if (t < 0.5) {
          const k = t * 2;
          r = darkRGB[0] + (baseRGB[0] - darkRGB[0]) * k;
          g = darkRGB[1] + (baseRGB[1] - darkRGB[1]) * k;
          b = darkRGB[2] + (baseRGB[2] - darkRGB[2]) * k;
        } else {
          const k = (t - 0.5) * 2;
          r = baseRGB[0] + (lightRGB[0] - baseRGB[0]) * k;
          g = baseRGB[1] + (lightRGB[1] - baseRGB[1]) * k;
          b = baseRGB[2] + (lightRGB[2] - baseRGB[2]) * k;
        }

        const idx = (y * S + x) * 4;
        img.data[idx] = r;
        img.data[idx + 1] = g;
        img.data[idx + 2] = b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // 最后撒一层草叶细节（跨越边界补齐）
    ctx.globalAlpha = 0.22;
    for (let i = 0; i < 240; i++) {
      const x = Math.floor(rnd() * S);
      const y = Math.floor(rnd() * S);
      const hh = 2 + Math.floor(rnd() * 3);
      ctx.fillStyle = hex(theme.noise[0]);
      for (const [ox, oy] of [[0, 0], [S, 0], [0, S], [S, S]]) {
        ctx.fillRect(x + ox, y + oy, 1, hh);
      }
    }

    ctx.globalAlpha = 1;
    tex.refresh();
  }

  /**
   * 低频明暗斑块。整屏铺一张不平铺的大图（1024×1024），
   * 屏幕上根本不存在重复周期，也就不会有「格子」。
   */
  private buildBlotchTexture(theme: (typeof MAP_THEMES)[number]) {
    const S = 1024;
    const key = 'menu_blotch';
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, S, S);
    if (!tex) return;
    const ctx = tex.getContext();
    const rnd = mulberry32(777);
    for (let i = 0; i < 150; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = 70 + rnd() * 240;
      const dark = rnd() > 0.45;
      for (const [ox, oy] of [[0, 0], [S, 0], [0, S], [S, S]]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, hex(dark ? theme.patch : theme.ambient, 0.16));
        g.addColorStop(1, hex(dark ? theme.patch : theme.ambient, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    tex.refresh();
  }

  /** 一层柔和雾斑，用于上卷视差 */
  private buildMistTexture() {
    const S = 160;
    const key = 'menu_mist';
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, S, S);
    if (!tex) return;
    const ctx = tex.getContext();
    const rnd = mulberry32(555);
    for (let i = 0; i < 18; i++) {
      const x = rnd() * S, y = rnd() * S, r = 14 + rnd() * 44;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    tex.refresh();
  }

  // ---------- 角色 ----------

  private buildHero() {
    const { width, height } = this.scene.scale;
    // 贴图原生 48px；约为上一版的 1/3 大小（37-43px 显示）
    const target = Math.min(width * 0.10, 43);
    // 脚下阴影：让主角从草地上「站」起来
    const shadow = this.scene.add.ellipse(
      width / 2, height * 0.52 + target * 0.36, target * 0.78, target * 0.28,
      0x000000, 0.32,
    ).setDepth(4);
    this.shadow = shadow;

    this.hero = this.scene.add.sprite(width / 2, height * 0.52, 'ash', 1) // 1 = 朝上
      .setScale(target / 48)
      .setDepth(5);
    // 轻微呼吸：上下浮动 2px
    this.scene.tweens.add({
      targets: this.hero,
      y: this.hero.y - 1.5,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  // ---------- 飘过的宝可梦 ----------

  private buildFlyers() {
    const { width, height } = this.scene.scale;
    const rnd = mulberry32(4242);
    const count = 9;

    for (let i = 0; i < count; i++) {
      // 从野生池随机挑一只
      const id = ENEMY_POOL[Math.floor(rnd() * ENEMY_POOL.length)];
      const key = `pk_${id}`;
      if (!this.scene.textures.exists(key)) continue;

      // 大尺寸：96px 原图画到 110~210px
      const size = 110 + rnd() * 100;
      // 初始直接铺在屏幕内（略微外扩），保证一进菜单就能看到
      const x = -size * 0.4 + rnd() * (width + size * 0.8);
      const y = -size * 0.4 + rnd() * (height + size * 0.8);
      const speed = 16 + rnd() * 22;
      const dir = rnd() * Math.PI * 2;
      const vx = Math.cos(dir) * speed;
      const vy = Math.sin(dir) * speed;

      const obj = this.scene.add.image(x, y, key)
        .setDisplaySize(size, size)
        .setAlpha(0.20 + rnd() * 0.14)  // 低透明度但可见
        .setDepth(2)
        .setAngle(rnd() * 360);

      // 走得太远的从对面重开
      obj.setData('speed', speed);
      obj.setData('size', size);

      this.flyers.push({ obj, vx, vy, spin: (rnd() - 0.5) * 9 });
    }
  }

  // ---------- 技能粒子 ----------

  private spawnSparks(n: number) {
    const { width, height } = this.scene.scale;
    const rnd = mulberry32(999);
    // 技能配色：电黄 / 火橙 / 冰蓝 / 草绿
    const palette = [0xffe066, 0xff9a3c, 0x7fd8ff, 0x8ce87a, 0xd79bff];

    for (let i = 0; i < n; i++) {
      const color = palette[Math.floor(rnd() * palette.length)];
      const r = 1 + rnd() * 2.2;
      const obj = this.scene.add.circle(
        rnd() * width, rnd() * height, r, color, 0.55,
      ).setDepth(3).setBlendMode(Phaser.BlendModes.ADD);

      const maxLife = 1.6 + rnd() * 2.2;
      this.sparks.push({
        obj,
        vx: (rnd() - 0.5) * 12,
        vy: -(6 + rnd() * 14),   // 略微上飘
        life: rnd() * maxLife,
        maxLife,
        color,
      });
    }
  }

  // ---------- 每帧 ----------

  update(dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    const { width, height } = this.scene.scale;

    // 地面上卷
    this.scroll += this.SCROLL_SPEED * dt;
    this.tile.tilePositionY = this.scroll;

    // 明暗大图跟着上卷，用取模做无缝循环（图高 1.8 屏，位移一屏后回原点视觉无差）
    const bH = this.blotch.displayHeight;
    const loopH = bH - height;
    this.blotch.y = -((this.scroll * 0.25) % loopH);
    // 两层雾以不同速度上卷：近层快，远层慢
    this.mist[0].tilePositionY = this.scroll * 0.30;
    this.mist[1].tilePositionY = this.scroll * 0.16;

    // 飘过的宝可梦
    for (const f of this.flyers) {
      f.obj.x += f.vx * dt;
      f.obj.y += f.vy * dt;
      f.obj.angle += f.spin * dt;
      const size = f.obj.getData('size') as number;
      const sp = f.obj.getData('speed') as number;
      // 完全离场后换一边重进
      if (f.obj.x < -size || f.obj.x > width + size ||
          f.obj.y < -size || f.obj.y > height + size) {
        this.recycleFlyer(f, sp);
      }
    }

    // 粒子
    this.sparkTimer += dt;
    for (const s of this.sparks) {
      s.life += dt;
      if (s.life > s.maxLife) {
        // 复位到屏幕底部随机位置
        s.obj.x = Math.random() * width;
        s.obj.y = height + 6;
        s.life = 0;
        s.maxLife = 1.6 + Math.random() * 2.2;
      }
      s.obj.x += s.vx * dt;
      s.obj.y += s.vy * dt;
      // 前半程淡入、后半程淡出
      const t = s.life / s.maxLife;
      s.obj.setAlpha(t < 0.25 ? (t / 0.25) * 0.6 : 0.6 * (1 - (t - 0.25) / 0.75));
    }
  }

  private recycleFlyer(f: { obj: Phaser.GameObjects.Image; vx: number; vy: number; spin: number }, speed: number) {
    const { width, height } = this.scene.scale;
    const size = f.obj.getData('size') as number;
    // 从随机一条边重新进入，朝屏幕内侧走
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { f.obj.x = -size * 0.8; f.obj.y = height * (0.1 + Math.random() * 0.8); f.vx = speed; f.vy = (Math.random() - 0.5) * speed * 0.5; }
    else if (side === 1) { f.obj.x = width + size * 0.8; f.obj.y = height * (0.1 + Math.random() * 0.8); f.vx = -speed; f.vy = (Math.random() - 0.5) * speed * 0.5; }
    else if (side === 2) { f.obj.x = width * (0.1 + Math.random() * 0.8); f.obj.y = -size * 0.8; f.vx = (Math.random() - 0.5) * speed * 0.5; f.vy = speed; }
    else { f.obj.x = width * (0.1 + Math.random() * 0.8); f.obj.y = height + size * 0.8; f.vx = (Math.random() - 0.5) * speed * 0.5; f.vy = -speed; }
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.hero);
    this.shadow = undefined;
    this.flyers.length = 0;
    this.sparks.length = 0;
    this.mist.length = 0;
  }
}

// ---------- 小工具 ----------

function hex(n: number, alpha = 1): string {
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 确定性随机，保证每次进菜单背景分布一致 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
