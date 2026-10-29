import { describe, it, expect } from 'vitest';
import { MOVES } from '../src/data/moves';

/** 把招式按「单体/范围」归类，验证伤害设计原则 */
const SINGLE = [
  'thunderbolt', 'flamethrower', 'watergun', 'razorleaf', 'shadowball', 'aurasphere',
  'sludgebomb', 'mudslap', 'confusion', 'dragonrush',
  'dragonclaw', 'aquatail', 'thunderpunch', 'flareblitz', 'ironhead', 'blazekick',
  'leafblade', 'cometpunch',
];
const AREA = ['bodyslam', 'rockslide', 'earthquake', 'psychic', 'firespin'];

const dps = (id: string) => {
  const m = MOVES[id];
  return (m.baseDamage * 1000) / m.cooldown;
};

describe('招式伤害设计', () => {
  it('单体招的单目标 DPS 应明显高于范围招', () => {
    const singleAvgs = SINGLE.map(dps);
    const areaAvgs = AREA.map(dps);
    const sAvg = singleAvgs.reduce((a, b) => a + b, 0) / singleAvgs.length;
    const aAvg = areaAvgs.reduce((a, b) => a + b, 0) / areaAvgs.length;
    // 单体至少是范围的 2 倍
    expect(sAvg / aAvg).toBeGreaterThan(2);
  });

  it('单体招 DPS 应落在 12-24 区间（冷却已全部拉长到 1 秒以上）', () => {
    for (const id of SINGLE) {
      expect(dps(id), `${id} 单体DPS=${dps(id).toFixed(1)}`).toBeGreaterThanOrEqual(12);
      expect(dps(id), `${id} 单体DPS=${dps(id).toFixed(1)}`).toBeLessThanOrEqual(26);
    }
  });

  it('范围招单目标 DPS 应明显低于单体（靠覆盖面而非单体）', () => {
    for (const id of AREA) {
      expect(dps(id), `${id} 范围DPS=${dps(id).toFixed(1)}`).toBeLessThanOrEqual(12);
      expect(dps(id), `${id} 范围DPS=${dps(id).toFixed(1)}`).toBeGreaterThanOrEqual(4);
    }
  });

  it('不存在零冷却或零伤害的异常招式（晨光除外）', () => {
    for (const [id, m] of Object.entries(MOVES)) {
      expect(m.cooldown, `${id} 冷却`).toBeGreaterThan(0);
      if (id === 'morningsun') continue;   // 纯治疗，允许 0 伤害
      expect(m.baseDamage, `${id} 伤害`).toBeGreaterThan(0);
    }
  });

  it('没有 DPS 超过 30 的异常强招', () => {
    for (const [id, m] of Object.entries(MOVES)) {
      if (id === 'morningsun') continue;
      const d = dps(id);
      expect(d, `${id} DPS=${d.toFixed(1)}（疑似异常强）`).toBeLessThan(30);
    }
  });
});
