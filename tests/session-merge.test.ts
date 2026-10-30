import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 登录合并策略的回归测试。
 *
 * 背景：原来 applyCloudToLocal 无条件用云端覆盖本地，导致两个真实问题 —
 *   1. 云端是空号（新注册没玩过，全 0）时，本地成绩被清空
 *   2. 玩家先打通关、后登录，通关记录和金币全丢，排行榜上查不到人
 * 所以数值字段改成取最大值、图鉴取并集。
 */

// session.ts 依赖 localStorage 和云端 RPC，这里用内存桩替换
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
});

vi.mock('../src/data/cloud', () => ({
  pushSave: vi.fn(async () => ({ ok: true })),
}));

import { applyCloudToLocal } from '../src/data/session';

// stats.ts 里 SAVE_KEY 未导出，这里用同一字面量
const SAVE_KEY = 'poke-survivor-save-v1';

function seedLocal(data: Record<string, unknown>) {
  store[SAVE_KEY] = JSON.stringify({
    coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 1,
    stageProgress: 0, devAllStages: false, seenPartners: [], seenEnemies: [],
    stageBest: [0, 0, 0, 0, 0, 0], perm: {}, ...data,
  });
}

function readLocal() {
  return JSON.parse(store[SAVE_KEY] ?? '{}');
}

function cloudProfile(p: Partial<Record<string, unknown>>) {
  return {
    session: { username: 't', passHash: 'h' },
    profile: {
      username: 't', coins: 0, stage_best: [0, 0, 0, 0, 0, 0], stage_progress: 0,
      perm: {}, seen_partners: [], seen_enemies: [], best_time: 0, ...p,
    },
  } as any;
}

beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; });

describe('登录时云端与本地合并', () => {
  it('云端是空号时不清空本地金币和记录', () => {
    seedLocal({ coins: 500, stageBest: [888, 0, 0, 0, 0, 0], stageProgress: 1, bestTime: 300 });
    applyCloudToLocal(cloudProfile({}));
    const r = readLocal();
    expect(r.coins).toBe(500);
    expect(r.stageBest[0]).toBe(888);
    expect(r.stageProgress).toBe(1);
    expect(r.bestTime).toBe(300);
  });

  it('云端进度更高时采用云端的（换设备场景）', () => {
    seedLocal({ coins: 10, stageBest: [50, 0, 0, 0, 0, 0], stageProgress: 1 });
    applyCloudToLocal(cloudProfile({
      coins: 900, stage_best: [20, 400, 0, 0, 0, 0], stage_progress: 2,
    }));
    const r = readLocal();
    expect(r.coins).toBe(900);
    expect(r.stageBest[0]).toBe(50);   // 本地更高，保留本地
    expect(r.stageBest[1]).toBe(400);  // 云端更高，采用云端
    expect(r.stageProgress).toBe(2);
  });

  it('强化等级不会被云端的 0 冲掉', () => {
    seedLocal({ perm: { hp: 3, damage: 2 } });
    applyCloudToLocal(cloudProfile({ perm: { hp: 0, damage: 0, speed: 4 } }));
    const r = readLocal();
    expect(r.perm.hp).toBe(3);
    expect(r.perm.damage).toBe(2);
    expect(r.perm.speed).toBe(4);
  });

  it('图鉴取并集，两边各自的条目都保留', () => {
    seedLocal({ seenPartners: [25], seenEnemies: [16] });
    applyCloudToLocal(cloudProfile({ seen_partners: [6], seen_enemies: [19] }));
    const r = readLocal();
    expect(r.seenPartners).toEqual([6, 25]);
    expect(r.seenEnemies).toEqual([16, 19]);
  });

  it('通关第一关后 stageProgress=1 能被排行榜查询命中', () => {
    seedLocal({ stageProgress: 0 });
    applyCloudToLocal(cloudProfile({ stage_progress: 1, stage_best: [300, 0, 0, 0, 0, 0] }));
    const r = readLocal();
    // 排行榜 SQL 条件是 where stage_progress > 0
    expect(r.stageProgress).toBeGreaterThan(0);
  });
});
