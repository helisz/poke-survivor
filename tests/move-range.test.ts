import { describe, it, expect } from 'vitest';

/**
 * 伙伴攻击范围：1 级 = 视口短边一半，5 级起 = 视口长边，中间线性。
 *
 * 【锁死的原因】射程直接决定远程招式能不能打到人。曾经写成「全屏寻敌 +
 * 1600ms 固定寿命」，结果 1 级招式就能打穿整个屏幕，练满反而没提升空间。
 * 现在射程必须随等级走，且 5 级封顶在长边（再远屏幕外也打不到）。
 */

// 与 CombatSystem.moveRange 同源的纯函数（相机尺寸作为入参，方便测试）
function moveRange(level: number, w: number, h: number): number {
  const shortSide = Math.min(w, h);
  const longSide = Math.max(w, h);
  const lv = Math.max(1, level);
  if (lv <= 1) return shortSide / 2;
  if (lv >= 5) return longSide;
  return shortSide / 2 + (longSide - shortSide / 2) * ((lv - 1) / 4);
}

describe('伙伴攻击范围', () => {
  const W = 1024, H = 506;   // 典型横屏可视区（已除过 zoom）

  it('1 级 = 短边的一半', () => {
    expect(moveRange(1, W, H)).toBe(H / 2);
  });

  it('5 级 = 长边', () => {
    expect(moveRange(5, W, H)).toBe(W);
  });

  it('5 级以后不再增长', () => {
    expect(moveRange(6, W, H)).toBe(W);
    expect(moveRange(12, W, H)).toBe(W);
  });

  it('2~4 级严格递增且落在两端之间', () => {
    const a = moveRange(1, W, H);
    const b = moveRange(2, W, H);
    const c = moveRange(3, W, H);
    const d = moveRange(4, W, H);
    const e = moveRange(5, W, H);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
    expect(e).toBeGreaterThan(d);
  });

  it('竖屏同样成立（短边是宽）', () => {
    expect(moveRange(1, 506, 1024)).toBe(506 / 2);
    expect(moveRange(5, 506, 1024)).toBe(1024);
  });

  it('0 级及负数按 1 级处理', () => {
    expect(moveRange(0, W, H)).toBe(H / 2);
    expect(moveRange(-3, W, H)).toBe(H / 2);
  });
});
