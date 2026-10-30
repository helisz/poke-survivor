/**
 * 按需加载宝可梦贴图。
 *
 * 为什么不在 Boot 一次性全加载：166 张 × 每张几 KB，首屏要多等几百毫秒到
 * 几秒，还白烧流量 —— 而主菜单只需要几只当背景。所以改成：
 *   · Boot     —— 只加载主菜单背景那几只（10 只）+ 训练家 + logo
 *   · 进关/选伙伴/图鉴翻页 —— 用到谁加载谁，走 Phaser loader，并发安全
 *
 * 关键约束：Phaser 的 `texture.exists(key)` 在加载完成前返回 false。
 * 调用方原本就有 exists 判断，缺图不会崩，只是暂时不显示 —— 加载完成后
 * 需要重绘一次，所以这里提供 onReady 回调给调用方刷新。
 */
import Phaser from 'phaser';

/** 已经发起过加载的 key，避免重复入队。 */
const inflight = new Set<string>();

/** 已经加载完成、可直接使用。 */
const ready = new Set<string>();

/** 等待某个 key 加载完成的回调。 */
const waiters = new Map<string, Array<() => void>>();

function keyOf(id: number): string {
  return `pk_${id}`;
}

function pathOf(id: number): string {
  return `assets/pokemon/${String(id).padStart(3, '0')}.png`;
}

/** 该贴图现在就能直接画吗（已加载完成）。 */
export function isSpriteReady(scene: Phaser.Scene, id: number): boolean {
  const key = keyOf(id);
  if (ready.has(key)) return true;
  if (scene.textures.exists(key)) {
    ready.add(key);
    return true;
  }
  return false;
}

/**
 * 确保这批贴图可用。
 *
 * @param ids      需要的编号
 * @param onReady  全部到位后回调（用于刷新已绘制的界面）
 * @returns 是否全部已就绪（同步返回）
 */
export function ensureSprites(
  scene: Phaser.Scene,
  ids: number[],
  onReady?: () => void,
): boolean {
  const missing: number[] = [];
  for (const id of ids) {
    const key = keyOf(id);
    if (ready.has(key) || scene.textures.exists(key)) {
      ready.add(key);
      continue;
    }
    if (inflight.has(key)) continue;
    missing.push(id);
  }

  const pendingWait = new Set<string>();
  for (const id of ids) {
    const key = keyOf(id);
    if (!ready.has(key)) pendingWait.add(key);
  }

  if (onReady && pendingWait.size > 0) {
    let left = pendingWait.size;
    for (const key of pendingWait) {
      const list = waiters.get(key) ?? [];
      list.push(() => {
        left -= 1;
        if (left === 0) onReady();
      });
      waiters.set(key, list);
    }
  }

  if (missing.length === 0) {
    return pendingWait.size === 0;
  }

  const loader = scene.load;
  for (const id of missing) {
    const key = keyOf(id);
    inflight.add(key);
    loader.image(key, pathOf(id));
  }

  loader.once('complete', () => {
    for (const id of missing) {
      const key = keyOf(id);
      inflight.delete(key);
      ready.add(key);
      const list = waiters.get(key);
      if (list) {
        waiters.delete(key);
        for (const fn of list) fn();
      }
    }
  });

  loader.start();
  return false;
}

/** 测试用：重置内部缓存。 */
export function __resetLazySprites(): void {
  inflight.clear();
  ready.clear();
  waiters.clear();
}
