import { describe, it, expect } from 'vitest';
import { POKEMON_PLAYABLE } from '../src/data/pokedex';
import { MOVES } from '../src/data/moves';

/**
 * 选择伙伴 → 开局技能 的数据链路必须无歧义。
 * 历史 bug：选了妙蛙花，开局却给了电击魔兽的招式。
 * 根因是 SceneFlow 的 mgr.add 漏传 data，参数没送到 create()。
 * 这里从数据侧再兜一层：每只可玩宝可梦的招式必须存在、唯一、且能造成伤害。
 */
describe('伙伴 → 招式 映射', () => {
  it('每只可玩宝可梦都有对应招式条目', () => {
    for (const p of POKEMON_PLAYABLE) {
      expect(MOVES[p.move], `${p.name} 的招式 ${p.move} 不存在`).toBeTruthy();
    }
  });

  it('招式 id 不与任何其它宝可梦共用', () => {
    const seen = new Map<string, string>();
    for (const p of POKEMON_PLAYABLE) {
      const prev = seen.get(p.move);
      expect(prev, `${p.name} 与 ${prev} 共用招式 ${p.move}`).toBeUndefined();
      seen.set(p.move, p.name);
    }
  });

  it('宝可梦 id 唯一（贴图 key 不冲突）', () => {
    const ids = POKEMON_PLAYABLE.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每个招式都能反查到唯一宝可梦（跟随贴图不会张冠李戴）', () => {
    for (const p of POKEMON_PLAYABLE) {
      const def = MOVES[p.move];
      expect(def.pokeId, `${p.move} 的 pokeId 与 ${p.name}(${p.id}) 不符`).toBe(p.id);
    }
  });

  it('除晨光外所有招式都能造成伤害（不会被三选一过滤掉）', () => {
    for (const p of POKEMON_PLAYABLE) {
      const def = MOVES[p.move];
      if (p.move === 'morningsun') continue;
      expect(def.baseDamage, `${p.name} 的 ${p.move} 伤害为 0`).toBeGreaterThan(0);
    }
  });
});
