import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

/**
 * 构建标识三段式，主菜单底部显示，用来确认手机跑的是不是最新版：
 *
 *   <iter> · <date> <time> · <iso> · <tag> · #<epoch>
 *   e.g. r64 · 2026-10-30 10:08:21 · 2026-10-30T100821+0800 · v0.4 · #1793326101
 *
 *  iter  git 提交总数，每次 commit 自动 +1，能直接看出迭代了多少次
 *  tag   最近一次打的版本标签（v0.1 ~ v0.4）；没有 tag 时退化为 short hash
 *  epoch 构建时刻的 Unix 秒，跨时区唯一，用来判断缓存新旧
 */
function git(cmd: string, fallback = ''): string {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback; }
  catch { return fallback; }
}

function buildStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  // 本地时区偏移，形如 +0800
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const off = `${sign}${pad(Math.floor(Math.abs(offMin) / 60))}${pad(Math.abs(offMin) % 60)}`;

  const iter = parseInt(git('git rev-list --count HEAD', '0'), 10) || 0;
  // tag 优先，没有就退化为 short hash
  const tag = git('git describe --tags --abbrev=0', '') || git('git rev-parse --short HEAD', 'dev');

  return {
    iter,
    tag,
    iso: `${y}-${mo}-${da}T${hh}${mi}${ss}${off}`,
    date: `${y}-${mo}-${da}`,
    time: `${hh}:${mi}:${ss}`,
    epoch: Math.floor(d.getTime() / 1000),
  };
}

const STAMP = buildStamp();

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(`r${STAMP.iter}-${STAMP.tag}`),
    __BUILD_STAMP__: JSON.stringify(STAMP),
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    open: false,
  },
});
