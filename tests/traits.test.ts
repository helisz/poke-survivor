import { describe, it, expect } from 'vitest';
import { TRAITS } from '../src/data/stats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 开局特性：数值保守、必须有图标。
 * 原则——「有一点用就行，不要太大」。
 */

const player = readFileSync(resolve(__dirname, '../src/objects/Player.ts'), 'utf8');

describe('特性数值保守', () => {
  it('每个特性都有图标字段', () => {
    for (const t of TRAITS) {
      expect((t as { icon?: string }).icon, `${t.name} 缺图标`).toBeTruthy();
    }
  });

  it('特性共 9 个，用于 9 选 3', () => {
    expect(TRAITS.length).toBe(9);
  });

  it('百分比类增益不超过 25%', () => {
    for (const t of TRAITS) {
      const pcts = [...t.desc.matchAll(/\+(\d+)%/g)].map((m) => Number(m[1]));
      for (const p of pcts) {
        if (t.id === 'magnet') continue; // 拾取范围可稍大
        expect(p, `${t.name} 增益 ${p}% 过大`).toBeLessThanOrEqual(18);
      }
    }
  });

  it('减伤类不超过 10%', () => {
    for (const t of TRAITS) {
      const m = t.desc.match(/受伤 -(\d+)%/);
      if (m) expect(Number(m[1]), `${t.name} 减伤过大`).toBeLessThanOrEqual(10);
    }
  });

  it('数值与 Player 实际应用一致（防止描述和代码脱节）', () => {
    // 抽查关键项：描述里写的百分比必须能在 applyTrait 里找到对应系数
    const pairs: [string, string][] = [
      ['移速 +6%', 'speed *= 1.06'],
      ['伤害 +5%', 'damageMul *= 1.05'],
      ['经验 +8%', 'expMul *= 1.08'],
      ['招式冷却 -4%', 'cooldownMul *= 0.96'],
    ];
    for (const [desc, code] of pairs) {
      expect(TRAITS.some((t) => t.desc === desc), `缺少描述「${desc}」`).toBe(true);
      expect(player.replace(/\s+/g, ' '), `Player 缺 ${code}`).toContain(code);
    }
  });

  it('不再保留旧版激进数值', () => {
    expect(player).not.toContain('speed *= 1.15');
    expect(player).not.toContain('damageMul *= 1.18');
    expect(player).not.toContain('expMul *= 1.3');
    expect(player).not.toContain('pickup *= 1.8');
  });

  it('单特性总收益不超过 30%（多维加和）', () => {
    for (const t of TRAITS) {
      const pcts = [...t.desc.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
      const sum = pcts.reduce((a, b) => a + b, 0);
      expect(sum, `${t.name} 总收益 ${sum}%`).toBeLessThanOrEqual(30);
    }
  });
});
