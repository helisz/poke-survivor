import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP_THEMES } from '../src/data/maps';
import { ENEMY_POOL, ELITE_POOL, BOSS_POOL } from '../src/data/pokedex';

/**
 * 回归测试：怪物变成黑框。
 * 根因：地图专属怪物池引用了 BootScene 未加载、assets 里也没有的图鉴编号，
 * 贴图缺失时 Phaser 会渲染成一个空白/黑框。
 *
 * 这里直接核对磁盘上的图片文件，确保所有怪物池引用的编号都有贴图。
 */

const ASSET_DIR = resolve(__dirname, '../public/assets/pokemon');
const available = new Set(
  readdirSync(ASSET_DIR)
    .filter((f) => f.endsWith('.png'))
    .map((f) => Number(f.slice(0, 3)))
    .filter((n) => !Number.isNaN(n)),
);

/** BootScene 里声明要加载的编号 */
const bootSrc = readFileSync(resolve(__dirname, '../src/scenes/BootScene.ts'), 'utf8');
const bootIds = new Set(
  (bootSrc.split('const POKEMON_IDS = [')[1] ?? '')
    .split('];')[0]
    .match(/\d{1,3}/g)!
    .map(Number),
);

describe('怪物贴图完整性', () => {
  it('全局野怪池全部有贴图文件', () => {
    for (const id of ENEMY_POOL) {
      expect(available.has(id), `野怪 ${id} 缺贴图`).toBe(true);
    }
  });

  it('全局精英池全部有贴图文件', () => {
    for (const id of ELITE_POOL) {
      expect(available.has(id), `精英 ${id} 缺贴图`).toBe(true);
    }
  });

  it('全局 BOSS 池全部有贴图文件', () => {
    for (const id of BOSS_POOL) {
      expect(available.has(id), `BOSS ${id} 缺贴图`).toBe(true);
    }
  });

  it('六张地图的专属怪物池全部有贴图文件', () => {
    for (const t of MAP_THEMES) {
      for (const id of t.enemyPool ?? []) {
        expect(available.has(id), `${t.name} 小怪 ${id} 缺贴图`).toBe(true);
      }
      for (const id of t.elitePool ?? []) {
        expect(available.has(id), `${t.name} 精英 ${id} 缺贴图`).toBe(true);
      }
    }
  });

  it('所有被引用的编号都在 BootScene 预加载列表里', () => {
    const referenced = new Set<number>([
      ...ENEMY_POOL, ...ELITE_POOL, ...BOSS_POOL,
      ...MAP_THEMES.flatMap((t) => [...(t.enemyPool ?? []), ...(t.elitePool ?? [])]),
    ]);
    for (const id of referenced) {
      expect(bootIds.has(id), `编号 ${id} 未在 BootScene 加载`).toBe(true);
    }
  });
});
