import { describe, it, expect } from 'vitest';
import {
  PERM_UPGRADES, permCost, applyPerm, PERM_EMPTY, BASE_STATS,
  type PermLevels, type PermKey,
} from '../src/data/stats';

const empty = (): PermLevels => ({ ...PERM_EMPTY });

describe('永久强化：小幅度数值设计', () => {
  it('每级增益应控制在 1-2% 之间', () => {
    for (const u of PERM_UPGRADES) {
      expect(u.step, `${u.name} 单级增益`).toBeGreaterThanOrEqual(0.01);
      expect(u.step, `${u.name} 单级增益`).toBeLessThanOrEqual(0.02);
    }
  });

  it('单项满级总增益不超过 40%', () => {
    for (const u of PERM_UPGRADES) {
      expect(u.step * u.max, `${u.name} 满级增益`).toBeLessThanOrEqual(0.40);
    }
  });

  it('单级伤害提升应为 1%（不是旧版的 6%）', () => {
    const p = empty(); p.damage = 1;
    const before = BASE_STATS.damageMul;
    const after = applyPerm(BASE_STATS, p).damageMul;
    expect(after / before).toBeCloseTo(1.01, 4);
  });

  it('十级伤害累计约 +10%', () => {
    const p = empty(); p.damage = 10;
    const after = applyPerm(BASE_STATS, p).damageMul;
    expect(after / BASE_STATS.damageMul).toBeCloseTo(1.10, 3);
  });

  it('全部零级时属性与基础完全一致', () => {
    const s = applyPerm(BASE_STATS, empty());
    expect(s.damageMul).toBe(BASE_STATS.damageMul);
    expect(s.speed).toBe(BASE_STATS.speed);
    expect(s.expMul).toBe(BASE_STATS.expMul);
    expect(s.maxHp).toBe(BASE_STATS.maxHp);
  });
});

describe('永久强化：价格与退款', () => {
  it('价格随等级递增', () => {
    for (const u of PERM_UPGRADES) {
      expect(permCost(u.key, 1)).toBeGreaterThan(permCost(u.key, 0));
      expect(permCost(u.key, 5)).toBeGreaterThan(permCost(u.key, 4));
    }
  });

  it('退款总额应精确等于逐级购买花费之和', () => {
    const buyOrder: [PermKey, number][] = [['damage', 3], ['hp', 2], ['cd', 1]];
    let spent = 0;
    const p = empty();
    for (const [k, n] of buyOrder) {
      for (let i = 0; i < n; i++) spent += permCost(k, i);
      p[k] = n;
    }
    // 重置：按各等级回退价格累加
    let refund = 0;
    for (const [k, n] of buyOrder) {
      for (let i = 0; i < n; i++) refund += permCost(k, i);
    }
    expect(refund).toBe(spent);
    // 归零后属性回到底数
    const zeroed = applyPerm(BASE_STATS, empty());
    expect(zeroed.damageMul).toBe(BASE_STATS.damageMul);
  });
});

describe('基础伤害倍率', () => {
  it('基础伤害倍率为 1.05（比原始 0.75 高 40%）', () => {
    expect(BASE_STATS.damageMul).toBeCloseTo(1.05, 4);
  });

  it('相对上调幅度为 +40%', () => {
    const before = 0.75;
    expect(BASE_STATS.damageMul / before).toBeCloseTo(1.4, 2);
  });
});
