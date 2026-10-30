import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 没有配置环境变量时，全部接口降级为「未启用」，游戏照常纯本地玩 */
export const cloudEnabled = !!(URL && ANON);

const sb = cloudEnabled ? createClient(URL!, ANON!, { auth: { persistSession: false } }) : null;

/** 云端返回给前端的玩家资料（不含密码哈希） */
export interface CloudProfile {
  username: string;
  coins: number;
  stage_best: number[];
  stage_progress: number;
  perm: Record<string, number>;
  seen_partners: number[];
  seen_enemies: number[];
  best_time: number;
}

export interface CloudSession {
  username: string;
  /**
   * 服务端签发的会话 token。刷新页面后从 localStorage 读回来恢复登录。
   * 不是密码也不是 bcrypt 哈希 —— 泄露只能读一个人自己的存档，
   * 而且能随时吊销（ps_logout）。哈希只在登录那一次用于本地比对密码，
   * 不进内存之外的任何地方。
   */
  token: string;
  /** 仅登录/注册当次使用，用于本地 bcrypt 比对；不持久化 */
  hash?: string;
  profile: CloudProfile;
}

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'exists' | 'not_found' | 'bad_password' | 'bad_username' | 'network' | 'disabled' };

const LOCAL_SESSION_KEY = 'ps-session-v1';

/** 持久化的会话 token 键 */
const TOKEN_KEY = 'ps-token-v1';

/** 读回上次会话的 token（刷新页面恢复登录用） */
export function loadToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}

export function saveToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* 隐私模式下忽略 */ }
}

/** 记住上次登录的用户名（为了下次省得重打），但哈希只在内存里 */
export function rememberedUsername(): string {
  try { return localStorage.getItem(LOCAL_SESSION_KEY) ?? ''; } catch { return ''; }
}

export function rememberUsername(name: string) {
  try {
    if (name) localStorage.setItem(LOCAL_SESSION_KEY, name);
    else localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch { /* 隐私模式下忽略 */ }
}

/** 4 位数字密码 → bcrypt。cost 10，浏览器约 60~100ms */
export function hashPassword(pw: string): string {
  return bcrypt.hashSync(pw, 10);
}

function normalize(name: string) {
  return name.trim().toLowerCase();
}

async function callRpc(fn: string, body: Record<string, unknown>): Promise<unknown> {
  if (!sb) throw new Error('cloud disabled');
  const { data, error } = await sb.rpc(fn, body);
  if (error) throw error;
  return data;
}

/** 注册：成功即视为登录（返回带 hash 的会话） */
export async function register(username: string, password: string): Promise<CloudResult<CloudSession>> {
  if (!sb) return { ok: false, reason: 'disabled' };
  const hash = hashPassword(password);
  try {
    const r = await callRpc('ps_register', {
      p_username: normalize(username), p_hash: hash,
    }) as { ok: boolean; reason?: string; profile?: CloudProfile; token?: string };
    if (!r?.ok) {
      const reason = r?.reason === 'exists' ? 'exists'
        : r?.reason === 'bad_username' ? 'bad_username' : 'network';
      return { ok: false, reason };
    }
    return {
      ok: true,
      data: {
        username: r.profile!.username, hash, token: r.token ?? '',
        profile: r.profile!,
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** 登录：服务器回传哈希，本地用 bcrypt 比对 */
export async function login(username: string, password: string): Promise<CloudResult<CloudSession>> {
  if (!sb) return { ok: false, reason: 'disabled' };
  try {
    const r = await callRpc('ps_login', {
      p_username: normalize(username),
    }) as { ok: boolean; pass_hash?: string; profile?: CloudProfile; token?: string };
    if (!r?.ok || !r.pass_hash) return { ok: false, reason: 'not_found' };
    if (!bcrypt.compareSync(password, r.pass_hash)) return { ok: false, reason: 'bad_password' };
    return {
      ok: true,
      data: {
        username: r.profile!.username, hash: r.pass_hash, token: r.token ?? '',
        profile: r.profile!,
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** 排行榜条目 */
export interface RankRow {
  username: string;
  stage_progress?: number;
  best_score: number;
}

/** 通关最高关 top10 */
export async function fetchTopStages(): Promise<RankRow[]> {
  if (!sb) return [];
  try {
    const r = await callRpc('ps_top_stages', {}) as RankRow[];
    return Array.isArray(r) ? r : [];
  } catch { return []; }
}

/** 单关最高分 top10 */
export async function fetchTopScores(): Promise<RankRow[]> {
  if (!sb) return [];
  try {
    const r = await callRpc('ps_top_scores', {}) as RankRow[];
    return Array.isArray(r) ? r : [];
  } catch { return []; }
}

/** 用已保存的 token 恢复会话（刷新页面后调用） */
export async function resumeSession(): Promise<CloudResult<CloudSession>> {
  if (!sb) return { ok: false, reason: 'disabled' };
  const token = loadToken();
  if (!token) return { ok: false, reason: 'not_found' };
  try {
    const r = await callRpc('ps_session_profile', { p_token: token }) as {
      ok: boolean; username?: string; profile?: CloudProfile; reason?: string;
    };
    if (!r?.ok || !r.profile) {
      // token 失效（过期/被吊销/换库）：清掉，别让玩家一直看到「登录中」卡住
      saveToken('');
      return { ok: false, reason: r?.reason === 'expired' ? 'not_found' : 'not_found' };
    }
    return {
      ok: true,
      data: { username: r.profile.username, token, profile: r.profile },
    };
  } catch {
    // 网络问题不清 token，下次刷新还有机会
    return { ok: false, reason: 'network' };
  }
}

/** 登出：吊销服务端 token 并清掉本地保存 */
export async function logout(token: string): Promise<void> {
  saveToken('');
  if (!sb || !token) return;
  try { await callRpc('ps_logout', { p_token: token }); } catch { /* 离线也无所谓 */ }
}

/** 存档上云。失败静默（离线也能玩，下次有机会再传） */
export async function pushSave(session: CloudSession, data: {
  coins: number; stageBest: number[]; stageProgress: number;
  perm: Record<string, number>; seenPartners: number[]; seenEnemies: number[]; bestTime: number;
}): Promise<boolean> {
  if (!sb) return false;
  // token 为空说明是旧会话（没有可用的持久凭证），不上云，避免静默失败
  if (!session.token) return false;
  try {
    const r = await callRpc('ps_save_by_token', {
      p_token: session.token,
      p_data: {
        coins: data.coins,
        stage_best: data.stageBest,
        stage_progress: data.stageProgress,
        perm: data.perm,
        seen_partners: data.seenPartners,
        seen_enemies: data.seenEnemies,
        best_time: data.bestTime,
      },
    }) as { ok: boolean };
    return !!r?.ok;
  } catch {
    return false;
  }
}
