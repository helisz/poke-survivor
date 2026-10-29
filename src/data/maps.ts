/**
 * 6 张地图主题 —— 一局按时间顺序推进，越往后越凶险。
 * 每张地图定义：底色、噪点色板、装饰物、环境光、怪物加权。
 */

export interface Decoration {
  /** 图形类型 */
  type: 'tree' | 'rock' | 'bush' | 'crystal' | 'bone' | 'pillar' | 'lava' | 'reed';
  color: number;
  /** 尺寸倍数 */
  scale: number;
}

export interface MapTheme {
  id: string;
  name: string;
  nameJp: string;
  /** 地面基色 */
  base: number;
  /** 噪点色板（越靠前越常见） */
  noise: number[];
  /** 深色斑块色 */
  patch: number;
  /** 场景装饰物池 */
  decorations: Decoration[];
  /** 覆盖光的颜色与透明度（营造氛围） */
  ambient: number;
  ambientAlpha: number;
  /** 该地图怪物移动速度倍率 */
  enemySpeedMul: number;
}

export const MAP_THEMES: MapTheme[] = [
  {
    id: 'grassland',
    name: '草原',
    nameJp: '草原',
    base: 0x2f5a34,
    noise: [0x37683c, 0x2a4f2f, 0x3d7243, 0x25452a],
    patch: 0x25452a,
    ambient: 0x8ecf7a,
    ambientAlpha: 0.05,
    enemySpeedMul: 1,
    decorations: [
      { type: 'bush', color: 0x3d7243, scale: 1 },
      { type: 'bush', color: 0x356b3a, scale: 0.8 },
      { type: 'tree', color: 0x2a4f2f, scale: 1 },
    ],
  },
  {
    id: 'forest',
    name: '森林',
    nameJp: '森',
    base: 0x1e3a26,
    noise: [0x254a2e, 0x18301e, 0x2b5735, 0x142818],
    patch: 0x142818,
    ambient: 0x3f9b5c,
    ambientAlpha: 0.1,
    enemySpeedMul: 1.05,
    decorations: [
      { type: 'tree', color: 0x2a5a34, scale: 1.15 },
      { type: 'tree', color: 0x1c4227, scale: 0.9 },
      { type: 'bush', color: 0x356b3a, scale: 1 },
      { type: 'bush', color: 0x2b5735, scale: 0.75 },
    ],
  },
  {
    id: 'cave',
    name: '洞窟',
    nameJp: '洞窟',
    base: 0x2a2a33,
    noise: [0x353542, 0x202028, 0x40404f, 0x1a1a20],
    patch: 0x1a1a20,
    ambient: 0x6f7bd6,
    ambientAlpha: 0.12,
    enemySpeedMul: 1,
    decorations: [
      { type: 'rock', color: 0x45454f, scale: 1.1 },
      { type: 'rock', color: 0x353542, scale: 0.8 },
      { type: 'crystal', color: 0x7f8ce8, scale: 0.9 },
    ],
  },
  {
    id: 'swamp',
    name: '沼泽',
    nameJp: '沼',
    base: 0x2a3428,
    noise: [0x33402f, 0x212a20, 0x3b4a36, 0x1a221a],
    patch: 0x1a221a,
    ambient: 0x7fb04a,
    ambientAlpha: 0.11,
    enemySpeedMul: 0.92,
    decorations: [
      { type: 'reed', color: 0x4a6b3a, scale: 1 },
      { type: 'reed', color: 0x3c5730, scale: 0.85 },
      { type: 'bush', color: 0x2f4a2a, scale: 1.1 },
      { type: 'bone', color: 0x6b6b5a, scale: 0.7 },
    ],
  },
  {
    id: 'volcano',
    name: '火山',
    nameJp: '火山',
    base: 0x331f1a,
    noise: [0x42261f, 0x28150f, 0x4f2e24, 0x1e0f0b],
    patch: 0x1e0f0b,
    ambient: 0xff6a33,
    ambientAlpha: 0.13,
    enemySpeedMul: 1.12,
    decorations: [
      { type: 'rock', color: 0x4a2c22, scale: 1.1 },
      { type: 'lava', color: 0xff5a22, scale: 1 },
      { type: 'lava', color: 0xff8c3a, scale: 0.7 },
      { type: 'rock', color: 0x2e1a14, scale: 0.85 },
    ],
  },
  {
    id: 'ruins',
    name: '遗迹',
    nameJp: '遺跡',
    base: 0x2c2a38,
    noise: [0x38354a, 0x211f2c, 0x454156, 0x1a1824],
    patch: 0x1a1824,
    ambient: 0xb08cff,
    ambientAlpha: 0.14,
    enemySpeedMul: 1.15,
    decorations: [
      { type: 'pillar', color: 0x4a4560, scale: 1.2 },
      { type: 'pillar', color: 0x38354a, scale: 0.9 },
      { type: 'bone', color: 0x6b6480, scale: 0.75 },
      { type: 'crystal', color: 0xc9a6ff, scale: 0.8 },
    ],
  },
];

/** 一局分成几段地图 */
export const MAP_SEGMENTS = MAP_THEMES.length;

/** 按进度（0~1）取当前地图索引 */
export function themeIndexAtProgress(progress: number): number {
  const i = Math.floor(progress * MAP_SEGMENTS);
  return Math.max(0, Math.min(MAP_SEGMENTS - 1, i));
}
