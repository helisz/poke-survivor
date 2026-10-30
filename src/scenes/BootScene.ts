import Phaser from 'phaser';
import { UI, TEXT } from '../ui/Theme';
import { spriteIds } from '../data/sprites';

/**
 * 预加载的贴图编号。
 *
 * 从数据推导而不是手写死名单 —— 池子一改就得同步手改列表，漏一个就是
 * 「贴图缺失」黑框。推导逻辑放在 data/sprites.ts，测试导同一份。
 */
const POKEMON_IDS = spriteIds();

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
