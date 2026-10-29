export type MoveCategory = 'melee' | 'projectile' | 'aura' | 'aoe' | 'summon';

/**
 * 招式专属行为标签 —— 让同类别招式不再只是数值差异
 */
export type MoveTrait =
  | 'homing'      // 追踪最近的敌人
  | 'pierce'      // 穿透（已用 pierce 字段表达，这里用于表现层）
  | 'spread'      // 扇形散射
  | 'orbit'       // 环绕自身旋转的护体弹
  | 'chain'       // 命中后跳到附近敌人（连锁）
  | 'nova'        // 自身为中心爆发
  | 'shockwave'   // 向外扩散的冲击波
  | 'slam'        // 落点砸击（砸向我方瞄准方向）
  | 'sweep'       // 大角度横扫
  | 'flurry'      // 超高频连击
  | 'heal';       // 治疗

/** 稀有度：影响抽卡权重 */
export type Rarity = 'common' | 'rare' | 'epic';

export interface MoveDef {
  id: string;
  name: string;
  pokeId: number;
  type: string;
  category: MoveCategory;
  color: number;
  baseDamage: number;
  cooldown: number;      // ms/shot
  projectileSpeed?: number;
  pierce?: number;
  range?: number;        // for melee / aura radius / aoe radius
  duration?: number;     // aura / aoe active time
  count?: number;        // projectiles per shot / multi-hit
  desc: string;
  /** 专属行为标签：决定弹道/判定的形态，不只是数值 */
  traits?: MoveTrait[];
  /** 稀有度，默认 common */
  rarity?: Rarity;
  /** 是否有进化链（用于抽卡时优先展示可养成的） */
  hasEvolution?: boolean;
}

/** 抽卡权重 */
export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 1,
  rare: 0.55,
  epic: 0.28,
};

/** 稀有度中文 */
export const RARITY_ZH: Record<Rarity, string> = {
  common: '普通', rare: '稀有', epic: '史诗',
};

export const MOVES: Record<string, MoveDef> = {
  thunderbolt: {
    id: 'thunderbolt', name: '十万伏特', pokeId: 25, type: '电', category: 'projectile',
    color: 0xf7d02c, baseDamage: 12, cooldown: 620, projectileSpeed: 520, pierce: 0, count: 1,
    desc: '向最近的敌人发射电球',
    traits: ['homing'],
    rarity: 'rare',
    hasEvolution: true,
  },
  flamethrower: {
    id: 'flamethrower', name: '喷射火焰', pokeId: 6, type: '火', category: 'projectile',
    color: 0xf0703c, baseDamage: 9, cooldown: 400, projectileSpeed: 460, pierce: 1, count: 1,
    desc: '快速喷出穿透火焰',
    traits: ['pierce', 'spread'],
    rarity: 'rare',
    hasEvolution: true,
  },
  watergun: {
    id: 'watergun', name: '水枪', pokeId: 9, type: '水', category: 'projectile',
    color: 0x4592e0, baseDamage: 10, cooldown: 520, projectileSpeed: 480, pierce: 0, count: 2,
    desc: '同时射出两股水流',
    traits: ['spread'],
    rarity: 'rare',
    hasEvolution: true,
  },
  razorleaf: {
    id: 'razorleaf', name: '飞叶快刀', pokeId: 3, type: '草', category: 'projectile',
    color: 0x63c256, baseDamage: 8, cooldown: 560, projectileSpeed: 540, pierce: 2, count: 1,
    desc: '高穿透飞叶',
    traits: ['pierce'],
    rarity: 'rare',
    hasEvolution: true,
  },
  bodyslam: {
    id: 'bodyslam', name: '泰山压顶', pokeId: 143, type: '一般', category: 'aoe',
    color: 0xb8b8a8, baseDamage: 30, cooldown: 1800, range: 110, duration: 220,
    desc: '以自身为中心重压',
    traits: ['nova'],
    rarity: 'epic',
  },
  shadowball: {
    id: 'shadowball', name: '暗影球', pokeId: 94, type: '幽灵', category: 'projectile',
    color: 0x8a5fbf, baseDamage: 18, cooldown: 900, projectileSpeed: 380, pierce: 1, count: 1,
    desc: '缓慢但高伤的暗影球',
    traits: ['pierce'],
    rarity: 'rare',
    hasEvolution: true,
  },
  dragonclaw: {
    id: 'dragonclaw', name: '龙之爪', pokeId: 149, type: '龙', category: 'melee',
    color: 0x6a4fd0, baseDamage: 22, cooldown: 700, range: 90,
    desc: '身前横扫近战',
    traits: ['sweep'],
    rarity: 'epic',
    hasEvolution: true,
  },
  aurasphere: {
    id: 'aurasphere', name: '波导弹', pokeId: 448, type: '格斗', category: 'projectile',
    color: 0x40b0d0, baseDamage: 16, cooldown: 800, projectileSpeed: 420, pierce: 2, count: 1,
    desc: '追踪波导弹',
    traits: ['homing', 'pierce'],
    rarity: 'epic',
    hasEvolution: true,
  },
  psychic: {
    id: 'psychic', name: '精神强念', pokeId: 282, type: '超能', category: 'aura',
    color: 0xf0609c, baseDamage: 6, cooldown: 300, range: 120, duration: 300,
    desc: '周围持续超能伤害光环',
    traits: ['nova'],
    rarity: 'rare',
    hasEvolution: true,
  },
  aquatail: {
    id: 'aquatail', name: '水流尾', pokeId: 130, type: '水', category: 'melee',
    color: 0x4592e0, baseDamage: 26, cooldown: 900, range: 100,
    desc: '大幅扫尾近战',
    traits: ['sweep', 'pierce'],
    rarity: 'epic',
    hasEvolution: true,
  },
  rockslide: {
    id: 'rockslide', name: '岩崩', pokeId: 248, type: '岩石', category: 'aoe',
    color: 0xb8a038, baseDamage: 34, cooldown: 2200, range: 140, duration: 300,
    desc: '落石范围爆发',
    traits: ['slam'],
    rarity: 'epic',
    hasEvolution: true,
  },
  thunderpunch: {
    id: 'thunderpunch', name: '雷光拳', pokeId: 466, type: '电', category: 'melee',
    color: 0xf7d02c, baseDamage: 20, cooldown: 600, range: 80,
    desc: '快速电拳',
    traits: ['flurry'],
    rarity: 'common',
  },
  flareblitz: {
    id: 'flareblitz', name: '闪焰冲锋', pokeId: 78, type: '火', category: 'melee',
    color: 0xf0703c, baseDamage: 28, cooldown: 1000, range: 95,
    desc: '冲锋火焰近战',
    traits: ['sweep'],
    rarity: 'common',
  },
  earthquake: {
    id: 'earthquake', name: '地震', pokeId: 28, type: '地面', category: 'aoe',
    color: 0xd0a848, baseDamage: 40, cooldown: 2500, range: 160, duration: 350,
    desc: '大范围地面爆破',
    traits: ['shockwave', 'nova'],
    rarity: 'common',
  },
  firespin: {
    id: 'firespin', name: '火焰旋涡', pokeId: 38, type: '火', category: 'aura',
    color: 0xf0904c, baseDamage: 5, cooldown: 300, range: 110, duration: 300,
    desc: '火焰光环持续灼烧',
    traits: ['nova'],
    rarity: 'common',
  },
  ironhead: {
    id: 'ironhead', name: '铁头', pokeId: 208, type: '钢', category: 'melee',
    color: 0x9aa8b8, baseDamage: 24, cooldown: 800, range: 85,
    desc: '钢之头槌',
    traits: ['sweep'],
    rarity: 'common',
  },
  morningsun: {
    id: 'morningsun', name: '晨光', pokeId: 196, type: '超能', category: 'summon',
    color: 0xf0e070, baseDamage: 0, cooldown: 6000, count: 1,
    desc: '恢复自身生命',
    traits: ['heal'],
    rarity: 'common',
  },
  sludgebomb: {
    id: 'sludgebomb', name: '污泥炸弹', pokeId: 34, type: '毒', category: 'projectile',
    color: 0xa040a0, baseDamage: 14, cooldown: 700, projectileSpeed: 340, pierce: 1, count: 1,
    desc: '投掷污泥弹',
    traits: ['slam'],
    rarity: 'common',
  },
  blazekick: {
    id: 'blazekick', name: '火焰踢', pokeId: 257, type: '火', category: 'melee',
    color: 0xf0703c, baseDamage: 26, cooldown: 750, range: 90,
    desc: '火焰飞踢',
    traits: ['sweep'],
    rarity: 'common',
  },
  mudslap: {
    id: 'mudslap', name: '泥巴射击', pokeId: 260, type: '地面', category: 'projectile',
    color: 0xc0a070, baseDamage: 11, cooldown: 450, projectileSpeed: 440, pierce: 0, count: 2,
    desc: '快速双发泥浆',
    traits: ['spread'],
    rarity: 'common',
  },
  leafblade: {
    id: 'leafblade', name: '叶刃', pokeId: 254, type: '草', category: 'melee',
    color: 0x63c256, baseDamage: 25, cooldown: 850, range: 100,
    desc: '利刃横扫',
    traits: ['sweep', 'pierce'],
    rarity: 'common',
  },
  confusion: {
    id: 'confusion', name: '念力', pokeId: 65, type: '超能', category: 'projectile',
    color: 0xe060a0, baseDamage: 13, cooldown: 500, projectileSpeed: 400, pierce: 3, count: 1,
    desc: '高穿透念力波',
    traits: ['pierce', 'chain'],
    rarity: 'common',
  },
  cometpunch: {
    id: 'cometpunch', name: '连续拳', pokeId: 115, type: '一般', category: 'melee',
    color: 0xd0b090, baseDamage: 8, cooldown: 320, range: 70, count: 3,
    desc: '超快三段拳',
    traits: ['flurry', 'spread'],
    rarity: 'common',
  },
  dragonrush: {
    id: 'dragonrush', name: '龙之俯冲', pokeId: 445, type: '龙', category: 'projectile',
    color: 0x6a4fd0, baseDamage: 21, cooldown: 950, projectileSpeed: 500, pierce: 2, count: 1,
    desc: '高速穿透冲击',
    traits: ['chain'],
    rarity: 'epic',
  },
};

export const MOVE_LIST = Object.values(MOVES);
