import { describe, it, expect } from 'vitest';
import { MOVES } from '../src/data/moves';
import { EVOLUTIONS, evoLadderFor, MAX_EVO_STAGE } from '../src/data/evolutions';
import { POKEMON_PLAYABLE, POKEDEX_NAME } from '../src/data/pokedex';

/**
 * 回归测试：某只伙伴抽到后永远不进化。
 *
 * 根因：EVOLUTIONS 只给一部分招式写了进化段，剩下 14 只伙伴（卡比兽、
 * 电击魔兽等）没有任何进化条目，玩家抽到它们就少一整套成长体验。
 * 初代 151 个图鉴位置已被池子占满，不能新增形态，所以这些伙伴走
 * 「自身觉醒形态」的路子（同 448 路卡利欧 / 130 暴鲤龙）。
 *
 * 这里锁死：每一条招式都必须有进化段。
 */

const moveKeys = Object.keys(MOVES);

describe('每只伙伴都能进化', () => {
  it('MOVES 的每一条都有 EVOLUTIONS 条目', () => {
    const missing = moveKeys.filter((k) => !EVOLUTIONS[k]?.length);
    expect(missing, `这些招式没有进化段：${missing.join(', ')}`).toEqual([]);
  });

  it('可玩池 24 只全部能查到进化', () => {
    const out: string[] = [];
    for (const p of POKEMON_PLAYABLE) {
      if (!EVOLUTIONS[p.move as string]?.length) out.push(`${p.id} ${p.name}`);
    }
    expect(out, `没有进化的伙伴：${out.join('、')}`).toEqual([]);
  });

  it('进化段都能生成完整阶梯（3 阶）', () => {
    for (const key of moveKeys) {
      for (let stage = 0; stage < MAX_EVO_STAGE; stage++) {
        const step = evoLadderFor(key, stage);
        expect(step, `${key} 第 ${stage} 阶缺失`).not.toBeNull();
        expect(step!.def.name.length, `${key} 第 ${stage} 阶没名字`).toBeGreaterThan(0);
      }
      expect(evoLadderFor(key, MAX_EVO_STAGE), `${key} 应已到顶`).toBeNull();
    }
  });

  it('进化后名字一定能在图鉴里查到那个 id', () => {
    for (const key of moveKeys) {
      const def = EVOLUTIONS[key][0];
      expect(POKEDEX_NAME[def.toId], `${key} 进化目标 ${def.toId} 不在图鉴里`).toBeTruthy();
    }
  });

  it('自身觉醒形态的 toId 等于本体 id（不新增图鉴编号）', () => {
    // 这 14 只是在初代 151 占满后走觉醒路子的，toId 必须回到自身
    const selfEvo = [
      'bodyslam', 'thunderpunch', 'flareblitz', 'earthquake', 'firespin',
      'ironhead', 'morningsun', 'sludgebomb', 'blazekick', 'mudslap',
      'leafblade', 'confusion', 'cometpunch', 'dragonrush',
    ];
    for (const key of selfEvo) {
      const def = EVOLUTIONS[key][0];
      const move = MOVES[key];
      expect(def.toId, `${key} 应为自身觉醒`).toBe(move.pokeId);
      expect(def.name).toContain('觉醒形态');
    }
  });

  it('伤害倍率不低于 1，冷却倍率不大于 1', () => {
    for (const key of moveKeys) {
      const def = EVOLUTIONS[key][0];
      expect(def.dmgMul, `${key} dmgMul 应为正增益`).toBeGreaterThanOrEqual(1);
      expect(def.cdMul, `${key} cdMul 应为正增益`).toBeLessThanOrEqual(1);
      expect(def.cdMul, `${key} cdMul 不应快得离谱`).toBeGreaterThan(0.5);
    }
  });

  it('治疗类招式不靠伤害倍率成长', () => {
    // 晨光 baseDamage 为 0，加伤害毫无意义，只能靠冷却
    const def = EVOLUTIONS.morningsun[0];
    expect(def.dmgMul).toBe(1);
    expect(def.cdMul).toBeLessThan(1);
  });
});

/**
 * 回归测试：进化不能靠「熬时间」白送。
 *
 * 曾经每条进化都带 `{ kind: 'time', value: N }`，写成 requireOneOf 的候选之一，
 * 于是玩家什么都不用做，存活满 N 秒进化就自动送上门 —— 把「练招式」这个
 * 唯一真正的成长目标架空了。现在 time 条件已从类型层面移除，这里锁死它不会回来。
 */
describe('进化不认存活时长', () => {
  const collectConds = (def: (typeof EVOLUTIONS)[string][number]): unknown[] => [
    ...(def.require ?? []),
    ...(def.requireOneOf ?? []),
  ];

  it('没有任何一条进化带 time 条件', () => {
    const offenders: string[] = [];
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      for (const def of chain) {
        for (const c of collectConds(def)) {
          if ((c as { kind?: string }).kind === 'time') offenders.push(`${moveId} -> ${def.name}`);
        }
      }
    }
    expect(offenders, `这些进化还在用存活时长触发：${offenders.join(', ')}`).toEqual([]);
  });

  it('进化条件只允许 level / moveLevel / owned / any', () => {
    const allowed = new Set(['level', 'moveLevel', 'owned', 'any']);
    const bad: string[] = [];
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      for (const def of chain) {
        for (const c of collectConds(def)) {
          const kind = (c as { kind?: string }).kind ?? '';
          if (!allowed.has(kind)) bad.push(`${moveId}: ${kind}`);
        }
      }
    }
    expect(bad, `出现了不允许的条件类型：${bad.join(', ')}`).toEqual([]);
  });
});
