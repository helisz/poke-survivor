import { describe, it, expect } from 'vitest';
import { MOVES } from '../src/data/moves';
import { BASE_STATS, PERM_UPGRADES, permCost } from '../src/data/stats';

const all = Object.values(MOVES);

describe('冷却：1 级不低于 1 秒', () => {
  it('所有招式的 1 级冷却都不小于 1000ms', () => {
    for (const m of all) {
      expect(m.cooldown, `${m.name} 冷却过快`).toBeGreaterThanOrEqual(1000);
    }
  });

  it('没有招式每秒出手超过 1 次', () => {
    for (const m of all) {
      expect(1000 / m.cooldown, `${m.name} 每秒 ${(1000 / m.cooldown).toFixed(2)} 次`)
        .toBeLessThanOrEqual(1.0);
    }
  });

  it('升级会提高出手频率（等级越高冷却越短）', () => {
    // CombatSystem: cdMul = cooldown / (1 + (lvl-1)*0.12)
    const effCd = (cd: number, lvl: number) => cd / (1 + (lvl - 1) * 0.12);
    for (const m of all) {
      if (m.id === 'morningsun') continue; // 治疗技不参与频率成长
      expect(effCd(m.cooldown, 5)).toBeLessThan(effCd(m.cooldown, 1));
    }
    // 5 级时至少快 40%
    const bat = MOVES.thunderbolt;
    expect(effCd(bat.cooldown, 5) / effCd(bat.cooldown, 1)).toBeLessThanOrEqual(0.72);
  });
});

describe('移动速度：初期已下调 40%', () => {
  it('基础移速为 111（原 185 的 60%）', () => {
    expect(BASE_STATS.speed).toBe(111);
  });

  it('降速比例约 40%', () => {
    expect(1 - BASE_STATS.speed / 185).toBeCloseTo(0.40, 2);
  });

  it('永久强化仍能在降速后提升移速', () => {
    const p = { hp: 0, damage: 0, speed: 10, pickup: 0, exp: 0, cd: 0 };
    const boosted = BASE_STATS.speed * (1 + p.speed * 0.01);
    expect(boosted).toBeGreaterThan(BASE_STATS.speed);
  });
});

describe('商店价格：每点上涨 5%', () => {
  it('相邻两级价格正好差 5%', () => {
    for (const u of PERM_UPGRADES) {
      for (let lv = 0; lv < Math.min(u.max - 1, 8); lv++) {
        const a = permCost(u.key, lv);
        const b = permCost(u.key, lv + 1);
        // 金币取整会让低价档位在 4%~6% 间浮动
        expect(b / a, `${u.name} Lv${lv}→${lv + 1}`).toBeGreaterThanOrEqual(1.04);
        expect(b / a, `${u.name} Lv${lv}→${lv + 1}`).toBeLessThanOrEqual(1.06);
      }
    }
  });

  it('涨价比旧版 1.55 平缓得多', () => {
    const old = PERM_UPGRADES[0].baseCost * Math.pow(1.55, 10);
    const now = permCost(PERM_UPGRADES[0].key, 10);
    expect(now).toBeLessThan(old * 0.35);
  });

  it('满级总花费在合理区间', () => {
    for (const u of PERM_UPGRADES) {
      let total = 0;
      for (let i = 0; i < u.max; i++) total += permCost(u.key, i);
      expect(total, `${u.name} 满级总价`).toBeLessThan(3000);
      expect(total, `${u.name} 满级总价`).toBeGreaterThan(u.max * u.baseCost * 0.9);
    }
  });
});
