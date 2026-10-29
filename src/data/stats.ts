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
  /** 局外永久升级等级（商店购买） */
  perm: PermLevels;
}

/** 局外永久升级：等级越高越强，用金币购买 */
export interface PermLevels {
  hp: number;        // 最大 HP +12/级
  damage: number;    // 伤害 +6%/级
  speed: number;     // 移速 +4%/级
  pickup: number;    // 拾取范围 +10%/级
  exp: number;       // 经验 +8%/级
  cd: number;        // 冷却 -4%/级
}

export const PERM_EMPTY: PermLevels = { hp: 0, damage: 0, speed: 0, pickup: 0, exp: 0, cd: 0 };

/** 永久升级定义：max 上限，cost(n) 为从 n 升到 n+1 的金币价 */
export const PERM_UPGRADES = [
  { key: 'hp',     name: '体魄',   desc: '最大 HP +12',    max: 10, baseCost: 60 },
  { key: 'damage', name: '威力',   desc: '伤害 +6%',       max: 10, baseCost: 80 },
  { key: 'speed',  name: '脚力',   desc: '移速 +4%',       max: 8,  baseCost: 70 },
  { key: 'pickup', name: '磁引',   desc: '拾取范围 +10%',  max: 8,  baseCost: 50 },
  { key: 'exp',    name: '悟性',   desc: '经验 +8%',       max: 10, baseCost: 90 },
  { key: 'cd',     name: '节律',   desc: '冷却 -4%',       max: 8,  baseCost: 110 },
] as const;

export type PermKey = keyof PermLevels;

export function permCost(key: PermKey, level: number): number {
  const def = PERM_UPGRADES.find((u) => u.key === key)!;
  return Math.round(def.baseCost * Math.pow(1.55, level));
}

/** 把永久升级折算进一局的开局属性 */
export function applyPerm(stats: PlayerStats, perm: PermLevels): PlayerStats {
  const s = { ...stats };
  s.maxHp += perm.hp * 12;
  s.hp = s.maxHp;
  s.damageMul *= 1 + perm.damage * 0.06;
  s.speed *= 1 + perm.speed * 0.04;
  s.pickup *= 1 + perm.pickup * 0.10;
  s.expMul *= 1 + perm.exp * 0.08;
  s.cooldownMul *= Math.max(0.5, 1 - perm.cd * 0.04);
  return s;
}

const SAVE_KEY = 'poke-survivor-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const raw2 = JSON.parse(raw);
      const d: SaveData = {
        coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 3,
        ...raw2,
        perm: { ...PERM_EMPTY, ...(raw2.perm ?? {}) },
      };
      return d;
    }
  } catch { /* ignore */ }
  return { coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 3, perm: { ...PERM_EMPTY } };
}

export function writeSave(data: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
