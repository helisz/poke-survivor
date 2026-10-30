import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAP_THEMES } from '../src/data/maps';
import {
  ENEMY_POOL, ELITE_POOL, BOSS_POOL, POKEMON_PLAYABLE, POKEDEX_NAME,
} from '../src/data/pokedex';
import { spriteIds, MENU_SPRITE_IDS, MENU_SPRITE_COUNT } from '../src/data/sprites';

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

  it('所有被引用的编号都能被按需加载到（不是首屏全量）', () => {
    // 改成按需加载后，不再要求全部进 Boot 预加载清单；
    // 但要保证每个会被画出来的编号都有对应 PNG，且能被 spriteIds 覆盖。
    const referenced = new Set<number>([
      ...ENEMY_POOL, ...ELITE_POOL, ...BOSS_POOL,
      ...MAP_THEMES.flatMap((t) => [...(t.enemyPool ?? []), ...(t.elitePool ?? [])]),
    ]);
    for (const id of referenced) {
      expect(available.has(id), `编号 ${id} 缺贴图文件`).toBe(true);
      expect(bootIds.has(id), `编号 ${id} 不在可加载集合里`).toBe(true);
    }
  });

  it('首屏只加载主菜单用的 10 张，不再全量 166 张', () => {
    // 曾经 BootScene 一次性加载全量，打开首页就白等几百毫秒还烧流量。
    expect(MENU_SPRITE_IDS.length).toBe(MENU_SPRITE_COUNT);
    expect(MENU_SPRITE_IDS.length).toBeLessThanOrEqual(10);
    // 主菜单背景要用 9 只，清单必须够用且不重复
    expect(new Set(MENU_SPRITE_IDS).size).toBe(MENU_SPRITE_IDS.length);
    expect(MENU_SPRITE_IDS.length).toBeGreaterThanOrEqual(9);
    for (const id of MENU_SPRITE_IDS) {
      expect(available.has(id), `首屏贴图 ${id} 不存在`).toBe(true);
    }
    // 全量集合应当明显大于首屏集合
    expect(bootIds.size).toBeGreaterThan(MENU_SPRITE_IDS.length * 10);
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

  it('EnemySystem.spawn 必须有缺图守卫，否则会刷出 __MISSING 黑块', () => {
    // 按需加载是异步的：进关瞬间贴图可能没到位，group.get(x,y,key) 会拿到
    // Phaser 的 __MISSING 占位纹理，画出来就是一块纯黑。
    // 静态资源都在，这类 bug 只能靠运行时守卫防，所以直接锁源码。
    const src = readFileSync(resolve(__dirname, '../src/systems/EnemySystem.ts'), 'utf8');
    expect(src).toMatch(/spawn\([\s\S]{0,400}?textures\.exists\(key\)/);
    expect(src).toMatch(/pickKey[\s\S]{0,800}?textures\.exists\(`pk_\$\{id\}`\)/);
  });
});
