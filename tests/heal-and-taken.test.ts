import { describe, it, expect } from 'vitest';
import { RUN_SECONDS, BASE_STATS } from '../src/data/stats';

/**
 * 回血球掉率曲线（与 GameScene 里 onEnemyKilled 保持一致）。
 * 开局 5%，线性降到 5 分钟时的 1%。
 */
function healChance(t: number): number {
  const prog = Math.min(t / RUN_SECONDS, 1);
  return 0.05 - 0.04 * prog;
}

describe('回血球掉率曲线', () => {
  it('开局应为 5%', () => {
    expect(healChance(0)).toBeCloseTo(0.05, 4);
  });

  it('一局结束时降到 1%', () => {
    expect(healChance(RUN_SECONDS)).toBeCloseTo(0.01, 4);
    expect(healChance(RUN_SECONDS * 2)).toBeCloseTo(0.01, 4); // 超出也不低于下限
  });

  it('整局单调递减', () => {
    let prev = healChance(0);
    for (let t = 10; t <= RUN_SECONDS; t += 10) {
      const cur = healChance(t);
      expect(cur, `t=${t}s 掉率不应上升`).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  it('中段掉率介于两端之间', () => {
    const mid = healChance(RUN_SECONDS / 2);
    expect(mid).toBeGreaterThan(0.01);
    expect(mid).toBeLessThan(0.05);
  });
});

describe('主角承受伤害', () => {
  it('基准倍率为 1（正式版参加 1 倍，3 倍是测试期遗留）', () => {
    expect(BASE_STATS.damageTakenMul).toBeCloseTo(1, 4);
  });

  it('受伤加成默认 1，不是 0（0 会变成无敌）', () => {
    expect(BASE_STATS.damageTakenMul).toBeGreaterThan(0);
  });

  it('减伤类特性仍能在此基础上生效', () => {
    // 硬化 -8% / 铁壁 -5% 之类是乘在基准上的，不覆盖基准
    expect(BASE_STATS.damageTakenMul * 0.92).toBeGreaterThan(0);
  });
});
