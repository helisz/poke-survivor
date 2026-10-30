import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TRAITS, BASE_STATS } from '../src/data/stats';

const PLAYER_SRC = readFileSync(resolve(__dirname, '../src/objects/Player.ts'), 'utf8');
const GAME_SRC = readFileSync(resolve(__dirname, '../src/scenes/GameScene.ts'), 'utf8');

describe('特性：活力', () => {
  const vitality = TRAITS.find((t) => t.id === 'vitality')!;

  it('存在且描述包含回血加成', () => {
    expect(vitality).toBeTruthy();
    expect(vitality.desc).toContain('回血');
  });

  it('最大 HP +18 有实际实现', () => {
    const caseBody = PLAYER_SRC.slice(
      PLAYER_SRC.indexOf("case 'vitality'"),
      PLAYER_SRC.indexOf("case 'scholar'"),
    );
    expect(caseBody).toMatch(/maxHp \+= 18/);
  });

  it('回血 +15% 不是空话：healMul 要被真正改动', () => {
    // 曾经这里只写了 maxHp，描述里的「回血 +15%」完全没有实现
    const caseBody = PLAYER_SRC.slice(
      PLAYER_SRC.indexOf("case 'vitality'"),
      PLAYER_SRC.indexOf("case 'scholar'"),
    );
    expect(caseBody).toMatch(/healMul \*= 1\.15/);
  });

  it('healMul 默认 1', () => {
    expect(BASE_STATS.healMul).toBe(1);
  });

  it('拾取回血球时应用 healMul', () => {
    // 不应用的话 healMul 只是个躺在 stats 里的死字段
    expect(GAME_SRC).toMatch(/stats\.maxHp \* pct \* this\.player\.stats\.healMul/);
  });
});

describe('主角承受伤害基准', () => {
  it('基准 1 倍，不是测试期遗留的 3 倍', () => {
    expect(BASE_STATS.damageTakenMul).toBe(1);
  });
});
