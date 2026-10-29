import Phaser from 'phaser';
import { MAP_THEMES, type MapTheme, type Decoration } from '../data/maps';

/**
 * 无限程序化地面 —— 支持多套主题切换。
 * 每套主题生成自己的 32px 瓦片纹理，并额外生成装饰物纹理，
 * 装饰物按世界坐标伪随机铺在地面上（随相机滚动，不是固定背景）。
 */
export class Ground {
  private scene: Phaser.Scene;
  private tile!: Phaser.GameObjects.TileSprite;
  /** 大尺度明暗层，打散平铺的重复感 */
  private blotch!: Phaser.GameObjects.TileSprite;
  private themeIndex = 0;
  private decorGroup!: Phaser.GameObjects.Group;
  private decorSeed = 1337;
  private spawned = new Set<string>();
  private cell = 180;
  private ambientRect?: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildAllTextures();

    const { width, height } = scene.scale;
    // 基础瓦片：把 16 个瓦片变体预先拼成一张 128×128 纹理再平铺
    // → 视觉周期从 32px 扩到 128px，重复感大幅降低
    this.tile = scene.add.tileSprite(0, 0, width, height, this.texKey(0, 0))
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);

    // 大尺度明暗层：低频噪点色块，让地面有起伏不是一片死色
    this.blotch = scene.add.tileSprite(0, 0, width, height, this.blotchKey(0))
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-99).setAlpha(1);

    this.decorGroup = scene.add.group();
    this.ambientRect = scene.add.rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(90).setBlendMode(Phaser.BlendModes.ADD);

    scene.scale.on('resize', (gs: Phaser.Structs.Size) => {
      this.tile.setSize(gs.width, gs.height);
      this.blotch.setSize(gs.width, gs.height);
      this.ambientRect?.setSize(gs.width, gs.height);
    });

    this.applyTheme(0);
  }

  get theme(): MapTheme { return MAP_THEMES[this.themeIndex]; }

  /** 切换地图主题 */
  applyTheme(index: number) {
    if (index === this.themeIndex && this.tile.texture.key === this.texKey(index, 0)) return;
    this.themeIndex = index;
    this.tile.setTexture(this.texKey(index, 0));
    this.blotch.setTexture(this.blotchKey(index));
    // 换地图时清掉旧装饰物，重新铺
    this.decorGroup.clear(true, true);
    this.spawned.clear();
    this.decorSeed = 1337 + index * 977;

    const t = this.theme;
    if (this.ambientRect) {
      this.ambientRect.setFillStyle(t.ambient, t.ambientAlpha);
    }
    // 立即按当前视野重铺装饰物（相机没移动时不会自然触发）
    const cam = this.scene.cameras.main;
    this.fillDecorations(cam.scrollX, cam.scrollY, this.scene.scale.width, this.scene.scale.height);
  }

  /** 相机移动时更新滚动 + 按视野补装饰物 */
  update(camX: number, camY: number, camW: number, camH: number) {
    // 两种瓦片用不同速度滚动，产生视差层叠，进一步打散重复
    this.tile.tilePositionX = camX;
    this.tile.tilePositionY = camY;
    this.blotch.tilePositionX = camX * 0.5;
    this.blotch.tilePositionY = camY * 0.5;
    this.fillDecorations(camX, camY, camW, camH);
  }

  /** 在可视范围内补齐装饰物，出了视野太远的回收 */
  private fillDecorations(camX: number, camY: number, camW: number, camH: number) {
    const pad = 120;
    const x0 = Math.floor((camX - pad) / this.cell);
    const x1 = Math.floor((camX + camW + pad) / this.cell);
    const y0 = Math.floor((camY - pad) / this.cell);
    const y1 = Math.floor((camY + camH + pad) / this.cell);

    const theme = this.theme;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const key = `${gx},${gy}`;
        if (this.spawned.has(key)) continue;
        this.spawned.add(key);

        // 每个格子 55% 概率有装饰
        const rnd = new Phaser.Math.RandomDataGenerator([`${this.decorSeed}:${gx}:${gy}`]);
        if (rnd.frac() > 0.55) continue;

        const d = rnd.pick(theme.decorations) as Decoration;
        const wx = gx * this.cell + rnd.between(20, this.cell - 20);
        const wy = gy * this.cell + rnd.between(20, this.cell - 20);
        const img = this.scene.add.image(wx, wy, `decor_${d.type}_${d.color}_${this.themeIndex}`)
          .setScale(d.scale).setDepth(-50 + wy * 0.001).setAlpha(0.85);
        this.decorGroup.add(img);
      }
    }

    // 回收远离视野的装饰物
    const cx = camX + camW / 2, cy = camY + camH / 2;
    const maxD = Math.max(camW, camH) * 1.4;
    for (const obj of this.decorGroup.getChildren() as Phaser.GameObjects.Image[]) {
      if (Phaser.Math.Distance.Between(cx, cy, obj.x, obj.y) > maxD) {
        const kx = Math.floor(obj.x / this.cell), ky = Math.floor(obj.y / this.cell);
        this.spawned.delete(`${kx},${ky}`);
        obj.destroy();
        this.decorGroup.remove(obj);
      }
    }
  }

  private texKey(i: number, variant = 0) { return variant === 0 ? `map_tile_${i}` : `map_tile_${i}_${variant}`; }
  private blotchKey(i: number) { return `map_blotch_${i}`; }

  /** 预生成所有主题的地砖与装饰物纹理 */
  private buildAllTextures() {
    MAP_THEMES.forEach((theme, i) => {
      this.buildTile(theme, i);
      this.buildBlotch(theme, i);
      for (const d of theme.decorations) this.buildDecor(theme, i, d);
    });
  }

  /**
   * 生成一张 128×128 的地面纹理：
   * 由 4×4 = 16 个 32px 小格组成，每格用不同随机种子绘制，
   * 平铺时视觉周期从 32px 扩大到 128px，肉眼很难看出重复。
   */
  private buildTile(theme: MapTheme, index: number) {
    const key = this.texKey(index);
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const T = 32;      // 单格
    const N = 4;       // 4×4 格
    const S = T * N;   // 128

    // 底色铺满整张
    g.fillStyle(theme.base, 1);
    g.fillRect(0, 0, S, S);

    // 逐格绘制噪点，每格独立种子
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const ox = gx * T, oy = gy * T;
        const rnd = new Phaser.Math.RandomDataGenerator([`tile-${theme.id}-${gx}-${gy}`]);

        // 该格轻微明暗偏移：有的格偏亮、有的偏暗，形成大块色差
        const shift = rnd.frac();
        if (shift > 0.72) {
          const lite = Phaser.Display.Color.ValueToColor(theme.base).lighten(8).color;
          g.fillStyle(lite, 0.5);
          g.fillRect(ox, oy, T, T);
        } else if (shift < 0.28) {
          const dark = Phaser.Display.Color.ValueToColor(theme.base).darken(9).color;
          g.fillStyle(dark, 0.45);
          g.fillRect(ox, oy, T, T);
        }

        // 格内细噪点
        for (let i = 0; i < 26; i++) {
          g.fillStyle(rnd.pick(theme.noise) as number, 1);
          g.fillRect(
            ox + rnd.between(0, T - 2),
            oy + rnd.between(0, T - 2),
            1 + (i % 2), 1 + ((i + 1) % 2),
          );
        }
        // 格内色斑
        for (let i = 0; i < 3; i++) {
          g.fillStyle(theme.patch, 0.65);
          g.fillRect(
            ox + rnd.between(0, T - 6),
            oy + rnd.between(0, T - 5),
            rnd.between(3, 7), rnd.between(2, 5),
          );
        }
      }
    }

    // 极细的十字网格线，弱化单调但不抢戏
    g.lineStyle(1, Phaser.Display.Color.ValueToColor(theme.base).darken(12).color, 0.18);
    for (let i = 0; i <= N; i++) {
      g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, S); g.strokePath();
      g.beginPath(); g.moveTo(0, i * T); g.lineTo(S, i * T); g.strokePath();
    }

    g.generateTexture(key, S, S);
    g.destroy();
  }

  /**
   * 大尺度斑块层：一张 256×256 的低频纹理，含明暗色块和柔边，
   * 平铺后叠在基础瓦片上，让地面有「区块」感而不是均匀底色。
   */
  private buildBlotch(theme: MapTheme, index: number) {
    const key = this.blotchKey(index);
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const S = 256;
    // 完全透明底 → 只叠斑块，不盖住基础瓦片
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, S, S);

    const rnd = new Phaser.Math.RandomDataGenerator([`blotch-${theme.id}`]);
    const light = Phaser.Display.Color.ValueToColor(theme.base).lighten(16).color;
    const dark = Phaser.Display.Color.ValueToColor(theme.base).darken(18).color;

    // 大块明暗：每块用多层同心圆画出柔边
    for (let i = 0; i < 14; i++) {
      const cx = rnd.between(0, S);
      const cy = rnd.between(0, S);
      const r = rnd.between(34, 82);
      const useLight = rnd.frac() > 0.5;
      const col = useLight ? light : dark;
      // 三层递减透明度造柔边
      for (let k = 0; k < 3; k++) {
        const rr = r * (1 - k * 0.26);
        g.fillStyle(col, 0.07 + k * 0.045);
        g.fillCircle(cx, cy, rr);
        // 跨越边界的块要贴到对边，保证平铺无缝
        if (cx - rr < 0) g.fillCircle(cx + S, cy, rr);
        if (cx + rr > S) g.fillCircle(cx - S, cy, rr);
        if (cy - rr < 0) g.fillCircle(cx, cy + S, rr);
        if (cy + rr > S) g.fillCircle(cx, cy - S, rr);
      }
    }

    // 稀疏草簇/碎石小点，大尺度上的细节
    for (let i = 0; i < 40; i++) {
      const cx = rnd.between(0, S);
      const cy = rnd.between(0, S);
      const c = rnd.pick(theme.noise) as number;
      g.fillStyle(c, 0.28);
      g.fillCircle(cx, cy, rnd.between(1, 3));
    }

    g.generateTexture(key, S, S);
    g.destroy();
  }


  private buildDecor(theme: MapTheme, index: number, d: Decoration) {
    const key = `decor_${d.type}_${d.color}_${index}`;
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const S = 24;
    const c = d.color;
    const dark = Phaser.Display.Color.ValueToColor(c).darken(30).color;
    const light = Phaser.Display.Color.ValueToColor(c).lighten(22).color;

    switch (d.type) {
      case 'tree':
        // 树干 + 树冠
        g.fillStyle(0x3d2b1a, 1);
        g.fillRect(S / 2 - 2, S - 8, 4, 7);
        g.fillStyle(dark, 1);
        g.fillCircle(S / 2, S / 2, 10);
        g.fillStyle(c, 1);
        g.fillCircle(S / 2, S / 2 - 2, 8);
        g.fillStyle(light, 1);
        g.fillCircle(S / 2 - 3, S / 2 - 5, 3);
        break;
      case 'rock':
        g.fillStyle(dark, 1);
        g.fillEllipse(S / 2, S - 6, 20, 11);
        g.fillStyle(c, 1);
        g.fillEllipse(S / 2, S - 8, 17, 10);
        g.fillStyle(light, 0.8);
        g.fillEllipse(S / 2 - 3, S - 11, 7, 4);
        break;
      case 'bush':
        g.fillStyle(dark, 1);
        g.fillCircle(S / 2, S - 7, 9);
        g.fillStyle(c, 1);
        g.fillCircle(S / 2 - 2, S - 9, 7);
        g.fillCircle(S / 2 + 5, S - 7, 5);
        break;
      case 'crystal':
        g.fillStyle(dark, 1);
        g.fillTriangle(S / 2, 3, S / 2 - 6, S - 5, S / 2 + 6, S - 5);
        g.fillStyle(c, 1);
        g.fillTriangle(S / 2, 6, S / 2 - 4, S - 6, S / 2 + 4, S - 6);
        g.fillStyle(0xffffff, 0.5);
        g.fillTriangle(S / 2, 8, S / 2 - 1.5, S - 9, S / 2 + 1.5, S - 9);
        break;
      case 'bone':
        g.fillStyle(c, 1);
        g.fillRect(S / 2 - 7, S - 9, 14, 3);
        g.fillCircle(S / 2 - 7, S - 8, 2.5);
        g.fillCircle(S / 2 + 7, S - 8, 2.5);
        g.fillRect(S / 2 - 2, S - 14, 3, 8);
        break;
      case 'pillar':
        g.fillStyle(dark, 1);
        g.fillRect(S / 2 - 5, 3, 10, S - 8);
        g.fillStyle(c, 1);
        g.fillRect(S / 2 - 4, 4, 8, S - 10);
        g.fillStyle(light, 0.7);
        g.fillRect(S / 2 - 4, 4, 3, S - 10);
        g.fillStyle(dark, 1);
        g.fillRect(S / 2 - 7, S - 7, 14, 4);
        break;
      case 'lava':
        g.fillStyle(0x2a0f08, 1);
        g.fillEllipse(S / 2, S - 7, 22, 10);
        g.fillStyle(c, 1);
        g.fillEllipse(S / 2, S - 8, 18, 7);
        g.fillStyle(0xffd75e, 0.85);
        g.fillEllipse(S / 2 - 2, S - 9, 9, 3.5);
        break;
      case 'reed':
        g.fillStyle(dark, 1);
        for (let i = 0; i < 4; i++) {
          g.fillRect(S / 2 - 6 + i * 4, S - 16 + (i % 2) * 3, 1.6, 15 - (i % 2) * 3);
        }
        g.fillStyle(c, 1);
        for (let i = 0; i < 4; i++) {
          g.fillRect(S / 2 - 6 + i * 4, S - 17 + (i % 2) * 3, 1.2, 12);
        }
        break;
    }
    g.generateTexture(key, S, S);
    g.destroy();
  }
}
