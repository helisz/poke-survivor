import { describe, it, expect } from 'vitest';
import { POKEDEX_NAME, POKEMON_GENUS, POKEMON_TYPE, POKEMON_PLAYABLE } from '../src/data/pokedex';

/**
 * 回归测试：图鉴文案混入繁体。
 *
 * 根因：PokeAPI 的 genus 和中文名回来的是 zh-hant，被当成简体直接用，
 * 于是出现「種子寶可夢 / 鑽錐寶可夢」和简体的「妙蛙种子」混排。
 * 这里直接按码位扫一遍，出现任何一个繁体专用字就挂，
 * 免得以后重新拉数据又把它带回来。
 */

// 只在本项目图鉴文案里实际出现过的繁体字 → 对应简体
const TRAD_ONLY: Record<string, string> = {
  種: '种', 寶: '宝', 夢: '梦', 鼠: '鼠',
  火: '火', 焰: '焰', 瞌: '瞌', 睡: '睡',
  基: '基', 因: '因', 新: '新', 冰: '冰',
  凍: '冻', 電: '电', 擊: '击', 乘: '乘',
  載: '载', 鑽: '钻', 錐: '锥', 貓: '猫',
  鳥: '鸟', 貝: '贝', 車: '车', 飛: '飞',
  魚: '鱼', 蟲: '虫', 獸: '兽', 劍: '剑',
  葉: '叶', 雲: '云', 巖: '岩', 體: '体',
  國: '国', 點: '点', 來: '来', 對: '对',
  學: '学', 龍: '龙', 屬: '属', 擊: '击',
  電: '电', 風: '风', 霧: '雾', 頭: '头',
  這: '这', 個: '个', 麼: '么', 樣: '样',
  開: '开', 關: '关', 時: '时', 間: '间',
  強: '强', 現: '现', 實: '实', 總: '总',
  級: '级', 靈: '灵', 華: '华', 麗: '丽',
  進: '进', 化: '化', 戰: '战', 鬥: '斗',
  溫: '温', 順: '顺', 淨: '净', 潔: '洁',
};

// 检查用的繁体专用字集（去掉与简体同形的）
const TRAD_CHARS = new Set(
  Object.keys(TRAD_ONLY).filter((ch) => TRAD_ONLY[ch] !== ch),
);

function findTrad(text: string): string[] {
  return [...text].filter((ch) => TRAD_CHARS.has(ch));
}

describe('图鉴文案统一简体', () => {
  it('POKEDEX_NAME 没有繁体字', () => {
    for (const [id, name] of Object.entries(POKEDEX_NAME)) {
      const bad = findTrad(name);
      expect(bad, `No.${id} ${name} 含繁体 ${bad.join('')}`).toEqual([]);
    }
  });

  it('POKEMON_GENUS 没有繁体字', () => {
    for (const [id, genus] of Object.entries(POKEMON_GENUS)) {
      const bad = findTrad(genus);
      expect(bad, `No.${id} ${genus} 含繁体 ${bad.join('')}`).toEqual([]);
    }
  });

  it('可玩池名字没有繁体字', () => {
    for (const p of POKEMON_PLAYABLE) {
      const bad = findTrad(p.name as string);
      expect(bad, `${p.name} 含繁体 ${bad.join('')}`).toEqual([]);
    }
  });

  it('每条图鉴都有分类名，且格式是「XX宝可梦」', () => {
    for (const id of Object.keys(POKEDEX_NAME).map(Number)) {
      const g = POKEMON_GENUS[id];
      expect(g, `No.${id} 缺分类名`).toBeTruthy();
      expect(g.endsWith('宝可梦'), `No.${id} 分类名「${g}」格式不对`).toBe(true);
    }
  });

  it('分类名与属性字段都覆盖可玩池', () => {
    for (const p of POKEMON_PLAYABLE) {
      const id = p.id as number;
      expect(POKEMON_TYPE[id], `No.${id} 缺属性`).toBeTruthy();
      expect(POKEMON_GENUS[id], `No.${id} 缺分类名`).toBeTruthy();
    }
  });
});
