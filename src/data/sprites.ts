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

/**
 * 主菜单首屏要加载的贴图。
 *
 * 10 只足够 MENU_SPRITE_COUNT 个背景位不重复（MenuBackdrop 只用 9 只），
 * 首屏加载量从 166 张压到 10 张。刻意取形象差异大的几只，避免背景糊成一片。
 * 顺序稳定（不随机），这样同一份清单可以被测试锁住。
 */
export const MENU_SPRITE_COUNT = 10;

export const MENU_SPRITE_IDS: number[] = [
  25,   // 皮卡丘
  6,    // 喷火龙
  9,    // 水箭龟
  3,    // 妙蛙花
  94,   // 耿鬼
  143,  // 卡比兽
  149,  // 快龙
  130,  // 暴鲤龙
  65,   // 胡地
  248,  // 班基拉斯
];
