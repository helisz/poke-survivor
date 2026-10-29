import Phaser from 'phaser';

/**
 * 无限程序化草地瓦片地面（草原主题）
 * 用 4 个 Graphics 瓦片循环贴在某处太贵，这里改为：玩家在移动时按屏幕网格绘制小块
 */
export class Ground {
  private scene: Phaser.Scene;
  private tiles: Phaser.GameObjects.TileSprite[] = [];
  private size = 256;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.buildTexture();
    // 一个巨大的 TileSprite 跟随相机；视觉上无缝
    const { width, height } = scene.scale;
    const sprite = scene.add.tileSprite(0, 0, width, height, 'grass_tile')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-100);
    this.tiles.push(sprite);
    scene.scale.on('resize', (gs: Phaser.Structs.Size) => {
      sprite.setSize(gs.width, gs.height);
    });
  }

  /** 相机移动时调用，让贴图随之滚动 */
  update(camX: number, camY: number) {
    const s = this.tiles[0];
    s.tilePositionX = camX;
    s.tilePositionY = camY;
  }

  private buildTexture() {
    const key = 'grass_tile';
    if (this.scene.textures.exists(key)) return;
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const T = 32;
    g.fillStyle(0x2f5a34, 1);
    g.fillRect(0, 0, T, T);
    // 随机草点
    const rnd = new Phaser.Math.RandomDataGenerator(['grass-seed']);
    for (let i = 0; i < 26; i++) {
      const x = rnd.between(0, T - 1);
      const y = rnd.between(0, T - 1);
      const c = rnd.pick([0x37683c, 0x2a4f2f, 0x3d7243, 0x25452a]);
      g.fillStyle(c, 1);
      g.fillRect(x, y, 1 + (i % 2), 1 + ((i + 1) % 2));
    }
    // 少量深色斑块
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x25452a, 0.7);
      g.fillRect(rnd.between(0, T - 6), rnd.between(0, T - 6), rnd.between(3, 6), rnd.between(2, 5));
    }
    g.generateTexture(key, T, T);
    g.destroy();
  }
}
