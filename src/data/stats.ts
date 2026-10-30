export const TRAITS = [
  { id: 'swift',    name: '急足',   icon: 'wind',  desc: '移速 +6%' },
  { id: 'iron',     name: '铁壁',   icon: 'shield', desc: '最大 HP +12，受伤 -5%' },
  { id: 'affinity', name: '亲和',   icon: 'heart',  desc: '拾取范围 +15%，经验 +5%' },
  { id: 'power',    name: '蛮力',   icon: 'fist',   desc: '伤害 +5%' },
  { id: 'haste',    name: '迅捷',   icon: 'clock',  desc: '招式冷却 -4%' },
  { id: 'vitality', name: '活力',   icon: 'plus',   desc: '最大 HP +18，回血 +15%' },
  { id: 'scholar',  name: '好学',   icon: 'book',   desc: '经验 +8%' },
  { id: 'magnet',   name: '磁力',   icon: 'magnet', desc: '拾取范围 +25%' },
  { id: 'guard',    name: '守护',   icon: 'armor',  desc: '受伤 -8%' },
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
  hp: 180, maxHp: 180, speed: 118, damageMul: 1.05, cooldownMul: 1,
  // 经验获取提升 50%：1 → 1.5。局外「悟性」和学者特性都在这个基数上乘算，
  // 所以它们的效果也同步被放大。
  pickup: 85, expMul: 1.5, damageTakenMul: 3, radius: 11,
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
  /** 已通关的最高关卡序号（0 = 只解锁第 1 关；5 = 全通关） */
  stageProgress: number;
  /** 开发者：关卡全解锁（不影响真实 stageProgress） */
  devAllStages: boolean;
}

/** 局外永久升级：等级越高越强，用金币购买 */
export interface PermLevels {
  hp: number;        // 最大 HP +12/级
  damage: number;    // 伤害 +6%/级
  speed: number;     // 移速 +4%/级
  pickup: number;    // 拾取范围 +10%/级
  exp: number;       // 经验 +8%/级
  cd: number;        // 冷却 -4%/级
  gamble: number;    // 赌神：每级 +1 次升级重掷（最多 3 级）
}

export const PERM_EMPTY: PermLevels = {
  hp: 0, damage: 0, speed: 0, pickup: 0, exp: 0, cd: 0, gamble: 0,
};

/** 所有强化项统一 10 级上限 */
export const PERM_MAX_LEVEL = 10;

/** 价格起点与满级点：1 级最便宜，买满（第 10 级）时最贵 */
export const PERM_COST_MIN = 50;
export const PERM_COST_MAX = 30000;

/**
 * 第 n 级（1-based，n=1..10）的购买价。
 *
 * 曲线要求：前几级几乎看不出涨（起步平缓），越往后增速越陡。
 * 用指数 power=5 的归一化曲线：
 *   p = min + (max-min) * ((n-1)/9)^5
 * 实际价格 50 / 51 / 66 / 173 / 569 / 1635 / 3994 / 8575 / 16670 / 30000，
 * 首级只涨 1 金币，最后一级一跃 +13330，正好是「平缓起步 + 尾部急拉」。
 *
 * 不用更陡的 power=6：那样第 1、2 级都会取整成 50，价格不再严格递增。
 */
export function permCostAtLevel(level: number): number {
  const n = Math.min(Math.max(level, 1), PERM_MAX_LEVEL);
  const t = (n - 1) / (PERM_MAX_LEVEL - 1);
  return Math.round(PERM_COST_MIN + (PERM_COST_MAX - PERM_COST_MIN) * Math.pow(t, 5));
}

/**
 * 永久升级定义。
 *
 * gainAt(level) 给出「第 level 级这一级」带来的百分比增量：
 * - from/to 相同 → 每级固定值（脚力、节律）
 * - from/to 不同 → 从 from 匀速线性升到 to（体魄、威力、磁引、悟性）
 *
 * 注意：不是每级固定值，而是每级的增量本身在递增，
 * 所以满级累计 > 单级最大值 × 级数的一半。见 permTotal。
 */
function ramp(from: number, to: number) {
  return (level: number) => {
    const n = Math.min(Math.max(level, 1), PERM_MAX_LEVEL);
    return from + (to - from) * ((n - 1) / (PERM_MAX_LEVEL - 1));
  };
}
const flat = (v: number) => () => v;

export const PERM_UPGRADES = [
  { key: 'hp',     name: '体魄', max: PERM_MAX_LEVEL, gainAt: ramp(0.01, 0.03) },
  { key: 'damage', name: '威力', max: PERM_MAX_LEVEL, gainAt: ramp(0.01, 0.10) },
  { key: 'speed',  name: '脚力', max: PERM_MAX_LEVEL, gainAt: flat(0.01) },
  { key: 'pickup', name: '磁引', max: PERM_MAX_LEVEL, gainAt: ramp(0.01, 0.03) },
  { key: 'exp',    name: '悟性', max: PERM_MAX_LEVEL, gainAt: ramp(0.03, 0.10) },
  { key: 'cd',     name: '节律', max: PERM_MAX_LEVEL, gainAt: flat(0.01) },
  // 赌神：不给百分比，给「每局升级时多 N 次重掷」。价格另算，见 GAMBLE_COSTS。
  { key: 'gamble', name: '赌神', max: 3, gainAt: flat(0) },
] as const;

/**
 * 赌神单独定价：不套用统一的 50→30000 曲线。
 * 1 级 5 万 / 2 级 15 万 / 3 级 50 万，每级 +1 次重掷。
 * 索引 0 对应「买第 1 级」的价钱。
 */
export const GAMBLE_COSTS = [50000, 150000, 500000] as const;

/** 赌神等级 → 每局额外的重掷次数 */
export function rerollsPerRun(gambleLevel: number): number {
  return Math.max(0, Math.min(3, Math.floor(gambleLevel)));
}

export type PermKey = keyof PermLevels;

/** 某个强化项升到 level 级时的累计增益（0~1 之间的小数） */
export function permTotal(key: PermKey, level: number): number {
  const def = PERM_UPGRADES.find((u) => u.key === key)!;
  let sum = 0;
  for (let i = 1; i <= level; i++) sum += def.gainAt(i);
  return sum;
}

/** 某一级的单级增益（用于商店展示「本级 +x%」） */
export function permStep(key: PermKey, level: number): number {
  const def = PERM_UPGRADES.find((u) => u.key === key)!;
  return def.gainAt(Math.min(Math.max(level, 1), def.max));
}

/** 从 level 升到 level+1 的购买价 */
export function permCost(key: PermKey, level: number): number {
  // 赌神走自己的价目表，不套统一曲线
  if (key === 'gamble') {
    const i = Math.max(0, Math.min(GAMBLE_COSTS.length - 1, Math.floor(level)));
    return GAMBLE_COSTS[i];
  }
  return permCostAtLevel(level + 1);
}

/** 把永久升级折算进一局的开局属性（增益按累积曲线算，不是简单乘级数） */
export function applyPerm(stats: PlayerStats, perm: PermLevels): PlayerStats {
  const s = { ...stats };
  s.maxHp *= 1 + permTotal('hp', perm.hp);
  s.hp = s.maxHp;
  s.damageMul *= 1 + permTotal('damage', perm.damage);
  s.speed *= 1 + permTotal('speed', perm.speed);
  s.pickup *= 1 + permTotal('pickup', perm.pickup);
  s.expMul *= 1 + permTotal('exp', perm.exp);
  s.cooldownMul *= Math.max(0.5, 1 - permTotal('cd', perm.cd));
  return s;
}

const SAVE_KEY = 'poke-survivor-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const raw2 = JSON.parse(raw);
      const d: SaveData = {
        coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 1,
        stageProgress: 0, devAllStages: false,
        ...raw2,
        perm: { ...PERM_EMPTY, ...(raw2.perm ?? {}) },
      };
      // 迁移：devExpMul 的默认值曾经是 3（测试期快速升级），正式版改成 1。
      // 老存档里存的 3 不是玩家自己调的，直接归位；玩家手动改过的其它值保留。
      if (d.devExpMul === 3) d.devExpMul = 1;
      return d;
    }
  } catch { /* ignore */ }
  return { coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 1, stageProgress: 0, devAllStages: false, perm: { ...PERM_EMPTY } };
}

export function writeSave(data: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
