/**
 * 全局静音开关：同时管音效（Sfx）和音乐（Bgm），状态存 localStorage。
 *
 * 为什么不各自存一份：玩家心里只有「有没有声音」这一个开关。
 * 分成两个独立状态会出现「静了音乐但音效还在响」的割裂感，
 * 而且两个按钮图标会互相矛盾。
 */

import { Sfx } from './Sfx';
import { Bgm } from './Bgm';

const KEY = 'ps-muted-v1';

let muted = false;
const listeners = new Set<(m: boolean) => void>();

/** 启动时读回上次的设置（在任何 init 之前调用） */
export function loadMuteSetting() {
  try { muted = localStorage.getItem(KEY) === '1'; } catch { /* 隐私模式忽略 */ }
  Sfx.setMuted(muted);
  Bgm.setMuted(muted);
  return muted;
}

export function isMuted() { return muted; }

export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* 忽略 */ }
  Sfx.setMuted(m);
  Bgm.setMuted(m);
  for (const fn of listeners) fn(m);
}

export function toggleMuted() {
  setMuted(!muted);
  return muted;
}

/** 订阅变化，返回取消订阅函数。两个按钮靠它互相同步图标 */
export function onMuteChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
