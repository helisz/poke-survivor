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
import { loadMuteSetting } from './systems/Audio';
import { registerScene } from './systems/SceneFlow';

/**
 * 移动端真实可用视口。
 *
 * 踩过的坑：首屏直接用 visualViewport 取尺寸，iOS Safari 在地址栏尚未收起、
 * 或者页面刚插入 DOM 时，会返回一个偏小的宽度/高度。Phaser 按这个小尺寸
 * 初始化画布，浏览器再把画布拉伸铺满 #game → 画面「被放大」，
 * 必须刷新一次（此时地址栏状态稳定）才恢复正常。
 *
 * 所以规则改成：
 *   1. 宽度恒用 innerWidth —— 它不受地址栏影响，最稳。
 *   2. 高度取 innerHeight 与 visualViewport.height 的较小值 —— 地址栏展开时
 *      两者一致，键盘弹出时 visualViewport 更小，正好取到真正可见的那块。
 *   3. 尺寸取整并做下限保护，避免拿到 0 或负值把画布搞崩。
 */
function viewportSize() {
  const vv = (window as any).visualViewport;
  const iw = window.innerWidth || 0;
  const ih = window.innerHeight || 0;
  const vvh = vv?.height || ih;

  // 宽度只信 innerWidth；visualViewport.width 在 iOS 首屏会偏小
  const w = Math.max(200, Math.round(iw || vv?.width || 0));
  // 高度取更小的那个（键盘弹出时 vv 更小），但不超过 innerHeight
  const h = Math.max(200, Math.round(Math.min(ih || vvh, vvh)));

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

// 音效 / 音乐：浏览器要求首次用户手势后才能出声
// 静音设置要在任何播放之前读回
loadMuteSetting();

let audioReady = false;
const initAudio = () => {
  if (audioReady) return;
  audioReady = true;
  Sfx.init();
  Bgm.init();
};

// 先乐观试一次：部分浏览器允许直接播 —— 桌面 Chrome 的站内互动分数够了、
// 或者用户把站点加到了白名单/装成 PWA，页面一打开就能出声，这才是「打开就放」。
// Bgm.init() 内部 play() 被拒会静默失败，不会报错，所以试一次没有副作用。
Bgm.init();

// 被拦时挂到第一次真实用户激活上。
// 浏览器只认激活型手势：pointerdown / touchstart / keydown / click。
// pointermove、scroll 这类「被动事件」不算数，挂上去也不会解锁，别放进来。
// 用 pointerdown 而不是 pointerup：按下就出声，不用等抬手。
const gestureEvents = ['pointerdown', 'touchstart', 'touchend', 'keydown', 'click'] as const;
for (const ev of gestureEvents) {
  window.addEventListener(ev, initAudio, { once: true, passive: true });
}

// 调试句柄：控制台 __PS__.scene.getScene('Game') 可查状态
(window as any).__PS__ = game;

/**
 * 全局点击音。
 *
 * 逐个头写 `Sfx.click()` 会一直在漏：新加一个按钮、改一处卡片就忘，
 * 而且游戏里有些点击是 hit 层代理的，压根不经过按钮自己的 handler。
 * 所以改成在 canvas 上统一监听：任何一次按下都出一声，音效内部自带节流，
 * 同帧连点不会糊成一片。
 */
game.canvas?.addEventListener('pointerdown', () => { Sfx.click(); }, { passive: true });

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
    // Boot 还在 loading 时不要 resize：会打断加载流程，场景停在 LOADING 永远进不去
    if (game.scene.isActive('Boot') && !game.scene.isActive('Menu')) return;
    if (Math.abs(cur.width - w) > 1 || Math.abs(cur.height - h) > 1) {
      game.scale.resize(w, h);
    }
  }, 120);
}
window.addEventListener('resize', syncViewport);
window.addEventListener('orientationchange', syncViewport);
(window as any).visualViewport?.addEventListener('resize', syncViewport);
// 首屏校准：上面的监听只在「尺寸变化」时才跑，而画布是用启动瞬间的 vp0 建的。
// iOS 如果那一瞬间读到了暂态尺寸，之后就算不再 resize，画面也会一直放大着，
// 必须刷新才好 —— 这就是用户看到的 bug。所以启动后主动校一次。
//
// 注意：不能在 Boot 还在 loading 时调 game.scale.resize()，
// 那会把 Boot 的加载流程打断（场景永远停在 LOADING 状态，卡在 LOADING… 界面）。
// 所以等 Boot 走到 Menu 之后再校。
function calibrateOnce(delay: number) {
  window.setTimeout(() => {
    if (keyboardOpen()) return;
    const cur = game.scale.gameSize;
    // 只在「非加载中」才动尺寸
    const booting = game.scene.isActive('Boot') && !game.scene.isActive('Menu');
    if (booting) return;
    const { w, h } = viewportSize();
    if (Math.abs(cur.width - w) > 1 || Math.abs(cur.height - h) > 1) {
      game.scale.resize(w, h);
    }
  }, delay);
}
// Menu 真正跑起来之后才校准（此时 Boot 已退场，resize 不会打断任何加载）
game.scene.getScene('Menu')?.events.once('create', () => {
  calibrateOnce(120);
  calibrateOnce(650);   // 等地址栏收起动画结束再补一次
});
// 输入框失焦后可能不再触发 resize，兜一次
document.addEventListener('focusout', () => window.setTimeout(syncViewport, 60));

// 隐藏 loading
game.events.once(Phaser.Core.Events.READY, () => {
  const el = document.getElementById('boot');
  if (el) el.remove();
});

export default game;

