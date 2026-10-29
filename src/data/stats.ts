export const TRAITS = [
  { id: 'swift',    name: '急足',   desc: '移速 +15%' },
  { id: 'iron',     name: '铁壁',   desc: '最大 HP +25，受伤 -10%' },
  { id: 'affinity', name: '亲和',   desc: '拾取范围 +40%，经验 +10%' },
  { id: 'power',    name: '蛮力',   desc: '伤害 +18%' },
  { id: 'haste',    name: '迅捷',   desc: '招式冷却 -12%' },
  { id: 'vitality', name: '活力',   desc: '最大 HP +40，回血速度 +50%' },
  { id: 'scholar',  name: '好学',   desc: '经验 +30%' },
  { id: 'magnet',   name: '磁力',   desc: '拾取范围 +80%' },
  { id: 'guard',    name: '守护',   desc: '受伤 -22%' },
] as const;

export type TraitId = typeof TRAITS[number]['id'];

export interface PlayerStats {
  hp: number;
  maxHp: number;
  speed: number;
  damageMul: number;
  cooldownMul: number;
  pickup: number;
  expMul: number;
  damageTakenMul: number;
  radius: number;
}

export const BASE_STATS: PlayerStats = {
  hp: 180, maxHp: 180, speed: 185, damageMul: 1.25, cooldownMul: 1,
  pickup: 85, expMul: 1, damageTakenMul: 1, radius: 11,
};

export const MAX_SLOTS = 6;
/** 全局尺寸缩放：整体缩小 25% */
export const GLOBAL_SCALE = 0.75;
/**
 * 主角缩放 —— 与普通怪同显示高度。
 * 普通怪贴图 64px × 0.62 = 39.7px；主角贴图 48px，
 * 因此 48 × PLAYER_SCALE ≈ 39.7 × GLOBAL_SCALE → PLAYER_SCALE ≈ 0.62。
 */
export const PLAYER_SCALE = 0.62;
/** 主角判定圈半径（视觉缩小后同步收紧） */
export const PLAYER_RADIUS = 11;
/** 一局时长（测试期压缩到 5 分钟，正式版改回 15*60） */
export const RUN_SECONDS = 5 * 60;
export const ENEMY_CAP = 300;

export function expForLevel(level: number): number {
  return Math.floor(5 + level * 10 * (1 + level * 0.06));
}

export interface SaveData {
  coins: number;
  bestTime: number;
  unlocked: string[];
  /** 开发者模式：玩家输出伤害倍率（1 = 正常） */
  devDmgMul: number;
  /** 开发者模式：玩家受到伤害倍率（0 = 无敌，1 = 正常） */
  devTakenMul: number;
  /** 开发者模式：经验获取倍率（默认 3 倍，测试期加速成长） */
  devExpMul: number;
}

const SAVE_KEY = 'poke-survivor-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const d = { coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 0, devExpMul: 3, ...JSON.parse(raw) };
      return d;
    }
  } catch { /* ignore */ }
  return { coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 0, devExpMul: 3 };
}

export function writeSave(data: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
