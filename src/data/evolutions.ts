/**
 * 进化系统
 *
 * 设计要点（见策划案 §4.4）：
 * - 进化是「招式宝可梦」的形态升级，不占招式槽
 * - 三选一满足任一条件即可触发（存活时长 / 等级 / 持有该宝可梦专属招式）
 * - 支持二段进化，一局最多进化 2 次
 * - 进化后：换精灵图、基础数值提升、原有招式强化、解锁专属技
 *
 * 条件类型：
 *   time  —— 本局存活秒数
 *   level —— 玩家等级
 *   owned —— 持有该宝可梦的专属招式
 * 任一满足即可（策划案：三选一）。
 */

export type EvolveCond =
  | { kind: 'time'; value: number }
  | { kind: 'level'; value: number }
  | { kind: 'moveLevel'; value: number }
  | { kind: 'owned' }
  | { kind: 'any'; conds: EvolveCond[] };

/** 招式升到多少级也能触发进化（取代纯看玩家等级） */
export const MOVE_LEVEL_EVOLVE_AT = 8;

export interface EvolutionDef {
  /** 进化后的图鉴 ID（决定换哪张精灵图） */
  toId: number;
  /** 进化后名字 */
  name: string;
  /** 触发条件（全部满足；可空） */
  require?: EvolveCond[];
  /** 任意一个满足即可（与 require 同时生效时两者都需满足） */
  requireOneOf?: EvolveCond[];
  /** 进化后该招式的伤害倍率 */
  dmgMul: number;
  /** 进化后冷却倍率（<1 更快） */
  cdMul: number;
  /** 解锁的视觉描述 */
  note: string;
}

/**
 * 进化表：key = 招式 id（即该宝可梦），value = 两段进化
 * 只给有明确进化关系、且素材库里有的做；其余保持原样。
 */
export const EVOLUTIONS: Record<string, EvolutionDef[]> = {
  // 电系：皮卡丘 → 雷丘
  thunderbolt: [
    {
      toId: 26, name: '雷丘',
      requireOneOf: [{ kind: 'level', value: 18 }, { kind: 'time', value: 150 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.65, cdMul: 0.82,
      note: '十万伏特 → 高压电击：伤害 +65%，冷却 -18%，附带感电',
    },
  ],
  // 火系：喷火龙二段（火恐龙、喷火龙已成，这里做终极形态）
  flamethrower: [
    {
      toId: 146, name: '火焰鸟',
      requireOneOf: [{ kind: 'level', value: 24 }, { kind: 'time', value: 210 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.6, cdMul: 0.86,
      note: '喷射火焰 → 圣火：伤害 +60%，冷却 -14%，穿透 +1',
    },
  ],
  // 水系：水箭龟 → 水箭龟（究极）没有更高形态，用巨型化：巨型水箭龟无素材 → 做超坏星
  watergun: [
    {
      toId: 160, name: '大力鳄',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.6, cdMul: 0.86,
      note: '水枪 → 激流炮：伤害 +60%，冷却 -14%，弹数 +1',
    },
  ],
  // 草系：妙蛙花 → 蜥蜴王（素材有限，用成年形态）
  razorleaf: [
    {
      toId: 154, name: '大竺葵',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.6, cdMul: 0.86,
      note: '飞叶快刀 → 叶风暴：伤害 +60%，冷却 -14%，穿透 +2',
    },
  ],
  // 幽灵：耿鬼 → 耿鬼（究极）无更高素材，做黑化强化：梦妖魔
  shadowball: [
    {
      toId: 429, name: '梦妖魔',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.65, cdMul: 0.85,
      note: '暗影球 → 黑色凝视：伤害 +65%，冷却 -15%，命中回复少量生命',
    },
  ],
  // 龙：快龙 → 快龙（究极）无素材，做烈咬陆鲨方向
  dragonclaw: [
    {
      toId: 373, name: '暴飞龙',
      requireOneOf: [{ kind: 'level', value: 24 }, { kind: 'time', value: 210 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.65, cdMul: 0.82,
      note: '龙之爪 → 龙星群：伤害 +65%，冷却 -18%',
    },
  ],
  // 格斗：路卡利欧 → 路卡利欧（究极）无素材，做师傅鼬
  aurasphere: [
    {
      toId: 448, name: 'Mega 路卡利欧',
      requireOneOf: [{ kind: 'level', value: 26 }, { kind: 'time', value: 230 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.75, cdMul: 0.78,
      note: '波导弹 → 波导爆发：伤害 +75%，冷却 -22%，穿透 +2',
    },
  ],
  // 超能：沙奈朵 → 沙奈朵（究极）无素材，做艾路雷朵
  psychic: [
    {
      toId: 475, name: '艾路雷朵',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.6, cdMul: 0.82,
      note: '精神强念 → 精神利刃：伤害 +60%，冷却 -18%，光环范围扩大',
    },
  ],
  // 岩石：班基拉斯 → 班基拉斯（究极）无素材，做化石翼龙
  rockslide: [
    {
      toId: 142, name: '化石翼龙',
      requireOneOf: [{ kind: 'level', value: 24 }, { kind: 'time', value: 210 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.7, cdMul: 0.86,
      note: '岩崩 → 岩崩乱舞：伤害 +70%，冷却 -14%，落石数 +2',
    },
  ],
  // 水/龙：暴鲤龙 → Mega 暴鲤龙
  aquatail: [
    {
      toId: 130, name: 'Mega 暴鲤龙',
      requireOneOf: [{ kind: 'level', value: 26 }, { kind: 'time', value: 230 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.75, cdMul: 0.82,
      note: '水流尾 → 破坏光线：伤害 +75%，冷却 -18%',
    },
  ],
  // ── 自身觉醒（不新增图鉴 id）─────────────────────────────────
  // 初代 151 个位置已被「24 伙伴 + 8 进化目标 + 6 BOSS + 20 精英 + 108 小怪」
  // 正好占满，没有空位再挂新的进化形态。这些伙伴于是走 448 路卡利欧 /
  // 130 暴鲤龙 同款做法：进化形态就是自己，名字标「觉醒形态」，靠倍率成长。

  // 一般：卡比兽 → 觉醒（重压型，AOE 双给）
  bodyslam: [
    {
      toId: 143, name: '卡比兽 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.55, cdMul: 0.88,
      note: '泰山压顶 → 超重压：伤害 +55%，冷却 -12%，范围扩大',
    },
  ],
  // 电：电击魔兽 → 觉醒（近战高频，偏冷却）
  thunderpunch: [
    {
      toId: 466, name: '电击魔兽 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.45, cdMul: 0.80,
      note: '雷光拳 → 狂雷电拳：伤害 +45%，冷却 -20%',
    },
  ],
  // 火：烈焰马 → 觉醒（冲锋近战，偏伤害）
  flareblitz: [
    {
      toId: 78, name: '烈焰马 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.60, cdMul: 0.88,
      note: '闪焰冲锋 → 烈焰突进：伤害 +60%，冷却 -12%',
    },
  ],
  // 地面：穿山王 → 觉醒（大 AOE，双给）
  earthquake: [
    {
      toId: 28, name: '穿山王 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 24 }, { kind: 'time', value: 210 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.60, cdMul: 0.88,
      note: '地震 → 地裂：伤害 +60%，冷却 -12%，爆破范围扩大',
    },
  ],
  // 火：九尾 → 觉醒（光环持续，偏冷却）
  firespin: [
    {
      toId: 38, name: '九尾 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.50, cdMul: 0.85,
      note: '火焰旋涡 → 炼狱之环：伤害 +50%，冷却 -15%',
    },
  ],
  // 钢：大钢蛇 → 觉醒（近战横扫，偏伤害）
  ironhead: [
    {
      toId: 208, name: '大钢蛇 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.55, cdMul: 0.90,
      note: '铁头 → 钢牙铁壁：伤害 +55%，冷却 -10%',
    },
  ],
  // 超能：太阳伊布 → 觉醒（治疗招式，伤害无意义 → 纯冷却，回得更勤）
  morningsun: [
    {
      toId: 196, name: '太阳伊布 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 18 }, { kind: 'time', value: 150 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.00, cdMul: 0.72,
      note: '晨光 → 大晴空：冷却 -28%，治疗频率大幅提升',
    },
  ],
  // 毒：尼多王 → 觉醒（投掷，偏伤害）
  sludgebomb: [
    {
      toId: 34, name: '尼多王 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.60, cdMul: 0.90,
      note: '污泥炸弹 → 剧毒爆弹：伤害 +60%，冷却 -10%',
    },
  ],
  // 火：火焰鸡 → 觉醒（近战，双给）
  blazekick: [
    {
      toId: 257, name: '火焰鸡 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.55, cdMul: 0.86,
      note: '火焰踢 → 烈焰连踢：伤害 +55%，冷却 -14%',
    },
  ],
  // 地面：巨沼怪 → 觉醒（快速投掷，偏伤害）
  mudslap: [
    {
      toId: 260, name: '巨沼怪 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.55, cdMul: 0.90,
      note: '泥巴射击 → 泥沼重击：伤害 +55%，冷却 -10%',
    },
  ],
  // 草：蜥蜴王 → 觉醒（近战穿透，偏伤害）
  leafblade: [
    {
      toId: 254, name: '蜥蜴王 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.60, cdMul: 0.88,
      note: '叶刃 → 圣剑叶刃：伤害 +60%，冷却 -12%',
    },
  ],
  // 超能：胡地 → 觉醒（高穿透，偏伤害）
  confusion: [
    {
      toId: 65, name: '胡地 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 22 }, { kind: 'time', value: 190 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.60, cdMul: 0.88,
      note: '念力 → 超念动力：伤害 +60%，冷却 -12%，穿透 +1',
    },
  ],
  // 一般：袋兽 → 觉醒（超快连拳，强偏冷却）
  cometpunch: [
    {
      toId: 115, name: '袋兽 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 170 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.40, cdMul: 0.78,
      note: '连续拳 → 亲子连打：伤害 +40%，冷却 -22%',
    },
  ],
  // 龙：烈咬陆鲨 → 觉醒（高速穿透，偏伤害）
  dragonrush: [
    {
      toId: 445, name: '烈咬陆鲨 · 觉醒形态',
      requireOneOf: [{ kind: 'level', value: 24 }, { kind: 'time', value: 210 }, { kind: 'moveLevel', value: MOVE_LEVEL_EVOLVE_AT }],
      dmgMul: 1.65, cdMul: 0.86,
      note: '龙之俯冲 → 神速龙击：伤害 +65%，冷却 -14%',
    },
  ],
};

/**
 * 多级进化阶梯：每 5 级一阶。
 *
 * 原伦理只有一段（如皮卡丘→雷丘）。要在雷丘之后再进化，就得有下一段数据，
 * 但素材库里没有「雷丘的下一形态」，所以这里做的是**同名强化阶**：
 * 用同一个 toId/name，但伤害倍率继续叠、名字加星号后缀。
 * 视觉上靠技能栏星标区分（1 星→2 星→3 星）。
 */
export interface EvoLadderStep {
  def: EvolutionDef;
  /** 招式等级门槛：第 n 阶要 Lv.(5 * n) */
  moveLevel: number;
}

/** 每阶额外叠加的伤害倍率（第 1 阶用原表数据，之后每阶 +25%） */
const LADDER_STEP_DMG = 1.25;
/** 每阶额外叠加的冷却缩减（之后每阶 ×0.94） */
const LADDER_STEP_CD = 0.94;
/** 最多几阶（对应技能栏最多 3 颗星） */
export const MAX_EVO_STAGE = 3;

/**
 * 取某个招式「当前进化次数 stage」之后的下一次进化。
 * stage = 0 → 原伦理第一段；
 * stage ≥ 1 → 阶梯阶（招式 Lv.5×(stage+1) 解锁）。
 * 返回 null 表示已到顶。
 */
export function evoLadderFor(moveId: string, stage: number): EvoLadderStep | null {
  const chain = EVOLUTIONS[moveId];
  if (!chain || !chain.length) return null;
  if (stage >= MAX_EVO_STAGE) return null;

  if (stage === 0) {
    return { def: chain[0], moveLevel: MOVE_LEVEL_EVOLVE_AT };
  }

  // 第 2 阶起：沿用第一段的形态，倍数继续叠，名字加星
  const base = chain[0];
  const starCount = stage + 1;
  return {
    def: {
      ...base,
      name: `${base.name} ${'★'.repeat(starCount)}`,
      dmgMul: base.dmgMul * Math.pow(LADDER_STEP_DMG, stage),
      cdMul: Math.max(0.45, base.cdMul * Math.pow(LADDER_STEP_CD, stage)),
      note: `${base.note}（第 ${starCount} 阶强化）`,
    },
    moveLevel: 5 * (stage + 1),
  };
}

/** 判断单条条件是否满足 */
export function condMet(
  c: EvolveCond,
  ctx: { elapsed: number; level: number; ownedMove: string; moveLevel?: number },
): boolean {
  switch (c.kind) {
    case 'time': return ctx.elapsed >= c.value;
    case 'level': return ctx.level >= c.value;
    // 招式自身等级：把某一招练到 8 级也能进化，不只靠玩家总等级
    case 'moveLevel': return (ctx.moveLevel ?? 1) >= c.value;
    case 'owned': return true; // 调用方已确认持有
    case 'any': return c.conds.some((x) => condMet(x, ctx));
  }
}

/** 判断某段进化是否满足 */
export function canEvolve(
  def: EvolutionDef,
  ctx: { elapsed: number; level: number; ownedMove: string; moveLevel?: number },
): boolean {
  if (def.require && !def.require.every((c) => condMet(c, ctx))) return false;
  if (def.requireOneOf && !def.requireOneOf.some((c) => condMet(c, ctx))) return false;
  return true;
}

/** 条件描述文案（给 UI 显示） */
export function condText(c: EvolveCond): string {
  switch (c.kind) {
    case 'time': return `存活 ${Math.floor(c.value / 60)}:${String(Math.floor(c.value % 60)).padStart(2, '0')}`;
    case 'level': return `达到 Lv.${c.value}`;
    case 'moveLevel': return `招式练到 Lv.${c.value}`;
    case 'owned': return '持有专属招式';
    case 'any': return c.conds.map(condText).join(' 或 ');
  }
}

/** 整段进化的条件文案 */
export function evolveCondText(def: EvolutionDef): string {
  const parts: string[] = [];
  if (def.require && def.require.length) parts.push(def.require.map(condText).join(' 且 '));
  if (def.requireOneOf && def.requireOneOf.length) parts.push(def.requireOneOf.map(condText).join(' 或 '));
  return parts.join(' 且 ');
}
