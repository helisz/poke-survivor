import Phaser from 'phaser';

/**
 * 霓虹地面层（Neon Abyss 档位 A 的补充）。
 *
 * 在原有像素地面之上叠一层：
 *   - 细网格线：青色极低透明度，给地面机械/赛博基底的暗示
 *   - 滚动光斑：几个大而极淡的彩色光团缓慢漂移，让暗底不死板
 *   - 地平线光带：屏幕下方一条横向渐隐光，压住画面重心
 *
 * 全部 setScrollFactor(0)，固定在屏幕上，不参与世界滚动，开销极低。
 */
export class NeonFloor {
  private scene: Phaser.Scene;
  private grid: Phaser.GameObjects.Graphics;
  private glows: { g: Phaser.GameObjects.Image; vx: number; vy: number; base: number }[] = [];
  private floorLight: Phaser.GameObjects.Rectangle;
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = scene.scale;

    // 网格层：32px 一格
    this.grid = scene.add.graphics().setScrollFactor(0).setDepth(-98);
    this.paintGrid(width, height);

    // 滚动光斑：每种颜色一张径向渐变圆
    const glowKeys: [string, number][] = [
      ['neonglow_cyan', 0x2fd6e8],
      ['neonglow_magenta', 0xe82f9c],
      ['neonglow_violet', 0x8a4fe8],
    ];
    glowKeys.forEach(([key, color], i) => {
      if (!scene.textures.exists(key)) {
        const S = 256;
        const g = scene.make.graphics({ x: 0, y: 0 }, false);
        for (let r = S / 2; r > 0; r -= 2) {
          const a = Math.pow(1 - r / (S / 2), 2.4) * 0.5;
          g.fillStyle(color, a);
          g.fillCircle(S / 2, S / 2, r);
        }
        g.generateTexture(key, S, S);
        g.destroy();
      }
      const img = scene.add.image(0, 0, key)
        .setScrollFactor(0)
        .setDepth(-97)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.2);
      this.glows.push({
        g: img,
        vx: (i % 2 === 0 ? 1 : -1) * (6 + i * 3),
        vy: (i === 1 ? 1 : -1) * (4 + i * 2),
        base: 0.16 + i * 0.03,
      });
    });

    // 地平线光带：屏幕下缘的横向光
    this.floorLight = scene.add.rectangle(width / 2, height - 4, width, 90, 0x1b4a63, 0.16)
      .setScrollFactor(0).setDepth(-96).setBlendMode(Phaser.BlendModes.ADD)
      .setOrigin(0.5, 1);

    scene.scale.on('resize', (gs: Phaser.Structs.Size) => {
      this.paintGrid(gs.width, gs.height);
      this.floorLight.setSize(gs.width, 90).setPosition(gs.width / 2, gs.height - 4);
    });
  }

  private paintGrid(w: number, h: number) {
    const g = this.grid;
    g.clear();
    const step = 32;
    // 静态网格线
    g.lineStyle(1, 0x2fd6e8, 0.045);
    for (let x = 0; x <= w; x += step) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.strokePath();
    }
    for (let y = 0; y <= h; y += step) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
    }
    // 每 4 格一条更亮的线，形成节奏
    g.lineStyle(1, 0x2fd6e8, 0.09);
    for (let x = 0; x <= w; x += step * 4) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.strokePath();
    }
    for (let y = 0; y <= h; y += step * 4) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.strokePath();
    }
  }

  update(dtMs: number) {
    this.t += dtMs / 1000;
    const { width, height } = this.scene.scale;
    // 光斑漂移 + 呼吸
    for (const gl of this.glows) {
      let x = gl.g.x + gl.vx * (dtMs / 1000);
      let y = gl.g.y + gl.vy * (dtMs / 1000);
      // 超出边界回绕
      if (x < -200) x = width + 200;
      if (x > width + 200) x = -200;
      if (y < -200) y = height + 200;
      if (y > height + 200) y = -200;
      gl.g.setPosition(x, y);
      gl.g.setAlpha(gl.base + Math.sin(this.t * 0.8 + gl.vx) * 0.05);
    }
  }

  destroy() {
    this.grid.destroy();
    this.floorLight.destroy();
    for (const gl of this.glows) gl.g.destroy();
    this.glows = [];
  }
}
