/**
 * 真·全屏（沉浸式）管理。
 *
 * 目标：手机 / 平板上进游戏后自动隐藏浏览器地址栏/工具栏，画布铺满整屏。
 *
 * 三档策略，按可用性自动降级：
 *   1. requestFullscreen()（标准 API）—— 安卓 Chrome / 桌面 / 平板都能用
 *   2. webkitRequestFullscreen() —— iOS Safari 老版本、部分国产浏览器
 *   3. 都不支持 → 不动作，交给 CSS + 100dvh 铺满（比如 iPhone 的 Safari，
 *      它压根不开放元素全屏，只能靠 100dvh + visualViewport 校准）
 *
 * 设计约束（踩过的坑）：
 *   - 全屏请求必须发生在「用户手势」的同步调用栈里，否则被浏览器拒绝。
 *     所以 requestFullscreen 只能挂在 pointerdown / click 上，不能放在
 *     scene create 里（延迟执行）。这里提供 enter() 供用户手势直接调用。
 *   - 全屏切换会触发 resize / visualViewport.resize，main.ts 里的
 *     syncViewport 会自动重算画布尺寸 —— 不必在这里重复 resize。
 *   - 切到前台/后台（visibilitychange）不要反复进出全屏：iOS 上全屏状态
 *     在切后台后可能被系统收回，回来时若处于游戏中再补一次。
 */

type FsDoc = Document & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

/** 当前是否已经处于全屏（含 webkit 前缀）。 */
export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** 浏览器是否具备元素全屏能力（iOS Safari 返回 false）。 */
export function fullscreenSupported(): boolean {
  const el = document.documentElement as FsEl;
  return !!(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.msRequestFullscreen
  );
}

/**
 * 进入全屏。**必须在用户手势的同步调用栈里调用**。
 * 不支持 / 被拒绝时静默降级（返回 false），不抛错、不弹提示。
 */
export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true;
  const el = document.documentElement as FsEl;
  const root = document.getElementById('game') ?? el;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      return true;
    }
    if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
      return true;
    }
  } catch (e) {
    // 被浏览器拒绝（非手势调用 / 用户禁止 / iframe 未授权）——静默降级
    void root;
    void e;
    return false;
  }
  return false;
}

/** 退出全屏（回到菜单时可调，但保持全屏体验更佳，默认不强制退出）。 */
export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return;
  const d = document as FsDoc;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    /* ignore */
  }
}
