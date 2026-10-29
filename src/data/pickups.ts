/**
 * 场上拾取道具定义：磁铁 / 盾 / 剑。
 * 每分钟在玩家附近刷新一个，屏幕外时用边缘箭头指示。
 */

export type PickupKind = 'magnet' | 'shield' | 'sword';

export interface PickupDef {
  kind: PickupKind;
  name: string;
  desc: string;
  /** 纹理主色 */
  color: number;
  /** 光晕色 */
  glow: number;
}

export const PICKUP_DEFS: Record<PickupKind, PickupDef> = {
  magnet: {
    kind: 'magnet',
    name: '磁铁',
    desc: '吸取全场经验',
    color: 0xd94f4f,
    glow: 0xff8a7a,
  },
  shield: {
    kind: 'shield',
    name: '护盾',
    desc: '无敌 15 秒',
    color: 0x4fa3d9,
    glow: 0x8fd0ff,
  },
  sword: {
    kind: 'sword',
    name: '利剑',
    desc: '伤害翻倍 15 秒',
    color: 0xe0c04a,
    glow: 0xffe787,
  },
};

export const PICKUP_LIST: PickupKind[] = ['magnet', 'shield', 'sword'];
