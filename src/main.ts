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

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0f14',
  pixelArt: true,
  roundPixels: true,
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

