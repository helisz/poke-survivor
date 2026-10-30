import type { FxKind } from '../systems/FxSystem';

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
  /** 视觉表现风格：lightning = 劈出的闪电；fist = 挥出的拳头；fireball = 分裂火球 */
  style?: 'lightning' | 'fist' | 'fireball';
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
  /** 进化后才能用的视觉参数，见 evolvedFx 说明；有值 = 该招有进化形态 */
  evo?: EvoFx;
}

/**
 * 进化形态的视觉参数（第一层：弹道本体改造）
 *
 * 只影响表现，不改伤害 —— 伤害/冷却走 EvolutionDef 的 dmgMul / cdMul。
 * 这样调视觉可以放心大胆，不会像以前那样"改着改着数值也跟着漂"。
 */
export interface EvoFx {
  /** 弹道视觉形态，见 FxKind；未填则沿用原招式 */
  kind?: FxKind;
  /** 主色（比原色更艳，用来一眼分辨进化形态） */
  color?: number;
  /** 辅色，做渐变和高光的第二层颜色 */
  accent?: number;
  /** 弹体放大倍率 */
  scale?: number;
  /** 拖尾长度（同时在场的历史弹影数量），0 = 无拖尾 */
  trail?: number;
  /** 命中时是否触发震屏 */
  shake?: boolean;
  /** 命中特效的粒子数 */
  hitParticles?: number;
  /** 是否在弹道上叠加电弧（闪电类） */
  arc?: boolean;
  /** 进化后的招式名（HUD 与弹窗显示用） */
  name?: string;
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
    id: 'thunderbolt', name: '十万伏特', pokeId: 25, type: '电', category: 'projectile', style: 'lightning',
    color: 0xf7d02c, baseDamage: 26, cooldown: 1150, projectileSpeed: 520, pierce: 1,
    desc: '向最近的敌人发射电球',
    traits: ['homing'],
    rarity: 'rare',
    hasEvolution: true,
    evo: {
      kind: 'bolt', color: 0xfff24a, accent: 0xffffff,
      scale: 1.45, trail: 3, arc: true, shake: true, hitParticles: 26,
      name: '高压电击',
    },
  },
  flamethrower: {
    id: 'flamethrower', name: '喷射火焰', pokeId: 6, type: '火', category: 'projectile', style: 'fireball',
    color: 0xf0703c, baseDamage: 23, cooldown: 1180, projectileSpeed: 460, pierce: 1,
    desc: '快速喷出穿透火焰',
    traits: ['pierce', 'spread'],
    rarity: 'rare',
    hasEvolution: true,
    evo: {
      kind: 'laser', color: 0xff7a1a, accent: 0xffe066,
      scale: 1.8, trail: 5, shake: true, hitParticles: 24,
      name: '圣火',
    },
  },
  watergun: {
    id: 'watergun', name: '水枪', pokeId: 9, type: '水', category: 'projectile',
    color: 0x4592e0, baseDamage: 22, cooldown: 1150, projectileSpeed: 480, pierce: 1,
    desc: '同时射出两股水流',
    traits: ['spread'],
    rarity: 'rare',
    hasEvolution: true,
    evo: {
      kind: 'laser', color: 0x3ea0ff, accent: 0xbdf0ff,
      scale: 1.7, trail: 4, hitParticles: 22,
      name: '激流炮',
    },
  },
  razorleaf: {
    id: 'razorleaf', name: '飞叶快刀', pokeId: 3, type: '草', category: 'projectile',
    color: 0x63c256, baseDamage: 24, cooldown: 1150, projectileSpeed: 540, pierce: 1,
    desc: '高穿透飞叶',
    traits: ['pierce'],
    rarity: 'rare',
    hasEvolution: true,
    evo: {
      kind: 'slash', color: 0x7dff6a, accent: 0xffffff,
      scale: 1.5, trail: 3, hitParticles: 20,
      name: '叶风暴',
    },
  },
  bodyslam: {
    id: 'bodyslam', name: '泰山压顶', pokeId: 143, type: '一般', category: 'aoe',
    color: 0xb8b8a8, baseDamage: 13, cooldown: 1900, range: 110, duration: 220,
    desc: '以自身为中心重压',
    traits: ['nova'],
    rarity: 'epic',
  },
  shadowball: {
    id: 'shadowball', name: '暗影球', pokeId: 94, type: '幽灵', category: 'projectile',
    color: 0x8a5fbf, baseDamage: 30, cooldown: 1300, projectileSpeed: 380, pierce: 1,
    desc: '缓慢但高伤的暗影球',
    traits: ['pierce'],
    rarity: 'rare',
    hasEvolution: true,
    evo: {
      kind: 'shell', color: 0x9b3fd6, accent: 0xff6ee0,
      scale: 1.9, trail: 4, shake: true, hitParticles: 28,
      name: '黑色凝视',
    },
  },
  dragonclaw: {
    id: 'dragonclaw', name: '龙之爪', pokeId: 149, type: '龙', category: 'melee', style: 'fist',
    color: 0x6a4fd0, baseDamage: 11, cooldown: 1320, range: 90,
    desc: '身前横扫近战',
    traits: ['sweep'],
    rarity: 'epic',
    hasEvolution: true,
    evo: {
      kind: 'slash', color: 0x8f6bff, accent: 0xffd0ff,
      scale: 1.6, trail: 3, shake: true, hitParticles: 24,
      name: '龙星群',
    },
  },
  aurasphere: {
    id: 'aurasphere', name: '波导弹', pokeId: 448, type: '格斗', category: 'projectile',
    color: 0x40b0d0, baseDamage: 27, cooldown: 1280, projectileSpeed: 420, pierce: 1,
    desc: '追踪波导弹',
    traits: ['homing', 'pierce'],
    rarity: 'epic',
    hasEvolution: true,
    evo: {
      kind: 'shell', color: 0x35d0f0, accent: 0xffffff,
      scale: 1.8, trail: 4, shake: true, hitParticles: 26,
      name: '波导爆发',
    },
  },
  psychic: {
    id: 'psychic', name: '精神强念', pokeId: 282, type: '超能', category: 'aura',
    color: 0xf0609c, baseDamage: 9, cooldown: 1400, range: 120, duration: 300,
    desc: '周围持续超能伤害光环',
    traits: ['nova'],
    rarity: 'rare',
    hasEvolution: true,
    evo: {
      kind: 'ring', color: 0xff6ab8, accent: 0xffd6f0,
      scale: 1.35, hitParticles: 18,
      name: '精神利刃',
    },
  },
  aquatail: {
    id: 'aquatail', name: '水流尾', pokeId: 130, type: '水', category: 'melee',
    color: 0x4592e0, baseDamage: 11, cooldown: 1400, range: 100,
    desc: '大幅扫尾近战',
    traits: ['sweep', 'pierce'],
    rarity: 'epic',
    hasEvolution: true,
    evo: {
      kind: 'slash', color: 0x2f8fff, accent: 0xd0f4ff,
      scale: 1.75, trail: 4, shake: true, hitParticles: 26,
      name: '破坏光线',
    },
  },
  rockslide: {
    id: 'rockslide', name: '岩崩', pokeId: 248, type: '岩石', category: 'aoe',
    color: 0xb8a038, baseDamage: 14, cooldown: 2100, range: 140, duration: 300,
    desc: '落石范围爆发',
    traits: ['slam'],
    rarity: 'epic',
    hasEvolution: true,
    evo: {
      kind: 'burst', color: 0xd8bc40, accent: 0xfff0b0,
      scale: 1.5, shake: true, hitParticles: 30,
      name: '岩崩乱舞',
    },
  },
  thunderpunch: {
    id: 'thunderpunch', name: '雷光拳', pokeId: 466, type: '电', category: 'melee', style: 'lightning',
    color: 0xf7d02c, baseDamage: 10, cooldown: 1220, range: 80,
    desc: '快速电拳',
    traits: ['flurry'],
    rarity: 'common',
  },
  flareblitz: {
    id: 'flareblitz', name: '闪焰冲锋', pokeId: 78, type: '火', category: 'melee', style: 'fireball',
    color: 0xf0703c, baseDamage: 11, cooldown: 1500, range: 95,
    desc: '冲锋火焰近战',
    traits: ['sweep'],
    rarity: 'common',
  },
  earthquake: {
    id: 'earthquake', name: '地震', pokeId: 28, type: '地面', category: 'aoe',
    color: 0xd0a848, baseDamage: 15, cooldown: 2400, range: 160, duration: 350,
    desc: '大范围地面爆破',
    traits: ['shockwave', 'nova'],
    rarity: 'common',
  },
  firespin: {
    id: 'firespin', name: '火焰旋涡', pokeId: 38, type: '火', category: 'aura',
    color: 0xf0904c, baseDamage: 7, cooldown: 1400, range: 110, duration: 300,
    desc: '火焰光环持续灼烧',
    traits: ['nova'],
    rarity: 'common',
  },
  ironhead: {
    id: 'ironhead', name: '铁头', pokeId: 208, type: '钢', category: 'melee', style: 'fist',
    color: 0x9aa8b8, baseDamage: 10, cooldown: 1300, range: 85,
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
    color: 0xa040a0, baseDamage: 26, cooldown: 1260, projectileSpeed: 340, pierce: 1,
    desc: '投掷污泥弹',
    traits: ['slam'],
    rarity: 'common',
  },
  blazekick: {
    id: 'blazekick', name: '火焰踢', pokeId: 257, type: '火', category: 'melee', style: 'fist',
    color: 0xf0703c, baseDamage: 10, cooldown: 1350, range: 90,
    desc: '火焰飞踢',
    traits: ['sweep'],
    rarity: 'common',
  },
  mudslap: {
    id: 'mudslap', name: '泥巴射击', pokeId: 260, type: '地面', category: 'projectile',
    color: 0xc0a070, baseDamage: 24, cooldown: 1160, projectileSpeed: 440, pierce: 1,
    desc: '快速双发泥浆',
    traits: ['spread'],
    rarity: 'common',
  },
  leafblade: {
    id: 'leafblade', name: '叶刃', pokeId: 254, type: '草', category: 'melee',
    color: 0x63c256, baseDamage: 10, cooldown: 1350, range: 100,
    desc: '利刃横扫',
    traits: ['sweep', 'pierce'],
    rarity: 'common',
  },
  confusion: {
    id: 'confusion', name: '念力', pokeId: 65, type: '超能', category: 'projectile',
    color: 0xe060a0, baseDamage: 25, cooldown: 1200, projectileSpeed: 400, pierce: 1,
    desc: '高穿透念力波',
    traits: ['pierce', 'chain'],
    rarity: 'common',
  },
  cometpunch: {
    id: 'cometpunch', name: '连续拳', pokeId: 115, type: '一般', category: 'melee', style: 'fist',
    color: 0xd0b090, baseDamage: 8, cooldown: 1050, range: 70,
    desc: '超快三段拳',
    traits: ['flurry', 'spread'],
    rarity: 'common',
  },
  dragonrush: {
    id: 'dragonrush', name: '龙之俯冲', pokeId: 445, type: '龙', category: 'projectile',
    color: 0x6a4fd0, baseDamage: 28, cooldown: 1350, projectileSpeed: 500, pierce: 1,
    desc: '高速穿透冲击',
    traits: ['chain'],
    rarity: 'epic',
  },
};

export const MOVE_LIST = Object.values(MOVES);