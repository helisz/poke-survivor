import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MOVES } from '../src/data/moves';

/**
 * 电系招式必须是「从宝可梦身上向外放射的电弧」，
 * 不是天降垂直闪电，也不能走普通弹道。
 */

const combat = readFileSync(
  resolve(__dirname, '../src/systems/CombatSystem.ts'),
  'utf8',
);
const fx = readFileSync(resolve(__dirname, '../src/systems/FxSystem.ts'), 'utf8');

const LIGHTNING = Object.values(MOVES).filter((m) => m.style === 'lightning');

describe('电系：向外放射电弧', () => {
  it('存在标记为 lightning 的招式', () => {
    expect(LIGHTNING.length).toBeGreaterThan(0);
  });

  it('十万伏特与雷光拳都标记为电系放射', () => {
    const ids = LIGHTNING.map((m) => m.id);
    expect(ids).toContain('thunderbolt');
    expect(ids).toContain('thunderpunch');
  });

  it('FX 系统提供从原点放射的 boltArc', () => {
    expect(fx).toContain('boltArc(');
  });

  it('已不再使用旧的垂直劈落 boltStrike', () => {
    expect(fx).not.toContain('boltStrike');
    expect(combat).not.toContain('boltStrike');
  });

  it('电系投射不走弹体，而是调用放射结算', () => {
    expect(combat).toContain('fireLightning(');
    // 生成弹体后遇到 lightning 应直接 return，不设置弹体属性
    const seg = combat.slice(
      combat.indexOf("if (def.style === 'lightning') {"),
      combat.indexOf("if (def.style === 'lightning') {") + 260,
    );
    expect(seg).toContain('return');
  });

  it('电弧有独立的扇形伤害结算', () => {
    expect(combat).toContain('damageArc(');
  });
});
