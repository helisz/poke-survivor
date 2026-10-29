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
  | { kind: 'owned' }
  | { kind: 'any'; conds: EvolveCond[] };

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
      requireOneOf: [{ kind: 'level', value: 12 }, { kind: 'time', value: 80 }],
      dmgMul: 1.5, cdMul: 0.85,
      note: '十万伏特 → 高压电击：伤害 +50%，附带感电',
    },
  ],
  // 火系：喷火龙二段（火恐龙、喷火龙已成，这里做终极形态）
  flamethrower: [
    {
      toId: 146, name: '火焰鸟',
      requireOneOf: [{ kind: 'level', value: 18 }, { kind: 'time', value: 140 }],
      dmgMul: 1.4, cdMul: 0.9,
      note: '喷射火焰 → 圣火：范围扩大，穿透 +1',
    },
  ],
  // 水系：水箭龟 → 水箭龟（究极）没有更高形态，用巨型化：巨型水箭龟无素材 → 做超坏星
  watergun: [
    {
      toId: 160, name: '大力鳄',
      requireOneOf: [{ kind: 'level', value: 14 }, { kind: 'time', value: 100 }],
      dmgMul: 1.45, cdMul: 0.88,
      note: '水枪 → 激流炮：弹数 +1',
    },
  ],
  // 草系：妙蛙花 → 蜥蜴王（素材有限，用成年形态）
  razorleaf: [
    {
      toId: 154, name: '大竺葵',
      requireOneOf: [{ kind: 'level', value: 14 }, { kind: 'time', value: 100 }],
      dmgMul: 1.4, cdMul: 0.9,
      note: '飞叶快刀 → 叶风暴：穿透 +2',
    },
  ],
  // 幽灵：耿鬼 → 耿鬼（究极）无更高素材，做黑化强化：梦妖魔
  shadowball: [
    {
      toId: 429, name: '梦妖魔',
      requireOneOf: [{ kind: 'level', value: 16 }, { kind: 'time', value: 120 }],
      dmgMul: 1.5, cdMul: 0.9,
      note: '暗影球 → 黑色凝视：命中回复少量生命',
    },
  ],
  // 龙：快龙 → 快龙（究极）无素材，做烈咬陆鲨方向
  dragonclaw: [
    {
      toId: 373, name: '暴飞龙',
      requireOneOf: [{ kind: 'level', value: 18 }, { kind: 'time', value: 140 }],
      dmgMul: 1.5, cdMul: 0.85,
      note: '龙之爪 → 龙星群：伤害 +50%',
    },
  ],
  // 格斗：路卡利欧 → 路卡利欧（究极）无素材，做师傅鼬
  aurasphere: [
    {
      toId: 448, name: 'Mega 路卡利欧',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 160 }],
      dmgMul: 1.6, cdMul: 0.8,
      note: '波导弹 → 波导爆发：穿透 +2，伤害 +60%',
    },
  ],
  // 超能：沙奈朵 → 沙奈朵（究极）无素材，做艾路雷朵
  psychic: [
    {
      toId: 475, name: '艾路雷朵',
      requireOneOf: [{ kind: 'level', value: 16 }, { kind: 'time', value: 120 }],
      dmgMul: 1.45, cdMul: 0.85,
      note: '精神强念 → 精神利刃：光环范围扩大',
    },
  ],
  // 岩石：班基拉斯 → 班基拉斯（究极）无素材，做化石翼龙
  rockslide: [
    {
      toId: 142, name: '化石翼龙',
      requireOneOf: [{ kind: 'level', value: 18 }, { kind: 'time', value: 140 }],
      dmgMul: 1.55, cdMul: 0.9,
      note: '岩崩 → 岩崩乱舞：落石数 +2',
    },
  ],
  // 水/龙：暴鲤龙 → Mega 暴鲤龙
  aquatail: [
    {
      toId: 130, name: 'Mega 暴鲤龙',
      requireOneOf: [{ kind: 'level', value: 20 }, { kind: 'time', value: 160 }],
      dmgMul: 1.6, cdMul: 0.85,
      note: '水流尾 → 破坏光线：伤害 +60%',
    },
  ],
};

/** 判断单条条件是否满足 */
export function condMet(
  c: EvolveCond,
  ctx: { elapsed: number; level: number; ownedMove: string },
): boolean {
  switch (c.kind) {
    case 'time': return ctx.elapsed >= c.value;
    case 'level': return ctx.level >= c.value;
    case 'owned': return true; // 调用方已确认持有
    case 'any': return c.conds.some((x) => condMet(x, ctx));
  }
}

/** 判断某段进化是否满足 */
export function canEvolve(
  def: EvolutionDef,
  ctx: { elapsed: number; level: number; ownedMove: string },
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
