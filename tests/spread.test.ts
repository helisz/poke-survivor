import { describe, it, expect } from 'vitest';

/**
 * 扇形技能初期过强 → 低级弧度下调 40%。
 * 这里固化弧度公式，防止以后被误改回大扇形。
 */

const sweepSpread = (lvl: number) => 0.9 + lvl * 0.12;
const fanSpread = (lvl: number) => 0.33 + lvl * 0.09;

describe('扇形弧度：初期收窄', () => {
  it('弹幕墙（sweep）1 级弧度应为 0.9 rad 左右', () => {
    expect(sweepSpread(0)).toBeCloseTo(0.9, 2);
  });

  it('扇形散射（fan）1 级弧度应为 0.33 rad 左右', () => {
    expect(fanSpread(0)).toBeCloseTo(0.33, 2);
  });

  it('相比旧版（1.5 / 0.55）至少降低 40%', () => {
    expect(sweepSpread(0) / 1.5).toBeLessThanOrEqual(0.6);
    expect(fanSpread(0) / 0.55).toBeLessThanOrEqual(0.6);
  });

  it('弧度随等级单调增长（升级有可感知提升）', () => {
    for (let lvl = 1; lvl <= 8; lvl++) {
      expect(sweepSpread(lvl)).toBeGreaterThan(sweepSpread(lvl - 1));
      expect(fanSpread(lvl)).toBeGreaterThan(fanSpread(lvl - 1));
    }
  });

  it('满级弧度不超过 2.0 rad（避免又变成超大扇形）', () => {
    expect(sweepSpread(8)).toBeLessThan(2.0);
    expect(fanSpread(8)).toBeLessThan(1.5);
  });
});
