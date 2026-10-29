import { describe, it, expect } from 'vitest';
import { MOVES } from '../src/data/moves';

/**
 * 伤害层级：单体 > 扇形 > AOE > 光环。
 * 判定依据是「单目标 DPS」，近战的单目标值乘 2（同批多弹道可命中同一目标）。
 */

const dps = (id: string) => {
  const m = MOVES[id];
  return (m.baseDamage * 1000) / m.cooldown;
};

const SINGLE = ['thunderbolt', 'shadowball', 'aurasphere', 'dragonrush', 'sludgebomb',
  'confusion', 'razorleaf', 'mudslap', 'flamethrower', 'watergun'];
const MELEE = ['dragonclaw', 'aquatail', 'thunderpunch', 'leafblade', 'flareblitz',
  'ironhead', 'blazekick', 'cometpunch'];
const AOE = ['earthquake', 'rockslide', 'bodyslam'];
const AURA = ['psychic', 'firespin'];

const avg = (ids: string[]) => ids.reduce((a, id) => a + dps(id), 0) / ids.length;

describe('伤害层级：单体 > 扇形 > AOE > 光环', () => {
  it('单体是所有类别中单目标 DPS 最高的', () => {
    const single = avg(SINGLE);
    expect(single).toBeGreaterThan(avg(MELEE));
    expect(single).toBeGreaterThan(avg(AOE));
    expect(single).toBeGreaterThan(avg(AURA));
  });

  it('扇形去重后（×2 命中）仍低于单体', () => {
    expect(avg(MELEE) * 2).toBeLessThan(avg(SINGLE));
  });

  it('光环是所有类别的下限', () => {
    expect(avg(AURA)).toBeLessThan(avg(AOE));
    expect(avg(AURA)).toBeLessThan(avg(MELEE));
  });

  it('单体 DPS 落在 18-26 区间', () => {
    for (const id of SINGLE) {
      expect(dps(id), `${id}`).toBeGreaterThanOrEqual(18);
      expect(dps(id), `${id}`).toBeLessThanOrEqual(26);
    }
  });

  it('近战每发弹道 DPS 在 7-9（避免叠加后超标）', () => {
    for (const id of MELEE) {
      expect(dps(id), `${id}`).toBeGreaterThanOrEqual(7);
      expect(dps(id), `${id}`).toBeLessThanOrEqual(9);
    }
  });

  it('AOE 单目标 DPS 在 5-7（靠覆盖面取胜）', () => {
    for (const id of AOE) {
      expect(dps(id), `${id}`).toBeGreaterThanOrEqual(5);
      expect(dps(id), `${id}`).toBeLessThanOrEqual(7);
    }
  });

  it('光环单目标 DPS 在 4-7', () => {
    for (const id of AURA) {
      expect(dps(id), `${id}`).toBeGreaterThanOrEqual(4);
      expect(dps(id), `${id}`).toBeLessThanOrEqual(7);
    }
  });

  it('皮卡丘（十万伏特）属于单体第一梯队', () => {
    expect(MOVES.thunderbolt.category).toBe('projectile');
    expect(dps('thunderbolt')).toBeGreaterThanOrEqual(20);
    // 高于近战平均，也高于光环
    expect(dps('thunderbolt')).toBeGreaterThan(avg(MELEE));
    expect(dps('thunderbolt')).toBeGreaterThan(avg(AURA));
  });
});
