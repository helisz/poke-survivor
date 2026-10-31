import { loadSave, writeSave, clearSave, setSaveHook, type SaveData } from './stats';
import { pushSave, saveToken, resumeSession, logout, type CloudSession } from './cloud';
import { STAGE_COUNT } from './maps';

/**
 * 当前登录会话（内存级）。刷新页面即失效，需要重新登录 ——
 * 换设备场景本来就该重新输密码，不为了省事把哈希写进 localStorage。
 */
let session: CloudSession | null = null;
let timer: number | undefined;

export function currentSession() { return session; }
export function isLoggedIn() { return !!session; }

/**
 * 云端 profile → 本地 SaveData。
 *
 * 不能无条件让云端覆盖：云端可能是空号（新注册后没玩过，全是 0），
 * 无条件覆盖会把本地已有的金币、记录、进度清空 —— 玩家会以为存档丢了。
 * 所以数值字段统一取「本地 / 云端」的最大值：
 *   - 云端有真实进度时，换设备能拿到云端的
 *   - 本地是这局刚打的、云端还没同步时，不会被云端旧值打回去
 * 开发者倍率、解锁列表等数组字段仍然以本地为准。
 */
export function applyCloudToLocal(s: CloudSession): SaveData {
  const local = loadSave();
  const p = s.profile;

  const cloudBest = Array.isArray(p.stage_best) ? p.stage_best.map(Number) : [];
  const localBest = Array.isArray(local.stageBest) && local.stageBest.length === STAGE_COUNT
    ? local.stageBest
    : new Array(STAGE_COUNT).fill(0);
  const mergedBest = Array.from({ length: STAGE_COUNT }, (_, i) =>
    Math.max(localBest[i] ?? 0, cloudBest[i] ?? 0));

  // 图鉴取并集，不能取最大：云端和本地各自可能解锁了不同的条目
  const unionIds = (a?: number[], b?: number[]) =>
    [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => x - y);

  const merged: SaveData = {
    ...local,
    // 金币是「余额」不是「纪录」：必须在服务端为准，否则买完东西消费掉，
    // 刷新时 Math.max 又把云端那个更大的旧值拉回来，余额永远减不下去。
    // 其他字段（分数/进度/强化/图鉴）是累积纪录，取最大值才对。
    coins: Number(p.coins) || 0,
    stageBest: mergedBest,
    stageProgress: Math.max(Number(local.stageProgress) || 0, Number(p.stage_progress) || 0),
    // 强化等级：云端更高才采用，避免云端的 0 把本地已买的冲掉
    perm: (() => {
      const out = { ...local.perm } as Record<string, number>;
      for (const [k, v] of Object.entries(p.perm ?? {})) {
        const cloud = Number(v) || 0;
        const mine = Number(out[k]) || 0;
        if (cloud > mine) out[k] = cloud;
      }
      return out as unknown as typeof local.perm;
    })(),
    seenPartners: unionIds(local.seenPartners, p.seen_partners),
    seenEnemies: unionIds(local.seenEnemies, p.seen_enemies),
    bestTime: Math.max(Number(local.bestTime) || 0, Number(p.best_time) || 0),
  };
  writeSave(merged);
  return merged;
}

/** 登录成功后接管：与本地合并，之后每次写存档自动上云 */
export function startSession(s: CloudSession) {
  session = s;
  // 持久化 token，刷新页面后能自动恢复登录
  if (s.token) saveToken(s.token);
  setSaveHook(scheduleSync);
  applyCloudToLocal(s);
}

export function endSession() {
  const tok = session?.token ?? '';
  // 顺序不能反：
  //  1. 先把排队中的推送发掉 —— 否则登出会吞掉刚打完的成绩
  //  2. 再摘掉云同步钩子 —— 否则紧接着 clearSave() 之后的任何写档都会推空档上去
  //  3. 最后清本地存档 —— 登出即「这台机器不再持有这个账号的数据」
  flushBeforeEnd();
  setSaveHook(null);
  window.clearTimeout(timer);
  timer = undefined;
  session = null;
  clearSave();
  // 吊销服务端 token，下次不会自动登录
  void logout(tok);
}

/**
 * 启动时尝试恢复上次的登录状态。返回是否恢复成功。
 * token 无效（过期/被吊销）时静默失败，玩家看到的就是未登录。
 */
export async function tryResumeSession(): Promise<boolean> {
  if (session) return true;
  const r = await resumeSession();
  if (!r.ok) return false;
  startSession(r.data);
  return true;
}

/** 存档后调用：2 秒防抖推云端，失败静默（离线也能玩） */
export function scheduleSync(save: SaveData) {
  if (!session) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!session) return;
    void pushSave(session, {
      coins: save.coins,
      stageBest: save.stageBest,
      stageProgress: save.stageProgress,
      perm: save.perm as unknown as Record<string, number>,
      seenPartners: save.seenPartners,
      seenEnemies: save.seenEnemies,
      bestTime: save.bestTime,
    });
  }, 2000);
}

/**
 * 立即推云端，跳过防抖。
 *
 * 结算、通关这类关键写入必须用它：scheduleSync 的 2 秒定时器会被
 * 后续任意一次 writeSave 的 clearTimeout 清掉，而玩家打完一局往往
 * 立刻点「返回主页」或刷新页面（endSession 里 clearTimeout），
 * 排队中的推送就再也发不出去了 —— 表现就是「成绩没上榜」。
 */
export function flushSync() {
  if (!session) return;
  window.clearTimeout(timer);
  timer = undefined;
  const save = loadSave();
  void pushSave(session, {
    coins: save.coins,
    stageBest: save.stageBest,
    stageProgress: save.stageProgress,
    perm: save.perm as unknown as Record<string, number>,
    seenPartners: save.seenPartners,
    seenEnemies: save.seenEnemies,
    bestTime: save.bestTime,
  });
}

/**
 * endSession 前把没发出去的推送先发掉。
 * 玩家登出的瞬间不该丢掉这局成绩。
 */
export function flushBeforeEnd() {
  if (!session) return;
  flushSync();
}
