import Phaser from 'phaser';
import { UI, TEXT } from '../ui/Theme';

const POKEMON_IDS = [
  25, 6, 9, 3, 143, 94, 149, 448, 282, 130, 248, 466, 78, 28, 38, 208,
  196, 34, 257, 260, 254, 65, 115, 445, 19, 20, 41, 42, 109, 110, 92, 93,
  29, 60, 63, 66, 72, 80, 100, 81, 43, 69, 120, 138, 22, 150,
  // 进化形态
  26, 142, 146, 154, 160, 373, 429, 475,
];

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.setPath('assets');

    // 训练家 4 帧图集：down/up/left/right
    this.load.spritesheet('ash', 'trainer/ash_sheet.png', { frameWidth: 48, frameHeight: 48 });

    // 游戏 logo（透明底 PNG）
    // 显式指定 LINEAR：全局 pixelArt:true 会把新纹理设成 NEAREST，
    // 而 logo 边缘是按 alpha 羽化的，NEAREST 硬采样会沿轮廓抖出一圈白点。
    // 这里在加载时就定好采样方式，之后不再被覆盖。
    this.load.image('logo', 'logo.png', { magFilter: 1, minFilter: 1 } as never);

    for (const id of POKEMON_IDS) {
      const key = `pk_${id}`;
      this.load.image(key, `pokemon/${String(id).padStart(3, '0')}.png`);
    }

    // 进度条
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2 + 40, 240, 6, 0x1a2633).setOrigin(0.5);
    const fill = this.add.rectangle(width / 2 - 120, height / 2 + 40, 0, 6, UI.primary).setOrigin(0, 0.5);
    this.load.on('progress', (p: number) => { fill.width = 240 * p; });
    this.load.on('complete', () => { bar.destroy(); fill.destroy(); });

    // 兜底：文件级别配置之后仍确保一次（部分版本会忽略 load config）
    this.load.once('filecomplete-image-logo', () => {
      this.textures.get('logo')?.setFilter(Phaser.Textures.FilterMode.LINEAR);
    });
  }

  create() {
    this.scene.start('Menu');
  }
}
