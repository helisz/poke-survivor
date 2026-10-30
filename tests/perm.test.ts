import { describe, it, expect } from 'vitest';
import {
  PERM_UPGRADES, PERM_MAX_LEVEL, PERM_COST_MIN, PERM_COST_MAX,
  permCost, permCostAtLevel, permTotal, permStep, applyPerm,
  PERM_EMPTY, BASE_STATS, type PermLevels, type PermKey,
} from '../src/data/stats';

const empty = (): PermLevels => ({ ...PERM_EMPTY });

// 赌神是特殊项：3 级上限、独立价目表，不参与统一百分比曲线
const CRIT_KEYS = ['critRate', 'critDmg'];
// 普通百分比项：走标准 50→30000 价格曲线
const PCT_UPGRADES = PERM_UPGRADES.filter((u) => u.key !== 'gamble' && !CRIT_KEYS.includes(u.key));
// 暴击两项：曲线同形，但价格是普通项的 3 倍
const CRIT_UPGRADES = PERM_UPGRADES.filter((u) => CRIT_KEYS.includes(u.key));

describe('永久强化：等级上限', () => {
  it('八项百分比强化都是 10 级上限', () => {
    for (const u of PCT_UPGRADES) {
      expect(u.max, `${u.name} 上限`).toBe(10);
      expect(u.max).toBe(PERM_MAX_LEVEL);
    }
  });

  it('赌神单独 3 级上限', () => {
    const g = PERM_UPGRADES.find((u) => u.key === 'gamble')!;
    expect(g.max).toBe(3);
    expect(g.name).toBe('赌神');
  });

  it('九项强化都在', () => {
    expect(PERM_UPGRADES.map((u) => u.key).sort())
      .toEqual(['cd', 'critDmg', 'critRate', 'damage', 'exp', 'gamble', 'hp', 'pickup', 'speed']);
  });

  it('暴击两项排在脚力之后', () => {
    const keys = PERM_UPGRADES.map((u) => u.key) as string[];
    expect(keys.indexOf('critRate')).toBe(keys.indexOf('speed') + 1);
    expect(keys.indexOf('critDmg')).toBe(keys.indexOf('speed') + 2);
  });

  it('暴击率满级累计正好 +5%（8% → 13%）', () => {
    expect(permTotal('critRate', 10)).toBeCloseTo(0.05, 6);
    const s = applyPerm(BASE_STATS, { ...PERM_EMPTY, critRate: 10 });
    expect(s.critChance).toBeCloseTo(0.13, 6);
  });

  it('暴击伤害满级累计正好 +25%（1.5x → 1.75x）', () => {
    expect(permTotal('critDmg', 10)).toBeCloseTo(0.25, 6);
    const s = applyPerm(BASE_STATS, { ...PERM_EMPTY, critDmg: 10 });
    expect(s.critMul).toBeCloseTo(1.75, 6);
  });

  it('暴击伤害是加法不是乘法：1 级只涨到 1.5119x 左右', () => {
    const s = applyPerm(BASE_STATS, { ...PERM_EMPTY, critDmg: 1 });
    expect(s.critMul).toBeLessThan(1.52);
  });

  it('默认暴击率 8%、暴击倍率 1.5', () => {
    expect(BASE_STATS.critChance).toBe(0.08);
    expect(BASE_STATS.critMul).toBe(1.5);
  });
});

describe('永久强化：每级增益曲线', () => {
  it('体魄：1% 匀速升到 3%', () => {
    expect(permStep('hp', 1)).toBeCloseTo(0.01, 6);
    expect(permStep('hp', 10)).toBeCloseTo(0.03, 6);
    // 10 级的中点是第 5.5 级；第 5 级略低于中点
    expect(permStep('hp', 5)).toBeCloseTo(0.0188888889, 6);
    expect(permStep('hp', 6)).toBeCloseTo(0.0211111111, 6);
  });

  it('威力：1% 匀速升到 10%', () => {
    expect(permStep('damage', 1)).toBeCloseTo(0.01, 6);
    expect(permStep('damage', 10)).toBeCloseTo(0.10, 6);
    // 九段等差，步长 1%
    expect(permStep('damage', 5)).toBeCloseTo(0.05, 6);
    expect(permStep('damage', 6)).toBeCloseTo(0.06, 6);
  });

  it('磁引：1% 匀速升到 3%', () => {
    expect(permStep('pickup', 1)).toBeCloseTo(0.01, 6);
    expect(permStep('pickup', 10)).toBeCloseTo(0.03, 6);
  });

  it('悟性：3% 匀速升到 10%', () => {
    expect(permStep('exp', 1)).toBeCloseTo(0.03, 6);
    expect(permStep('exp', 10)).toBeCloseTo(0.10, 6);
  });

  it('脚力：每级固定 1%', () => {
    for (let lv = 1; lv <= 10; lv++) expect(permStep('speed', lv)).toBeCloseTo(0.01, 6);
  });

  it('节律：每级固定 1%', () => {
    for (let lv = 1; lv <= 10; lv++) expect(permStep('cd', lv)).toBeCloseTo(0.01, 6);
  });

  it('线性项每级增量严格递增（不是固定值）', () => {
    const linear: [PermKey, number, number][] = [
      ['hp', 0.01, 0.03], ['damage', 0.01, 0.10],
      ['pickup', 0.01, 0.03], ['exp', 0.03, 0.10],
    ];
    for (const [k] of linear) {
      for (let lv = 2; lv <= 10; lv++) {
        expect(permStep(k, lv), `${k} Lv${lv}`).toBeGreaterThan(permStep(k, lv - 1));
      }
    }
  });
});

describe('永久强化：累计增益', () => {
  it('脚力十级累计 +10%', () => {
    expect(permTotal('speed', 10)).toBeCloseTo(0.10, 6);
  });

  it('节律十级累计 10%（冷却缩减）', () => {
    expect(permTotal('cd', 10)).toBeCloseTo(0.10, 6);
  });

  it('威力十级累计约 +55%（首尾平均 × 10 级）', () => {
    expect(permTotal('damage', 10)).toBeCloseTo(0.55, 2);
  });

  it('体魄十级累计约 +20%', () => {
    expect(permTotal('hp', 10)).toBeCloseTo(0.20, 2);
  });

  it('悟性十级累计约 +65%', () => {
    expect(permTotal('exp', 10)).toBeCloseTo(0.65, 2);
  });

  it('零级累计为 0', () => {
    for (const u of PERM_UPGRADES) expect(permTotal(u.key, 0)).toBe(0);
  });
});

describe('永久强化：折算进开局属性', () => {
  it('全部零级时属性与基础完全一致', () => {
    const s = applyPerm(BASE_STATS, empty());
    expect(s.damageMul).toBe(BASE_STATS.damageMul);
    expect(s.speed).toBe(BASE_STATS.speed);
    expect(s.expMul).toBe(BASE_STATS.expMul);
    expect(s.maxHp).toBe(BASE_STATS.maxHp);
  });

  it('威力 3 级：伤害按累计曲线生效', () => {
    const p = empty(); p.damage = 3;
    const after = applyPerm(BASE_STATS, p).damageMul;
    expect(after / BASE_STATS.damageMul).toBeCloseTo(1 + permTotal('damage', 3), 6);
  });

  it('脚力满级移速正好 +10%', () => {
    const p = empty(); p.speed = 10;
    const after = applyPerm(BASE_STATS, p).speed;
    expect(after / BASE_STATS.speed).toBeCloseTo(1.10, 6);
  });

  it('节律满级冷却 -10%', () => {
    const p = empty(); p.cd = 10;
    const after = applyPerm(BASE_STATS, p).cooldownMul;
    expect(after / BASE_STATS.cooldownMul).toBeCloseTo(0.90, 6);
  });

  it('冷却缩减有 50% 下限保护', () => {
    const p = empty(); p.cd = 10;
    const s = applyPerm({ ...BASE_STATS, cooldownMul: 1 }, p);
    expect(s.cooldownMul).toBeGreaterThanOrEqual(0.5);
  });
});

describe('永久强化：价格曲线', () => {
  it('第 1 级正好 50，第 10 级正好 30000', () => {
    expect(permCostAtLevel(1)).toBe(PERM_COST_MIN);
    expect(permCostAtLevel(10)).toBe(PERM_COST_MAX);
    expect(PERM_COST_MIN).toBe(50);
    expect(PERM_COST_MAX).toBe(30000);
  });

  it('价格严格单调递增', () => {
    for (let lv = 1; lv < 10; lv++) {
      expect(permCostAtLevel(lv + 1), `Lv${lv}→${lv + 1}`)
        .toBeGreaterThan(permCostAtLevel(lv));
    }
  });

  it('起步平缓：前三级涨幅几乎看不出', () => {
    // power=5 的实际上涨：第 2 级 +1、第 3 级 +15
    expect(permCostAtLevel(2) - permCostAtLevel(1)).toBeLessThanOrEqual(3);
    expect(permCostAtLevel(3) - permCostAtLevel(2)).toBeLessThanOrEqual(20);
    expect(permCostAtLevel(4) - permCostAtLevel(1)).toBeLessThanOrEqual(130);
  });

  it('越往后增速越陡：相邻涨幅逐级放大', () => {
    const d: number[] = [];
    for (let lv = 1; lv < 10; lv++) d.push(permCostAtLevel(lv + 1) - permCostAtLevel(lv));
    for (let i = 1; i < d.length - 1; i++) {
      expect(d[i], `第 ${i + 1} 段涨幅`).toBeGreaterThan(d[i - 1]);
    }
    expect(d[d.length - 1]).toBeGreaterThan(d[0] * 100);
  });

  it('最后三级的涨幅占满级总涨幅八成以上', () => {
    const total = permCostAtLevel(10) - permCostAtLevel(1);
    const tail = permCostAtLevel(10) - permCostAtLevel(7);
    expect(tail / total).toBeGreaterThan(0.8);
  });

  it('六项普通百分比强化共用同一条价格曲线', () => {
    expect(PCT_UPGRADES.length).toBe(6);
    for (const u of PCT_UPGRADES) {
      for (let lv = 0; lv < 10; lv++) {
        expect(permCost(u.key, lv), `${u.name} Lv${lv}→${lv + 1}`)
          .toBe(permCostAtLevel(lv + 1));
      }
    }
  });

  it('暴击两项价格是普通项的 3 倍', () => {
    expect(CRIT_UPGRADES.length).toBe(2);
    for (const u of CRIT_UPGRADES) {
      for (let lv = 0; lv < 10; lv++) {
        expect(permCost(u.key, lv), `${u.name} Lv${lv}→${lv + 1}`)
          .toBe(permCostAtLevel(lv + 1) * 3);
      }
      expect(permCost(u.key, 0)).toBe(150);
      expect(permCost(u.key, 9)).toBe(90000);
    }
  });

  it('赌神走自己的价目表：5万 / 15万 / 50万', () => {
    expect(permCost('gamble', 0)).toBe(50000);
    expect(permCost('gamble', 1)).toBe(150000);
    expect(permCost('gamble', 2)).toBe(500000);
  });

  it('满级调用返回最后一级价，由调用方拦截', () => {
    for (const u of PCT_UPGRADES) {
      expect(permCost(u.key, 10)).toBe(PERM_COST_MAX);
    }
    for (const u of CRIT_UPGRADES) {
      expect(permCost(u.key, 10)).toBe(PERM_COST_MAX * 3);
    }
    expect(permCost('gamble', 3)).toBe(500000);
  });

  it('买满一项的总花费大于单级最高价', () => {
    let total = 0;
    for (let i = 1; i <= 10; i++) total += permCostAtLevel(i);
    expect(total).toBeGreaterThan(PERM_COST_MAX);
  });
});

describe('基础伤害倍率', () => {
  it('基础伤害倍率为 1.05', () => {
    expect(BASE_STATS.damageMul).toBeCloseTo(1.05, 4);
  });

  it('相对原始 0.75 上调 +40%', () => {
    expect(BASE_STATS.damageMul / 0.75).toBeCloseTo(1.4, 2);
  });
});
