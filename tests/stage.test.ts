import { describe, it, expect, beforeAll } from 'vitest';
import {
  MAP_THEMES, STAGE_COUNT, stageScale,
  STAGE_ATK_STEP, STAGE_HP_STEP, STAGE_SPD_STEP,
} from '../src/data/maps';
import { loadSave, writeSave, PERM_EMPTY } from '../src/data/stats';

describe('关卡：数量与顺序', () => {
  it('共 6 关，与地图表一致', () => {
    expect(STAGE_COUNT).toBe(6);
    expect(MAP_THEMES).toHaveLength(STAGE_COUNT);
  });

  it('顺序仍是草原 → 森林 → 洞窟 → 沼泽 → 火山 → 遗迹', () => {
    expect(MAP_THEMES.map((m) => m.id))
      .toEqual(['grassland', 'forest', 'cave', 'swamp', 'volcano', 'ruins']);
  });

  it('每关都保留自己的怪物池（地图特色）', () => {
    for (const m of MAP_THEMES) {
      expect(m.enemyPool, `${m.name} 怪物池`).toBeDefined();
      expect(m.enemyPool!.length, `${m.name} 怪物池大小`).toBeGreaterThan(0);
    }
  });
});

describe('关卡：强度倍率连乘', () => {
  it('第 1 关是基准 1×', () => {
    const s = stageScale(0);
    expect(s.atk).toBe(1);
    expect(s.hp).toBe(1);
    expect(s.spd).toBe(1);
  });

  it('每关攻击 +15%、血量 +20%、速度 +2%（连乘）', () => {
    expect(STAGE_ATK_STEP).toBe(1.15);
    expect(STAGE_HP_STEP).toBe(1.20);
    expect(STAGE_SPD_STEP).toBe(1.02);

    for (let n = 1; n < STAGE_COUNT; n++) {
      const prev = stageScale(n - 1);
      const cur = stageScale(n);
      expect(cur.atk).toBeCloseTo(prev.atk * 1.15, 6);
      expect(cur.hp).toBeCloseTo(prev.hp * 1.20, 6);
      expect(cur.spd).toBeCloseTo(prev.spd * 1.02, 6);
    }
  });

  it('第 6 关（遗迹）攻击 2.01×、血量 2.49×、速度 1.10×', () => {
    const s = stageScale(5);
    expect(s.atk).toBeCloseTo(Math.pow(1.15, 5), 6);   // 2.0114
    expect(s.hp).toBeCloseTo(Math.pow(1.20, 5), 6);    // 2.4883
    expect(s.spd).toBeCloseTo(Math.pow(1.02, 5), 6);   // 1.1041
    expect(s.atk).toBeCloseTo(2.01, 2);
    expect(s.hp).toBeCloseTo(2.49, 2);
    expect(s.spd).toBeCloseTo(1.10, 2);
  });

  it('强度严格单调递增', () => {
    for (let n = 1; n < STAGE_COUNT; n++) {
      const prev = stageScale(n - 1);
      const cur = stageScale(n);
      expect(cur.atk).toBeGreaterThan(prev.atk);
      expect(cur.hp).toBeGreaterThan(prev.hp);
      expect(cur.spd).toBeGreaterThan(prev.spd);
    }
  });

  it('越界的关卡号被夹到合法范围', () => {
    expect(stageScale(-3).atk).toBe(1);
    expect(stageScale(99).atk).toBeCloseTo(stageScale(5).atk, 6);
  });

  it('地图不再自带血量 / 速度倍率（改由关卡统一给）', () => {
    for (const m of MAP_THEMES) {
      expect(m, `${m.name} 不该再有 enemyHpMul`).not.toHaveProperty('enemyHpMul');
      expect(m, `${m.name} 不该再有 enemySpeedMul`).not.toHaveProperty('enemySpeedMul');
    }
  });
});

describe('存档：关卡进度字段', () => {
  const KEY = 'poke-survivor-save-v1';

  // Node 环境没有 localStorage，用内存实现顶替
  const store: Record<string, string> = {};
  const mem = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  beforeAll(() => {
    (globalThis as any).localStorage = mem;
  });

  it('新存档默认只解锁第 1 关', () => {
    localStorage.removeItem(KEY);
    const d = loadSave();
    expect(d.stageProgress).toBe(0);
    expect(d.devAllStages).toBe(false);
  });

  it('读写后进度与全解锁开关都能保留', () => {
    localStorage.removeItem(KEY);
    const d = loadSave();
    d.stageProgress = 3;
    d.devAllStages = true;
    d.perm = { ...PERM_EMPTY };
    writeSave(d);
    const back = loadSave();
    expect(back.stageProgress).toBe(3);
    expect(back.devAllStages).toBe(true);
  });

  it('旧存档缺少新字段时能自动补默认值', () => {
    localStorage.setItem(KEY, JSON.stringify({ coins: 500, bestTime: 42 }));
    const d = loadSave();
    expect(d.coins).toBe(500);
    expect(d.bestTime).toBe(42);
    expect(d.stageProgress).toBe(0);
    expect(d.devAllStages).toBe(false);
  });
});
