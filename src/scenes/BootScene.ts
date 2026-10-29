import Phaser from 'phaser';

const POKEMON_IDS = [
  25, 6, 9, 3, 143, 94, 149, 448, 282, 130, 248, 466, 78, 28, 38, 208,
  196, 34, 257, 260, 254, 65, 115, 445, 19, 20, 41, 42, 109, 110, 92, 93,
  29, 60, 63, 66, 72, 80, 100, 81, 43, 69, 120, 138, 22, 150,
];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.setPath('assets');

    // 训练家 4 帧图集：down/up/left/right
    this.load.spritesheet('ash', 'trainer/ash_sheet.png', { frameWidth: 48, frameHeight: 48 });

    for (const id of POKEMON_IDS) {
      const key = `pk_${id}`;
      this.load.image(key, `pokemon/${String(id).padStart(3, '0')}.png`);
    }

    // 进度条
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2 + 40, 240, 6, 0x1a2633).setOrigin(0.5);
    const fill = this.add.rectangle(width / 2 - 120, height / 2 + 40, 0, 6, 0x449ddf).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => { fill.width = 240 * p; });
    this.load.on('complete', () => { bar.destroy(); fill.destroy(); });
  }

  create() {
    this.scene.start('Menu');
  }
}
