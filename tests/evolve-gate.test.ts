import { describe, it, expect } from 'vitest';
import { EVOLUTIONS, canEvolve, EVOLVE_MIN_MOVE_LEVEL, MOVE_LEVEL_EVOLVE_AT } from '../src/data/evolutions';

/**
 * 进化门槛：刚拿到的伙伴必须先练到 5 级。
 *
 * 【为什么锁死】原来第一次进化的条件是 `玩家总等级 OR 招式 8 级`。
 * 中期玩家总等级已经 20+，新抽到的 1 级伙伴下一个升级就直接弹进化卡 ——
 * 等于「没有原始形态也白送进化版」。现在招式本身必须先到 5 级。
 */

describe('进化门槛：招式先到 5 级', () => {
  it('EVOLVE_MIN_MOVE_LEVEL 是 5', () => {
    expect(EVOLVE_MIN_MOVE_LEVEL).toBe(5);
  });

  it('每条进化都带 require 的 moveLevel 门槛', () => {
    const missing: string[] = [];
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      for (const def of chain) {
        const hasGate = (def.require ?? []).some(
          (c) => c.kind === 'moveLevel' && c.value === EVOLVE_MIN_MOVE_LEVEL,
        );
        if (!hasGate) missing.push(`${moveId} -> ${def.name}`);
      }
    }
    expect(missing, `这些进化缺少 5 级门槛：${missing.join(', ')}`).toEqual([]);
  });

  it('玩家等级再高，招式 1 级也不能进化', () => {
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      const def = chain[0];
      if (!def) continue;
      const ok = canEvolve(def, { elapsed: 9999, level: 60, ownedMove: moveId, moveLevel: 1 });
      expect(ok, `${moveId} 在招式 Lv.1 时不该进化`).toBe(false);
    }
  });

  it('招式 4 级仍然不能进化', () => {
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      const def = chain[0];
      if (!def) continue;
      const ok = canEvolve(def, { elapsed: 9999, level: 60, ownedMove: moveId, moveLevel: 4 });
      expect(ok, `${moveId} 在招式 Lv.4 时不该进化`).toBe(false);
    }
  });

  it('招式到 8 级可以进化（满足 moveLevel 分支）', () => {
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      const def = chain[0];
      if (!def) continue;
      const ok = canEvolve(def, {
        elapsed: 0, level: 1, ownedMove: moveId, moveLevel: MOVE_LEVEL_EVOLVE_AT,
      });
      expect(ok, `${moveId} 在招式 Lv.${MOVE_LEVEL_EVOLVE_AT} 时应该能进化`).toBe(true);
    }
  });

  it('5 级且总等级达标也能进化', () => {
    let checked = 0;
    for (const [moveId, chain] of Object.entries(EVOLUTIONS)) {
      const def = chain[0];
      if (!def) continue;
      const levelReq = (def.requireOneOf ?? []).find((c) => c.kind === 'level');
      if (!levelReq || levelReq.kind !== 'level') continue;
      const ok = canEvolve(def, {
        elapsed: 0, level: levelReq.value, ownedMove: moveId, moveLevel: EVOLVE_MIN_MOVE_LEVEL,
      });
      expect(ok, `${moveId} 在招式 Lv.5 + 总等级 ${levelReq.value} 时应能进化`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
