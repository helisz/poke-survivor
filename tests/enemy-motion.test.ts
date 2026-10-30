import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FLOATING_IDS, isFloating, isFloatingMon } from '../src/data/pokedex';

const SRC = readFileSync(
  resolve(__dirname, '../src/systems/EnemySystem.ts'), 'utf8',
);

describe('怪物浮动/蹦跳', () => {
  it('BOSS 一律浮空', () => {
    // BOSS 体型 2.1 倍，蹦跳会显得滑稽
    expect(isFloatingMon(1, true)).toBe(true);
    expect(isFloatingMon(144, true)).toBe(true);
  });

  it('毒气系浮空：臭泥 / 瓦斯弹 / 阿柏蛇', () => {
    for (const id of [88, 89, 109, 110, 23, 24]) {
      expect(isFloating(id), `毒气系 ${id} 应浮空`).toBe(true);
    }
  });

  it('超能系浮空：凯西 / 催眠貘', () => {
    for (const id of [63, 64, 96, 97]) {
      expect(isFloating(id), `超能系 ${id} 应浮空`).toBe(true);
    }
  });

  it('爬虫不浮空：绿毛虫 / 铁甲蛹 / 独角虫 / 铁壳蛹', () => {
    // 这四只在地上蠕动，浮着走反而诡异
    for (const id of [10, 11, 13, 14]) {
      expect(isFloating(id), `爬虫 ${id} 不该浮空`).toBe(false);
    }
  });

  it('普通走兽不浮空', () => {
    for (const id of [1, 4, 7, 19, 25]) {
      expect(isFloating(id)).toBe(false);
    }
  });

  it('命中判定必须留在地面：渲染偏移只能在 postupdate 应用', () => {
    // 踩过的坑：直接改 e.y 或 body.offset 都会被 Phaser 的物理步
    // 当成新位置读走，产生 100px+ 的漂移。
    // 约束：update 只算 pendingLift，真正应用在 preupdate 还原 /
    // postupdate 叠加这两个钩子里。
    expect(SRC).toMatch(/installLiftHook/);
    expect(SRC).toMatch(/events\.on\('preupdate'/);
    expect(SRC).toMatch(/events\.on\('postupdate'/);
    expect(SRC).toMatch(/setData\('pendingLift', lift\)/);
    // 主更新循环里不允许直接写 e.y
    const updateBody = SRC.slice(
      SRC.indexOf('update(playerX: number, playerY: number, time: number)'),
      SRC.indexOf('damage(e: Phaser.Physics.Arcade.Sprite'),
    );
    expect(updateBody).not.toMatch(/^\s*e\.y\s*=/m);
  });

  it('跳跃频率随速度增长且有上下限', () => {
    expect(SRC).toMatch(/hopHz/);
    expect(SRC).toMatch(/Phaser\.Math\.Clamp\(0\.9 \+ \(spd0 - 62\) \/ 90, 0\.9, 2\.0\)/);
  });

  it('超时回收要清掉跳跃状态，否则对象池复用时错位', () => {
    expect(SRC).toMatch(/appliedLift/);
    expect(SRC).toMatch(/setData\('pendingLift', 0\)/);
  });
});
