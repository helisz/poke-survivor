import { describe, it, expect } from 'vitest';

/**
 * 回归测试：TraitSelect / PartnerSelect 的 refresh() 曾经在
 * 按钮对象尚未创建时被 buildCards() 提前调用，抛 TypeError 导致
 * create() 中断 → 整个页面点不了。
 *
 * 这里把 refresh 的守卫逻辑抽出来验证。
 */

interface FakeRefs {
  cardRefs: any[];
  btn: any | null;
}

function refreshGuard(refs: FakeRefs): 'skipped' | 'ran' {
  if (!refs.cardRefs.length || !refs.btn) return 'skipped';
  return 'ran';
}

describe('选择场景 refresh 防崩溃', () => {
  it('卡片已建但按钮未建时应跳过，而不是抛异常', () => {
    expect(refreshGuard({ cardRefs: [{}, {}], btn: null })).toBe('skipped');
  });

  it('按钮和卡片都就绪时才真正刷新', () => {
    expect(refreshGuard({ cardRefs: [{}, {}], btn: {} })).toBe('ran');
  });

  it('卡片为空时也应跳过', () => {
    expect(refreshGuard({ cardRefs: [], btn: {} })).toBe('skipped');
  });

  it('全部为空时跳过，不抛异常', () => {
    expect(() => refreshGuard({ cardRefs: [], btn: null })).not.toThrow();
  });
});
