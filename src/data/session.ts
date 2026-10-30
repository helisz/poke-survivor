import { loadSave, writeSave, setSaveHook, type SaveData } from './stats';
import { pushSave, type CloudSession } from './cloud';

/**
 * 当前登录会话（内存级）。刷新页面即失效，需要重新登录 ——
 * 换设备场景本来就该重新输密码，不为了省事把哈希写进 localStorage。
 */
let session: CloudSession | null = null;
let timer: number | undefined;

export function currentSession() { return session; }
export function isLoggedIn() { return !!session; }

/** 云端 profile → 本地 SaveData。云端为准，本地开发倍率保留不动 */
export function applyCloudToLocal(s: CloudSession): SaveData {
  const local = loadSave();
  const p = s.profile;
  const merged: SaveData = {
    ...local,
    coins: Number(p.coins) || 0,
    stageBest: Array.isArray(p.stage_best) ? p.stage_best.map(Number) : [0, 0, 0, 0, 0, 0],
    stageProgress: Number(p.stage_progress) || 0,
    perm: { ...local.perm, ...(p.perm ?? {}) },
    seenPartners: Array.isArray(p.seen_partners) ? p.seen_partners.map(Number) : [],
    seenEnemies: Array.isArray(p.seen_enemies) ? p.seen_enemies.map(Number) : [],
    bestTime: Number(p.best_time) || 0,
  };
  writeSave(merged);
  return merged;
}

/** 登录成功后接管：云端覆盖本地，之后每次写存档自动上云 */
export function startSession(s: CloudSession) {
  session = s;
  setSaveHook(scheduleSync);
  applyCloudToLocal(s);
}

export function endSession() {
  session = null;
  setSaveHook(null);
  window.clearTimeout(timer);
  timer = undefined;
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
