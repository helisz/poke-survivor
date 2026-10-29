import { describe, it, expect } from 'vitest';
import { RUN_SECONDS } from '../src/data/stats';

/** 与 GameScene.updateSpawning 保持一致的刷怪速率公式 */
function spawnRate(t: number): number {
  const clamped = Math.min(t, RUN_SECONDS);
  return 0.5 + 3.0 * Math.pow(clamped / RUN_SECONDS, 0.65);
}

/** 与 CombatSystem.screenAimRadius 一致的公式 */
function screenAimRadius(camW: number, camH: number, zoom = 1): number {
  return Math.hypot(camW / zoom / 2, camH / zoom / 2);
}

describe('刷怪曲线', () => {
  it('开局速率应低于 0.7/s（前期不能压人）', () => {
    expect(spawnRate(0)).toBeLessThan(0.7);
  });

  it('30 秒时速率应低于 1.2/s', () => {
    expect(spawnRate(30)).toBeLessThan(1.2);
  });

  it('全程速率单调不降', () => {
    let prev = -1;
    for (let t = 0; t <= RUN_SECONDS; t += 5) {
      const r = spawnRate(t);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it('结束速率不超过 3.6/s（不能回到旧版 12/s 的陡峭曲线）', () => {
    expect(spawnRate(RUN_SECONDS)).toBeLessThanOrEqual(3.6);
  });

  it('前 30 秒累计刷怪量应少于 40 只', () => {
    let acc = 0;
    for (let t = 0; t < 30; t += 1) acc += spawnRate(t);
    expect(acc).toBeLessThan(40);
  });

  it('曲线平缓：后半段速率不超过开局的 8 倍', () => {
    expect(spawnRate(RUN_SECONDS) / spawnRate(0)).toBeLessThan(8);
  });
});

describe('屏幕索敌半径', () => {
  it('手机竖屏 390x844 约为 465px', () => {
    const r = screenAimRadius(390, 844);
    expect(r).toBeGreaterThan(440);
    expect(r).toBeLessThan(490);
  });

  it('不应达到旧的硬编码 700px', () => {
    expect(screenAimRadius(390, 844)).toBeLessThan(700);
    expect(screenAimRadius(1280, 633)).toBeLessThan(720);
  });

  it('在屏幕外 700px 的目标必须落在索敌范围外', () => {
    const r = screenAimRadius(390, 844);
    expect(700).toBeGreaterThan(r);   // 说明该目标不会被索敌
  });

  it('屏幕内 180px 的目标必须在索敌范围内', () => {
    expect(180).toBeLessThan(screenAimRadius(390, 844));
  });
});
