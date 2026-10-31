import Phaser from 'phaser';
import { UI, TEXT } from '../ui/Theme';
import { MENU_SPRITE_IDS } from '../data/sprites';

/**
 * 首屏只加载主菜单背景要用的那几只。
 *
 * 曾经这里用 spriteIds() 全量 166 张 —— 首屏要多等几百毫秒到几秒，
 * 还白烧流量，而主菜单只拿 9 只当背景。其余贴图由各场景按需加载
 * （data/lazySprites.ts），进关卡/选伙伴/翻图鉴时才请求。
 */
const POKEMON_IDS = MENU_SPRITE_IDS;

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

    // GitHub 图标（矢量 SVG → Phaser 按目标尺寸栅格化，任意分辨率都清晰）
    this.load.svg('github-mark', 'github-mark.svg', { width: 64, height: 64 });

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
