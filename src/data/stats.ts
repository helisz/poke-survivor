export const TRAITS = [
  { id: 'swift',  name: '急足', desc: '移速 +15%' },
  { id: 'iron',   name: '铁壁', desc: '最大 HP +25，受伤 -10%' },
  { id: 'affinity', name: '亲和', desc: '拾取范围 +40%，经验 +10%' },
] as const;

export type TraitId = typeof TRAITS[number]['id'];

export interface PlayerStats {
  hp: number;
  maxHp: number;
  speed: number;
  damageMul: number;
  cooldownMul: number;
  pickup: number;
  expMul: number;
  damageTakenMul: number;
  radius: number;
}

export const BASE_STATS: PlayerStats = {
  hp: 140, maxHp: 140, speed: 175, damageMul: 1, cooldownMul: 1,
  pickup: 70, expMul: 1, damageTakenMul: 1, radius: 16,
};

export const MAX_SLOTS = 6;
export const RUN_SECONDS = 15 * 60;
export const ENEMY_CAP = 300;

export function expForLevel(level: number): number {
  return Math.floor(5 + level * 10 * (1 + level * 0.06));
}

export interface SaveData {
  coins: number;
  bestTime: number;
  unlocked: string[];
}

const SAVE_KEY = 'poke-survivor-save-v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { coins: 0, bestTime: 0, unlocked: [], ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { coins: 0, bestTime: 0, unlocked: [] };
}

export function writeSave(data: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}
