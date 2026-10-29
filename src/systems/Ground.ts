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
    this.tile = scene.add.tileSprite(0, 0, width, height, this.texKey(0))
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);

    this.decorGroup = scene.add.group();
    this.ambientRect = scene.add.rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(90).setBlendMode(Phaser.BlendModes.ADD);

    scene.scale.on('resize', (gs: Phaser.Structs.Size) => {
      this.tile.setSize(gs.width, gs.height);
      this.ambientRect?.setSize(gs.width, gs.height);
    });

    this.applyTheme(0);
  }

  get theme(): MapTheme { return MAP_THEMES[this.themeIndex]; }

  /** 切换地图主题 */
  applyTheme(index: number) {
    if (index === this.themeIndex && this.tile.texture.key === this.texKey(index)) return;
    this.themeIndex = index;
    this.tile.setTexture(this.texKey(index));
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
    this.tile.tilePositionX = camX;
    this.tile.tilePositionY = camY;
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

  private texKey(i: number) { return `map_tile_${i}`; }

  /** 预生成所有主题的地砖与装饰物纹理 */
  private buildAllTextures() {
    MAP_THEMES.forEach((theme, i) => {
      this.buildTile(theme, i);
      for (const d of theme.decorations) this.buildDecor(theme, i, d);
    });
  }

  private buildTile(theme: MapTheme, index: number) {
    const key = this.texKey(index);
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const T = 32;
    g.fillStyle(theme.base, 1);
    g.fillRect(0, 0, T, T);

    const rnd = new Phaser.Math.RandomDataGenerator([`tile-${theme.id}`]);
    for (let i = 0; i < 26; i++) {
      g.fillStyle(rnd.pick(theme.noise) as number, 1);
      g.fillRect(rnd.between(0, T - 1), rnd.between(0, T - 1),
        1 + (i % 2), 1 + ((i + 1) % 2));
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle(theme.patch, 0.7);
      g.fillRect(rnd.between(0, T - 6), rnd.between(0, T - 6),
        rnd.between(3, 6), rnd.between(2, 5));
    }
    g.generateTexture(key, T, T);
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
