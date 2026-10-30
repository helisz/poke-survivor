/**
 * 场上拾取道具定义：磁铁 / 盾 / 剑。
 * 每分钟在玩家附近刷新一个，屏幕外时用边缘箭头指示。
 */

export type PickupKind = 'magnet' | 'shield' | 'sword';

/** 吃到后的效果持续时间（秒）。磁铁是瞬发，不参与倒计时。 */
export const PICKUP_BUFF_SECONDS: Record<PickupKind, number> = {
  magnet: 0,   // 瞬发：瞬间吸取全场经验，没有持续时间
  shield: 15,  // 无敌 15 秒
  sword: 15,   // 伤害翻倍 15 秒
};

/** 需要倒计时显示的道具（磁铁瞬发，不显示） */
export const TIMED_PICKUPS: PickupKind[] = ['shield', 'sword'];

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

/**
 * 地面掉落物的存活时间（秒）。
 * 60 秒刷一个，只留 20 秒 —— 过期消失，逼玩家当场做取舍，
 * 而不是「等攒一堆再一起捡」。
 */
export const PICKUP_LIFETIME = 20;
