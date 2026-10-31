import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 回归：结算成绩被 2 秒防抖吞掉。
 *
 * 曾经的写法只有 scheduleSync（2 秒防抖），而 scheduleSync 每被调用一次
 * 就 clearTimeout 重排；endSession 里也 clearTimeout。
 * 玩家打完一局 → endRun 写 stageBest → 排队推云端 → 同一帧 GameOverScene
 * 又写一次存档（重排计时）→ 玩家立刻点「返回主页」（endSession 清计时器）
 * ⇒ 推送永远发不出去，云端还是全 0，排行榜自然看不到这个人。
 *
 * 现在 endRun 和 endSession 都会走 flushSync 立即推送。
 */

const SAVE_KEY = 'poke-survivor-save-v1';

function makeSave(over: Record<string, unknown> = {}) {
  return {
    coins: 0, bestTime: 0, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 1,
    stageProgress: 0, devAllStages: false, seenPartners: [], seenEnemies: [],
    stageBest: [0, 0, 0, 0, 0, 0],
    perm: { hp: 0, damage: 0, speed: 0, critRate: 0, critDmg: 0, exp: 0, pickup: 0, cd: 0, gamble: 0 },
    ...over,
  };
}

const pushed: any[] = [];

vi.mock('../src/data/cloud', () => {
  return {
    pushSave: vi.fn(async (_s: any, d: any) => { pushed.push(d); return true; }),
    saveToken: vi.fn(),
    resumeSession: vi.fn(async () => ({ ok: false, reason: 'not_found' })),
    logout: vi.fn(async () => {}),
  };
});

describe('结算推送', () => {
  beforeEach(() => {
    pushed.length = 0;
    vi.useFakeTimers();
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        clear: () => { for (const k of Object.keys(store)) delete store[k]; },
      },
      configurable: true,
    });
    // session.ts 用的是 window.setTimeout / window.clearTimeout
    Object.defineProperty(globalThis, 'window', {
      value: {
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        clearTimeout: (id: any) => clearTimeout(id),
      },
      configurable: true,
      writable: true,
    });
  });

  it('flushSync 立即推送，不等 2 秒', async () => {
    const { startSession, flushSync } = await import('../src/data/session');
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave({ coins: 700, stageBest: [1234, 0, 0, 0, 0, 0], stageProgress: 1 })));
    startSession({
      username: 'chris', token: 'tok', hash: 'h',
      profile: { username: 'chris', coins: 0, stage_best: [0, 0, 0, 0, 0, 0], stage_progress: 0,
        perm: {}, seen_partners: [], seen_enemies: [], best_time: 0 },
    } as any);

    flushSync();
    await vi.advanceTimersByTimeAsync(0);

    expect(pushed.length).toBe(1);
    expect(pushed[0].stageBest[0]).toBe(1234);
    expect(pushed[0].stageProgress).toBe(1);
  });

  it('endSession 会把没发出的推送先发掉', async () => {
    const { startSession, endSession, scheduleSync } = await import('../src/data/session');
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave({ coins: 900, stageBest: [4321, 0, 0, 0, 0, 0], stageProgress: 2 })));
    startSession({
      username: 'chris', token: 'tok', hash: 'h',
      profile: { username: 'chris', coins: 0, stage_best: [0, 0, 0, 0, 0, 0], stage_progress: 0,
        perm: {}, seen_partners: [], seen_enemies: [], best_time: 0 },
    } as any);

    // 模拟 writeSave 触发的防抖排队，此刻还没到 2 秒
    scheduleSync(JSON.parse(localStorage.getItem(SAVE_KEY)!) as any);
    expect(pushed.length).toBe(0);

    endSession();
    await vi.advanceTimersByTimeAsync(0);

    expect(pushed.length).toBeGreaterThanOrEqual(1);
    expect(pushed[pushed.length - 1].stageBest[0]).toBe(4321);
  });

  it('未登录时推送是空操作，不炸', async () => {
    const { flushSync } = await import('../src/data/session');
    expect(() => flushSync()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(pushed.length).toBe(0);
  });
});
