import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 回归：登出必须清空本地存档。
 *
 * 以前 endSession 只吊销 token，本地存档留着。
 * 结果登出后还能看到上一个人的金币、进度、图鉴 —— 换个人玩就串号了。
 *
 * 同时要保证顺序：先 flush 再清。反过来的话，
 * clearSave() 之后若有任何写档，云同步钩子还在，会把空档推上去覆盖云端真数据。
 */

const SAVE_KEY = 'poke-survivor-save-v1';

const pushed: any[] = [];

vi.mock('../src/data/cloud', () => ({
  pushSave: vi.fn(async (_s: any, d: any) => { pushed.push(d); return { ok: true }; }),
  saveToken: vi.fn(),
  resumeSession: vi.fn(async () => ({ ok: false })),
  logout: vi.fn(async () => ({ ok: true })),
}));

function makeSave(over: Record<string, unknown> = {}) {
  return {
    coins: 1234, bestTime: 300, unlocked: [], devDmgMul: 1, devTakenMul: 1, devExpMul: 1,
    stageProgress: 3, devAllStages: false, seenPartners: [25], seenEnemies: [16],
    stageBest: [100, 200, 300, 0, 0, 0],
    perm: { hp: 2, damage: 1, speed: 0, critRate: 0, critDmg: 0, exp: 0, pickup: 0, cd: 0, gamble: 0 },
    ...over,
  };
}

describe('登出清空本地存档', () => {
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
    Object.defineProperty(globalThis, 'window', {
      value: {
        setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
        clearTimeout: (id: any) => clearTimeout(id),
      },
      configurable: true,
      writable: true,
    });
  });

  it('endSession 之后本地存档被删除', async () => {
    const { startSession, endSession } = await import('../src/data/session');
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave()));

    startSession({
      username: 'u', token: 't', hash: 'h',
      profile: {
        username: 'u', coins: 1234, stage_best: [100, 200, 300, 0, 0, 0], stage_progress: 3,
        perm: {}, seen_partners: [25], seen_enemies: [16], best_time: 300,
      },
    } as any);
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull();

    endSession();
    await vi.advanceTimersByTimeAsync(0);

    expect(localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it('登出前把本局成绩推上去，不会因为清档丢掉', async () => {
    const { startSession, endSession, scheduleSync } = await import('../src/data/session');
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave({ coins: 999 })));

    startSession({
      username: 'u', token: 't', hash: 'h',
      profile: {
        username: 'u', coins: 999, stage_best: [100, 200, 300, 0, 0, 0], stage_progress: 3,
        perm: {}, seen_partners: [], seen_enemies: [], best_time: 300,
      },
    } as any);

    // 模拟写档触发防抖排队，还没发出去就登出
    scheduleSync(JSON.parse(localStorage.getItem(SAVE_KEY)!) as any);
    expect(pushed.length).toBe(0);

    endSession();
    await vi.advanceTimersByTimeAsync(0);

    // 有推送，且推的是清档之前的数据（coins 999），不是空档
    expect(pushed.length).toBeGreaterThanOrEqual(1);
    expect(pushed[pushed.length - 1].coins).toBe(999);
  });

  it('清档后不再有云同步钩子，后续写档不会推空数据', async () => {
    const { startSession, endSession } = await import('../src/data/session');
    const { writeSave, loadSave } = await import('../src/data/stats');
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave()));

    startSession({
      username: 'u', token: 't', hash: 'h',
      profile: {
        username: 'u', coins: 1234, stage_best: [100, 200, 300, 0, 0, 0], stage_progress: 3,
        perm: {}, seen_partners: [], seen_enemies: [], best_time: 300,
      },
    } as any);

    endSession();
    await vi.advanceTimersByTimeAsync(0);
    pushed.length = 0;

    // 登出后本地是空档，此时写一次（比如进游戏失败重开）
    writeSave(loadSave());
    await vi.advanceTimersByTimeAsync(3000);

    // 钩子已摘除，不应该有任何推送
    expect(pushed.length).toBe(0);
  });
});
