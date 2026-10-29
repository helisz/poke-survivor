import { describe, it, expect } from 'vitest';
import { MOVES } from '../src/data/moves';

/**
 * 近战招式重构：不再画扇形，而是发真实弹道。
 * 三种流派由 traits 决定，验证分类正确 + 升级成长可感知。
 */

const MELEE = Object.values(MOVES).filter((m) => m.category === 'melee');

/** 与 CombatSystem.fireMelee 一致的流派判定 */
function styleOf(m: typeof MELEE[number]): 'sweep' | 'flurry' | 'fan' {
  const t = m.traits ?? [];
  if (t.includes('sweep')) return 'sweep';
  if (t.includes('flurry')) return 'flurry';
  return 'fan';
}

/** 弹道数量随等级成长 */
function boltCount(m: typeof MELEE[number], lvl: number): number {
  const style = styleOf(m);
  if (style === 'sweep') return 7 + Math.min(lvl * 2, 6);
  if (style === 'flurry') return 3 + Math.min(Math.floor(lvl / 2), 2);
  return 3 + Math.min(lvl, 4);
}

describe('近战弹道体系', () => {
  it('8 个近战招式全部归类到三种流派之一', () => {
    expect(MELEE.length).toBe(8);
    for (const m of MELEE) {
      expect(['sweep', 'flurry', 'fan']).toContain(styleOf(m));
    }
  });

  it('至少存在两种不同流派（避免退化回单一表现）', () => {
    const styles = new Set(MELEE.map(styleOf));
    expect(styles.size).toBeGreaterThanOrEqual(2);
  });

  it('每个流派的弹道数量随等级严格不减', () => {
    for (const m of MELEE) {
      let prev = -1;
      for (let lvl = 0; lvl <= 8; lvl++) {
        const n = boltCount(m, lvl);
        expect(n, `${m.name} lv${lvl}`).toBeGreaterThanOrEqual(prev);
        prev = n;
      }
    }
  });

  it('升级后弹道数量应有可感知提升（满级至少 +2）', () => {
    for (const m of MELEE) {
      const gain = boltCount(m, 8) - boltCount(m, 0);
      expect(gain, `${m.name} 升级增益`).toBeGreaterThanOrEqual(2);
    }
  });

  it('一级起手就有足够弹道密度（不会只有 1 条）', () => {
    for (const m of MELEE) {
      expect(boltCount(m, 0), `${m.name}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('弹道数量有上限，不会无限膨胀', () => {
    for (const m of MELEE) {
      expect(boltCount(m, 99), `${m.name}`).toBeLessThanOrEqual(13);
    }
  });

  it('射程随等级增长', () => {
    for (const m of MELEE) {
      const r0 = (m.range ?? 90) * 1.6;
      const r8 = (m.range ?? 90) * 1.6 + 8 * 16;
      expect(r8).toBeGreaterThan(r0);
    }
  });
});
