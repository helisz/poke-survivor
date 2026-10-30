/**
 * 需要预加载贴图的编号集合。
 *
 * 抽成独立模块让 BootScene 与测试共用同一份推导逻辑 —— 测试不必再去
 * 解析 BootScene 的源码字符串（那是脆弱做法：改个写法就废）。
 *
 * 来源是所有「会出现在游戏里的 id」：
 *   可玩池 + 三个怪物池 + 六张地图的专属池 + 图鉴名表全集
 */
import {
  POKEMON_PLAYABLE, POKEDEX_NAME, ENEMY_POOL, ELITE_POOL, BOSS_POOL,
} from './pokedex';
import { MAP_THEMES } from './maps';

export function spriteIds(): number[] {
  const ids = new Set<number>([
    ...POKEMON_PLAYABLE.map((p) => p.id as number),
    ...ENEMY_POOL,
    ...ELITE_POOL,
    ...BOSS_POOL,
    ...MAP_THEMES.flatMap((t) => [...(t.enemyPool ?? []), ...(t.elitePool ?? [])]),
    ...Object.keys(POKEDEX_NAME).map(Number),
  ]);
  return [...ids].sort((a, b) => a - b);
}
