export const POKEMON_PLAYABLE = [
  { id: 25,  name: '皮卡丘',   type: '电',    move: 'thunderbolt' },
  { id: 6,   name: '喷火龙',   type: '火',    move: 'flamethrower' },
  { id: 9,   name: '水箭龟',   type: '水',    move: 'watergun' },
  { id: 3,   name: '妙蛙花',   type: '草',    move: 'razorleaf' },
  { id: 143, name: '卡比兽',   type: '一般',  move: 'bodyslam' },
  { id: 94,  name: '耿鬼',     type: '幽灵',  move: 'shadowball' },
  { id: 149, name: '快龙',     type: '龙',    move: 'dragonclaw' },
  { id: 448, name: '路卡利欧', type: '格斗',  move: 'aurasphere' },
  { id: 282, name: '沙奈朵',   type: '超能',  move: 'psychic' },
  { id: 130, name: '暴鲤龙',   type: '水',    move: 'aquatail' },
  { id: 248, name: '班基拉斯', type: '岩石',  move: 'rockslide' },
  { id: 466, name: '电击魔兽', type: '电',    move: 'thunderpunch' },
  { id: 78,  name: '烈焰马',   type: '火',    move: 'flareblitz' },
  { id: 28,  name: '穿山王',   type: '地面',  move: 'earthquake' },
  { id: 38,  name: '九尾',     type: '火',    move: 'firespin' },
  { id: 208, name: '大钢蛇',   type: '钢',    move: 'ironhead' },
  { id: 196, name: '太阳伊布', type: '超能',  move: 'morningsun' },
  { id: 34,  name: '尼多王',   type: '毒',    move: 'sludgebomb' },
  { id: 257, name: '火焰鸡',   type: '火',    move: 'blazekick' },
  { id: 260, name: '巨沼怪',   type: '水',    move: 'mudslap' },
  { id: 254, name: '蜥蜴王',   type: '草',    move: 'leafblade' },
  { id: 65,  name: '胡地',     type: '超能',  move: 'confusion' },
  { id: 115, name: '袋兽',     type: '一般',  move: 'cometpunch' },
  { id: 445, name: '烈咬陆鲨', type: '龙',    move: 'dragonrush' },
] as const;

export const ENEMY_POOL = [19, 20, 41, 42, 109, 110, 92, 93, 29, 60, 63, 66, 72, 80, 100, 81, 43, 69, 120, 138];
export const ELITE_POOL = [22, 143, 94];
export const BOSS_POOL = [150, 248];

export const TYPE_COLORS: Record<string, number> = {
  电: 0xf7d02c, 火: 0xf0703c, 水: 0x4592e0, 草: 0x63c256, 一般: 0xb8b8a8,
  幽灵: 0x8a5fbf, 龙: 0x6a4fd0, 格斗: 0xd0402c, 超能: 0xf0609c, 岩石: 0xb8a038,
  地面: 0xd0a848, 钢: 0x9aa8b8, 毒: 0xa040a0, 飞行: 0x9cb4f0, 虫: 0xa8b820,
};
