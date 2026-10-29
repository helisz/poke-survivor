export type MoveCategory = 'melee' | 'projectile' | 'aura' | 'aoe' | 'summon';

export interface MoveDef {
  id: string;
  name: string;
  pokeId: number;
  type: string;
  category: MoveCategory;
  color: number;
  baseDamage: number;
  cooldown: number;      // ms/shot
  projectileSpeed?: number;
  pierce?: number;
  range?: number;        // for melee / aura radius / aoe radius
  duration?: number;     // aura / aoe active time
  count?: number;        // projectiles per shot / multi-hit
  desc: string;
}

export const MOVES: Record<string, MoveDef> = {
  thunderbolt: {
    id: 'thunderbolt', name: '十万伏特', pokeId: 25, type: '电', category: 'projectile',
    color: 0xf7d02c, baseDamage: 12, cooldown: 620, projectileSpeed: 520, pierce: 0, count: 1,
    desc: '向最近的敌人发射电球',
  },
  flamethrower: {
    id: 'flamethrower', name: '喷射火焰', pokeId: 6, type: '火', category: 'projectile',
    color: 0xf0703c, baseDamage: 9, cooldown: 400, projectileSpeed: 460, pierce: 1, count: 1,
    desc: '快速喷出穿透火焰',
  },
  watergun: {
    id: 'watergun', name: '水枪', pokeId: 9, type: '水', category: 'projectile',
    color: 0x4592e0, baseDamage: 10, cooldown: 520, projectileSpeed: 480, pierce: 0, count: 2,
    desc: '同时射出两股水流',
  },
  razorleaf: {
    id: 'razorleaf', name: '飞叶快刀', pokeId: 3, type: '草', category: 'projectile',
    color: 0x63c256, baseDamage: 8, cooldown: 560, projectileSpeed: 540, pierce: 2, count: 1,
    desc: '高穿透飞叶',
  },
  bodyslam: {
    id: 'bodyslam', name: '泰山压顶', pokeId: 143, type: '一般', category: 'aoe',
    color: 0xb8b8a8, baseDamage: 30, cooldown: 1800, range: 110, duration: 220,
    desc: '以自身为中心重压',
  },
  shadowball: {
    id: 'shadowball', name: '暗影球', pokeId: 94, type: '幽灵', category: 'projectile',
    color: 0x8a5fbf, baseDamage: 18, cooldown: 900, projectileSpeed: 380, pierce: 1, count: 1,
    desc: '缓慢但高伤的暗影球',
  },
  dragonclaw: {
    id: 'dragonclaw', name: '龙之爪', pokeId: 149, type: '龙', category: 'melee',
    color: 0x6a4fd0, baseDamage: 22, cooldown: 700, range: 90,
    desc: '身前横扫近战',
  },
  aurasphere: {
    id: 'aurasphere', name: '波导弹', pokeId: 448, type: '格斗', category: 'projectile',
    color: 0x40b0d0, baseDamage: 16, cooldown: 800, projectileSpeed: 420, pierce: 2, count: 1,
    desc: '追踪波导弹',
  },
  psychic: {
    id: 'psychic', name: '精神强念', pokeId: 282, type: '超能', category: 'aura',
    color: 0xf0609c, baseDamage: 6, cooldown: 300, range: 120, duration: 300,
    desc: '周围持续超能伤害光环',
  },
  aquatail: {
    id: 'aquatail', name: '水流尾', pokeId: 130, type: '水', category: 'melee',
    color: 0x4592e0, baseDamage: 26, cooldown: 900, range: 100,
    desc: '大幅扫尾近战',
  },
  rockslide: {
    id: 'rockslide', name: '岩崩', pokeId: 248, type: '岩石', category: 'aoe',
    color: 0xb8a038, baseDamage: 34, cooldown: 2200, range: 140, duration: 300,
    desc: '落石范围爆发',
  },
  thunderpunch: {
    id: 'thunderpunch', name: '雷光拳', pokeId: 466, type: '电', category: 'melee',
    color: 0xf7d02c, baseDamage: 20, cooldown: 600, range: 80,
    desc: '快速电拳',
  },
  flareblitz: {
    id: 'flareblitz', name: '闪焰冲锋', pokeId: 78, type: '火', category: 'melee',
    color: 0xf0703c, baseDamage: 28, cooldown: 1000, range: 95,
    desc: '冲锋火焰近战',
  },
  earthquake: {
    id: 'earthquake', name: '地震', pokeId: 28, type: '地面', category: 'aoe',
    color: 0xd0a848, baseDamage: 40, cooldown: 2500, range: 160, duration: 350,
    desc: '大范围地面爆破',
  },
  firespin: {
    id: 'firespin', name: '火焰旋涡', pokeId: 38, type: '火', category: 'aura',
    color: 0xf0904c, baseDamage: 5, cooldown: 300, range: 110, duration: 300,
    desc: '火焰光环持续灼烧',
  },
  ironhead: {
    id: 'ironhead', name: '铁头', pokeId: 208, type: '钢', category: 'melee',
    color: 0x9aa8b8, baseDamage: 24, cooldown: 800, range: 85,
    desc: '钢之头槌',
  },
  morningsun: {
    id: 'morningsun', name: '晨光', pokeId: 196, type: '超能', category: 'summon',
    color: 0xf0e070, baseDamage: 0, cooldown: 6000, count: 1,
    desc: '恢复自身生命',
  },
  sludgebomb: {
    id: 'sludgebomb', name: '污泥炸弹', pokeId: 34, type: '毒', category: 'projectile',
    color: 0xa040a0, baseDamage: 14, cooldown: 700, projectileSpeed: 340, pierce: 1, count: 1,
    desc: '投掷污泥弹',
  },
  blazekick: {
    id: 'blazekick', name: '火焰踢', pokeId: 257, type: '火', category: 'melee',
    color: 0xf0703c, baseDamage: 26, cooldown: 750, range: 90,
    desc: '火焰飞踢',
  },
  mudslap: {
    id: 'mudslap', name: '泥巴射击', pokeId: 260, type: '地面', category: 'projectile',
    color: 0xc0a070, baseDamage: 11, cooldown: 450, projectileSpeed: 440, pierce: 0, count: 2,
    desc: '快速双发泥浆',
  },
  leafblade: {
    id: 'leafblade', name: '叶刃', pokeId: 254, type: '草', category: 'melee',
    color: 0x63c256, baseDamage: 25, cooldown: 850, range: 100,
    desc: '利刃横扫',
  },
  confusion: {
    id: 'confusion', name: '念力', pokeId: 65, type: '超能', category: 'projectile',
    color: 0xe060a0, baseDamage: 13, cooldown: 500, projectileSpeed: 400, pierce: 3, count: 1,
    desc: '高穿透念力波',
  },
  cometpunch: {
    id: 'cometpunch', name: '连续拳', pokeId: 115, type: '一般', category: 'melee',
    color: 0xd0b090, baseDamage: 8, cooldown: 320, range: 70, count: 3,
    desc: '超快三段拳',
  },
  dragonrush: {
    id: 'dragonrush', name: '龙之俯冲', pokeId: 445, type: '龙', category: 'projectile',
    color: 0x6a4fd0, baseDamage: 21, cooldown: 950, projectileSpeed: 500, pierce: 2, count: 1,
    desc: '高速穿透冲击',
  },
};

export const MOVE_LIST = Object.values(MOVES);
