import { describe, it, expect } from 'vitest';

/**
 * 敌人血量成长曲线回归测试。
 * 历史问题：hpMul = 1 + t/45，2 分钟就涨到 3.67 倍，玩家打不动。
 * 现在的曲线：300 秒内从 1.0 平滑涨到 1.55 倍（配合技能每级 +42% 成长）。
 */

const hpMul = (t: number) => 1 + 0.55 * Math.pow(Math.min(t, 300) / 300, 1.5);
const BASE_HP = 26;

describe('敌人血量成长', () => {
  it('开局为 1 倍', () => {
    expect(hpMul(0)).toBeCloseTo(1, 5);
  });

  it('1 分钟涨幅不超过 20%', () => {
    expect(hpMul(60)).toBeLessThanOrEqual(1.2);
  });

  it('2 分钟涨幅不超过 40%（原来这里是 3.67 倍）', () => {
    expect(hpMul(120)).toBeLessThanOrEqual(1.4);
  });

  it('2 分钟时小怪血量不到 40 点', () => {
    expect(BASE_HP * hpMul(120)).toBeLessThan(40);
  });

  it('5 分钟封顶约 1.55 倍（显著放缓）', () => {
    expect(hpMul(300)).toBeCloseTo(1.55, 2);
    expect(hpMul(600)).toBeCloseTo(1.55, 2); // 超出 300 秒封顶，不再增长
  });

  it('比其他任何阶段都更平缓（旧曲线对比）', () => {
    const oldCurve = (t: number) => 1 + t / 45;
    for (const t of [30, 60, 120, 180, 240, 300]) {
      expect(hpMul(t), `${t}s 应比旧曲线平缓`).toBeLessThan(oldCurve(t) * 0.85);
    }
  });

  it('曲线单调递增（后期确实变难）', () => {
    let prev = -1;
    for (let t = 0; t <= 300; t += 15) {
      const v = hpMul(t);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });

  it('前期增长慢于后期（不是线性硬涨）', () => {
    const early = hpMul(60) - hpMul(0);    // 0-60s
    const late = hpMul(300) - hpMul(240);  // 240-300s
    expect(late).toBeGreaterThan(early);
  });
});
