import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { GameOverScene } from './scenes/GameOverScene';

/**
 * 移动端真实可用高度。
 * iOS/Android 地址栏 + 底部工具栏会吃掉视口，100vh 拿的是"工具栏隐藏时的最大高度"，
 * 导致底部 UI 被工具栏盖住。visualViewport 给出真正可见的那块，最准。
 */
function viewportSize() {
  const vv = (window as any).visualViewport;
  const w = Math.round(vv?.width || window.innerWidth);
  const h = Math.round(vv?.height || window.innerHeight);
  // 同步写 CSS 变量，让 #game 容器跟着变
  document.documentElement.style.setProperty('--vh', h + 'px');
  return { w, h };
}

const vp0 = viewportSize();

// 按设备像素比渲染：Retina/高 DPI 屏幕上文字才不会糊。
// 关键点是 zoom 保持 1（游戏坐标仍是逻辑像素），靠 resolution 提高 canvas 实际像素密度。
const DPR = Math.min(window.devicePixelRatio || 1, 3);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0f14',
  // 全局关闭 NEAREST：pixelArt:true 会把文字也一起做成硬边像素字。
  // 像素精灵单独用 texture.setFilter(NEAREST) 保持硬边，见 BootScene。
  pixelArt: false,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: vp0.w,
    height: vp0.h,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [BootScene, MenuScene, GameScene, UIScene, LevelUpScene, GameOverScene],
};

const game = new Phaser.Game(config);

/**
 * 提高 canvas 渲染分辨率（Retina / 高 DPI 屏让文字清晰）。
 * Phaser 3 的 GameConfig 没有 resolution，正确做法是直接放大 backing store，
 * 再用 CSS 把显示尺寸压回逻辑像素 —— 浏览器会按 DPR 重采样，文字变锐利。
 */
function applyHiDPI() {
  if (DPR <= 1) return;
  const w = game.scale.width, h = game.scale.height;
  const c = game.canvas;
  c.width = Math.round(w * DPR);
  c.height = Math.round(h * DPR);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  // 渲染器按新的 backing store 尺寸工作，但不改游戏逻辑坐标
  (game.renderer as any).resize?.(Math.round(w * DPR), Math.round(h * DPR), false);
}
game.events.once(Phaser.Core.Events.READY, applyHiDPI);

// 调试句柄：控制台 __PS__.scene.getScene('Game') 可查状态
(window as any).__PS__ = game;

// 移动端：浏览器工具栏收放 / 旋转 / 软键盘 → 重新按真实视口调整画布
let resizeTimer: number | undefined;
function syncViewport() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const { w, h } = viewportSize();
    const cur = game.scale.gameSize;
    if (Math.abs(cur.width - w) > 1 || Math.abs(cur.height - h) > 1) {
      game.scale.resize(w, h);
      // 同步按 DPR 重设 backing store，否则缩放后文字会糊回去
      if (DPR > 1) {
        const c = game.canvas;
        c.width = Math.round(w * DPR);
        c.height = Math.round(h * DPR);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        (game.renderer as any).resize?.(Math.round(w * DPR), Math.round(h * DPR), false);
      }
    }
  }, 120);
}
window.addEventListener('resize', syncViewport);
window.addEventListener('orientationchange', syncViewport);
(window as any).visualViewport?.addEventListener('resize', syncViewport);

// 隐藏 loading
game.events.once(Phaser.Core.Events.READY, () => {
  const el = document.getElementById('boot');
  if (el) el.remove();
});

export default game;

