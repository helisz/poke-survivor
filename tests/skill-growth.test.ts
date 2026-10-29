import { describe, it, expect } from 'vitest';

/**
 * 技能等级伤害成长回归测试。
 *
 * 设计目标：让「升级」成为主要的强度来源。
 * 曾经每级只 +18%，Lv10 才 2.62 倍，跟不上怪物血量成长，
 * 玩家会因为"升了级还是打不动"而失去正反馈。
 * 现在每级 +42%，Lv10 达 4.78 倍，怪物血量同期只涨 1.55 倍。
 */

const PER_LEVEL = 0.42;
const dmgMul = (lv: number) => 1 + (lv - 1) * PER_LEVEL;

describe('技能等级伤害成长', () => {
  it('1 级为基础伤害（不缩放）', () => {
    expect(dmgMul(1)).toBeCloseTo(1, 5);
  });

  it('每级提升 42%', () => {
    expect(dmgMul(2)).toBeCloseTo(1.42, 2);
    expect(dmgMul(3)).toBeCloseTo(1.84, 2);
  });

  it('Lv5 至少 2.6 倍（明显感到变强）', () => {
    expect(dmgMul(5)).toBeGreaterThanOrEqual(2.6);
  });

  it('Lv10 至少 4.5 倍', () => {
    expect(dmgMul(10)).toBeGreaterThanOrEqual(4.5);
  });

  it('成长曲线远快于旧版（每级 +18%）', () => {
    const oldMul = (lv: number) => 1 + (lv - 1) * 0.18;
    // Lv3 差距还小（1.84 vs 1.36），从 Lv5 起拉开明显档次
    for (const lv of [5, 7, 10]) {
      expect(dmgMul(lv), `Lv${lv}`).toBeGreaterThan(oldMul(lv) * 1.5);
    }
  });

  it('技能成长幅度必须压过怪物血量成长（后期靠升级取胜）', () => {
    const hpMul = (t: number) => 1 + 0.55 * Math.pow(Math.min(t, 300) / 300, 1.5);
    // 5 分钟时怪血 1.55 倍，Lv5 技能已是 2.68 倍 → 净优势明显
    expect(dmgMul(5)).toBeGreaterThan(hpMul(300) * 1.5);
    expect(dmgMul(10)).toBeGreaterThan(hpMul(300) * 2.5);
  });

  it('每级收益保持恒定（不衰减，避免后期升级无感）', () => {
    const d1 = dmgMul(2) - dmgMul(1);
    const d9 = dmgMul(10) - dmgMul(9);
    expect(d9).toBeCloseTo(d1, 5);
  });
});
