import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP_THEMES } from '../src/data/maps';
import {
  ENEMY_POOL, ELITE_POOL, BOSS_POOL, POKEMON_PLAYABLE, POKEDEX_NAME,
} from '../src/data/pokedex';
import { spriteIds } from '../src/data/sprites';

/**
 * 回归测试：怪物变成黑框。
 * 根因：怪物池引用了 BootScene 未加载、assets 里也没有的图鉴编号，
 * 贴图缺失时 Phaser 会渲染成空白/黑框。
 *
 * 预加载列表由 data/sprites.ts 推导，BootScene 与这里用同一份逻辑，
 * 不再解析源码字符串。
 */

const ASSET_DIR = resolve(__dirname, '../public/assets/pokemon');
const available = new Set(
  readdirSync(ASSET_DIR)
    .filter((f) => f.endsWith('.png'))
    .map((f) => Number(f.slice(0, 3)))
    .filter((n) => !Number.isNaN(n)),
);

const bootIds = new Set(spriteIds());

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

  it('所有被引用的编号都在预加载列表里', () => {
    const referenced = new Set<number>([
      ...ENEMY_POOL, ...ELITE_POOL, ...BOSS_POOL,
      ...MAP_THEMES.flatMap((t) => [...(t.enemyPool ?? []), ...(t.elitePool ?? [])]),
    ]);
    for (const id of referenced) {
      expect(bootIds.has(id), `编号 ${id} 未预加载`).toBe(true);
    }
  });

  it('图鉴名表与可玩/怪物池一致：每个名字都有贴图', () => {
    for (const id of Object.keys(POKEDEX_NAME).map(Number)) {
      expect(available.has(id), `图鉴 ${id} 有名字但缺贴图`).toBe(true);
    }
  });

  it('可玩池每只都有贴图', () => {
    for (const p of POKEMON_PLAYABLE) {
      expect(available.has(p.id), `可玩 ${p.id} ${p.name} 缺贴图`).toBe(true);
    }
  });
});
