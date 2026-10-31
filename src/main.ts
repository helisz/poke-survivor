import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MapSelectScene } from './scenes/MapSelectScene';
import { TraitSelectScene } from './scenes/TraitSelectScene';
import { PartnerSelectScene } from './scenes/PartnerSelectScene';
import { ShopScene } from './scenes/ShopScene';
import { DexScene } from './scenes/DexScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { LevelUpScene } from './scenes/LevelUpScene';
import { GameOverScene } from './scenes/GameOverScene';
import { Sfx } from './systems/Sfx';
import { Bgm } from './systems/Bgm';
import { registerScene } from './systems/SceneFlow';

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
  // 登录表单用原生 input 覆盖（手机上才能唤起数字键盘）
  dom: { createContainer: true },
  // 像素风：全局用 NEAREST 采样（文字也跟随像素风，这是初始设定）
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
  scene: [BootScene, MenuScene, MapSelectScene, TraitSelectScene, PartnerSelectScene, ShopScene, DexScene, GameScene, UIScene, LevelUpScene, GameOverScene],
};

const game = new Phaser.Game(config);

// 注册可重开场景的工厂：SceneFlow 用它 new 干净实例，
// 避免复用 Phaser 的 Scene 对象带来的脏状态（见 SceneFlow.ts 注释）。
registerScene('Menu', () => new MenuScene());
registerScene('MapSelect', () => new MapSelectScene());
registerScene('TraitSelect', () => new TraitSelectScene());
registerScene('PartnerSelect', () => new PartnerSelectScene());
registerScene('Shop', () => new ShopScene());
// Dex 漏注册会让 goTo 走 else 分支：前面已经把其它场景全 stop 了，
// mgr.start 又因旧实例状态卡住 → 全场景停摆、纯黑屏。
registerScene('Dex', () => new DexScene());
registerScene('Game', () => new GameScene());

// 音效：浏览器要求首次用户手势后才能出声
const initAudio = () => { Sfx.init(); Bgm.init(); };
window.addEventListener('pointerdown', initAudio, { once: true });
window.addEventListener('touchstart', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });

// 调试句柄：控制台 __PS__.scene.getScene('Game') 可查状态
(window as any).__PS__ = game;

// 移动端：浏览器工具栏收放 / 旋转 → 重新按真实视口调整画布
//
// 软键盘是例外：输入框聚焦时 visualViewport 高度会骤降（844 → 400 多），
// 如果跟着 resize，所有按 height 居中的 UI 会一起塌缩。
// 判定方式：有 input/textarea 聚焦，且高度掉了超过 25% → 认为是键盘，冻结画布。
let resizeTimer: number | undefined;
let frozenSize: { w: number; h: number } | null = null;

function keyboardOpen() {
  const el = document.activeElement;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
  if (!typing) return false;
  const vv = (window as any).visualViewport;
  if (!vv) return false;
  // 视口高度比窗口矮一截，说明键盘吃掉了一块
  return vv.height < window.innerHeight * 0.75;
}

function syncViewport() {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    // 键盘开着：画布保持键盘弹出前的尺寸，UI 不动
    if (keyboardOpen()) {
      if (!frozenSize) {
        frozenSize = { w: game.scale.gameSize.width, h: game.scale.gameSize.height };
      }
      return;
    }

    // 键盘收起：如果之前冻结过，恢复一次
    if (frozenSize) {
      frozenSize = null;
    }

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
// 输入框失焦后可能不再触发 resize，兜一次
document.addEventListener('focusout', () => window.setTimeout(syncViewport, 60));

// 隐藏 loading
game.events.once(Phaser.Core.Events.READY, () => {
  const el = document.getElementById('boot');
  if (el) el.remove();
});

export default game;

