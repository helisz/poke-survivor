import { describe, it, expect } from 'vitest';
import {
  killScore, SCORE_BASE, CLEAR_BONUS, clearBonus,
  timeScoreMul, stageScoreMul, formatScore,
} from '../src/data/score';

describe('记分系统', () => {
  it('怪物类型越小分越高：普通 < 精英 < 小BOSS < 终局BOSS', () => {
    expect(SCORE_BASE.normal).toBeLessThan(SCORE_BASE.elite);
    expect(SCORE_BASE.elite).toBeLessThan(SCORE_BASE.miniboss);
    expect(SCORE_BASE.miniboss).toBeLessThan(SCORE_BASE.finalboss);
  });

  it('时间越往后，同一只怪分越高', () => {
    const early = killScore('normal', 0, 10);
    const mid = killScore('normal', 0, 150);
    const late = killScore('normal', 0, 299);
    expect(mid).toBeGreaterThan(early);
    expect(late).toBeGreaterThan(mid);
  });

  it('时间倍率开局 1.0、满 5 分钟 2.2', () => {
    expect(timeScoreMul(0)).toBeCloseTo(1.0, 5);
    expect(timeScoreMul(300)).toBeCloseTo(2.2, 5);
    // 超出时长不继续增长，避免开发者跳时间把分数刷爆
    expect(timeScoreMul(9999)).toBeCloseTo(2.2, 5);
  });

  it('关卡倍率恒为 1 —— 用户明确要求各关同分', () => {
    for (let s = 0; s < 6; s++) {
      expect(stageScoreMul(s)).toBe(1);
      // 同时间、同类型，各关得分必须完全相等
      expect(killScore('normal', s, 120)).toBe(killScore('normal', 0, 120));
    }
  });

  it('终局 BOSS 单只分远高于普通怪', () => {
    const f = killScore('finalboss', 0, 300);
    const n = killScore('normal', 0, 300);
    expect(f).toBeGreaterThan(n * 100);
  });

  it('通关奖励 = 5000 基础分', () => {
    expect(clearBonus(0)).toBe(CLEAR_BONUS);
    expect(clearBonus(5)).toBe(CLEAR_BONUS);
  });

  it('分数都是整数（逐笔累加与显示一致）', () => {
    for (const kind of ['normal', 'elite', 'miniboss', 'finalboss'] as const) {
      for (const t of [0, 37, 150, 299, 300]) {
        expect(Number.isInteger(killScore(kind, 0, t))).toBe(true);
      }
    }
  });

  it('千分位格式化', () => {
    expect(formatScore(0)).toBe('0');
    expect(formatScore(14869)).toBe('14,869');
  });
});
