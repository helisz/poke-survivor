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

/** 一座地图 = 一个关卡，按顺序解锁 */
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
  /** 该地图专属小怪池（宝可梦图鉴编号），为空则用全局池 */
  enemyPool?: number[];
  /** 该地图专属精英池 */
  elitePool?: number[];
  /** 该地图刷怪数量倍率（<1 更稀疏，>1 更密集） */
  spawnMul?: number;
  /** 该地图怪物额外掉落经验倍率 */
  expMul?: number;
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
    enemyPool: [19, 20, 43, 69, 63, 29, 120, 138],
    spawnMul: 1,
    expMul: 1,
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
    enemyPool: [43, 69, 63, 29, 66, 72, 120, 138],
    elitePool: [142, 146],
    spawnMul: 1.15,
    expMul: 1.05,
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
    enemyPool: [41, 42, 92, 93, 109, 110, 66, 80],
    elitePool: [94, 429],
    spawnMul: 0.85,
    expMul: 1.2,
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
    enemyPool: [60, 72, 80, 81, 100, 120, 109, 110],
    elitePool: [160, 154],
    spawnMul: 1.35,
    expMul: 1.1,
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
    enemyPool: [19, 20, 29, 41, 42, 81, 100, 110],
    elitePool: [142, 146],
    spawnMul: 1.1,
    expMul: 1.3,
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
    enemyPool: [92, 93, 109, 110, 120, 138, 66, 80],
    elitePool: [373, 475],
    spawnMul: 1.2,
    expMul: 1.45,
    decorations: [
      { type: 'pillar', color: 0x4a4560, scale: 1.2 },
      { type: 'pillar', color: 0x38354a, scale: 0.9 },
      { type: 'bone', color: 0x6b6480, scale: 0.75 },
      { type: 'crystal', color: 0xc9a6ff, scale: 0.8 },
    ],
  },
];

/** 一局分成几段地图（旧版按时间轮换用，保留以兼容） */
export const MAP_SEGMENTS = MAP_THEMES.length;

/** 关卡总数 */
export const STAGE_COUNT = MAP_THEMES.length;

/**
 * 关卡强度倍率：每往后一关，怪的攻击 +15%、血量 +20%、速度 +2%，连乘。
 *
 * 第 0 关（草原）为 1×，第 5 关（遗迹）依次累乘到：
 *   攻击 1.15^5 ≈ 2.01×，血量 1.20^5 ≈ 2.49×，速度 1.02^5 ≈ 1.10×
 *
 * 注意：这是「关卡本身」的倍率，取代了旧版每张地图自带的
 * enemyHpMul / enemySpeedMul。地图的刷怪密度与经验倍率仍然保留。
 */
export const STAGE_ATK_STEP = 1.15;
export const STAGE_HP_STEP = 1.20;
export const STAGE_SPD_STEP = 1.02;

export interface StageScale {
  /** 敌人伤害倍率 */
  atk: number;
  /** 敌人血量倍率 */
  hp: number;
  /** 敌人移速倍率 */
  spd: number;
}

export function stageScale(stage: number): StageScale {
  const n = Math.max(0, Math.min(STAGE_COUNT - 1, Math.floor(stage)));
  return {
    atk: Math.pow(STAGE_ATK_STEP, n),
    hp: Math.pow(STAGE_HP_STEP, n),
    spd: Math.pow(STAGE_SPD_STEP, n),
  };
}

/** 按进度（0~1）取当前地图索引（旧版一局内轮换地图用） */
export function themeIndexAtProgress(progress: number): number {
  const i = Math.floor(progress * MAP_SEGMENTS);
  return Math.max(0, Math.min(MAP_SEGMENTS - 1, i));
}
