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
  /** bcrypt 哈希，保存时回传给服务器验身，不落 localStorage */
  hash: string;
  profile: CloudProfile;
}

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'exists' | 'not_found' | 'bad_password' | 'bad_username' | 'network' | 'disabled' };

const LOCAL_SESSION_KEY = 'ps-session-v1';

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
    }) as { ok: boolean; reason?: string; profile?: CloudProfile };
    if (!r?.ok) {
      const reason = r?.reason === 'exists' ? 'exists'
        : r?.reason === 'bad_username' ? 'bad_username' : 'network';
      return { ok: false, reason };
    }
    return { ok: true, data: { username: r.profile!.username, hash, profile: r.profile! } };
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
    }) as { ok: boolean; pass_hash?: string; profile?: CloudProfile };
    if (!r?.ok || !r.pass_hash) return { ok: false, reason: 'not_found' };
    if (!bcrypt.compareSync(password, r.pass_hash)) return { ok: false, reason: 'bad_password' };
    return { ok: true, data: { username: r.profile!.username, hash: r.pass_hash, profile: r.profile! } };
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

/** 存档上云。失败静默（离线也能玩，下次有机会再传） */
export async function pushSave(session: CloudSession, data: {
  coins: number; stageBest: number[]; stageProgress: number;
  perm: Record<string, number>; seenPartners: number[]; seenEnemies: number[]; bestTime: number;
}): Promise<boolean> {
  if (!sb) return false;
  try {
    const r = await callRpc('ps_save', {
      p_username: session.username,
      p_hash: session.hash,
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
