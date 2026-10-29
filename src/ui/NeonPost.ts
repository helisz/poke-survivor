import Phaser from 'phaser';

/**
 * 霓虹后处理（Neon Abyss 风格档位 A）。
 *
 * 不改任何美术素材，只靠相机后处理与叠层实现「暗底 + 高亮发光」：
 *   1. Bloom 泛光 —— 所有亮色自动溢光
 *   2. Vignette 暗角 —— 画面边缘压暗，视线收拢到中心
 *   3. ColorMatrix —— 全局降饱和压暗，奠定暗黑基调
 *   4. 扫描线 + 色差 —— 老式 CRT 的机械质感
 *
 * 全部包在 try/catch 里：Phaser WebGL 后处理在部分设备（旧 iOS /
 * 强制 Canvas 渲染）上会拿不到 pipeline，此时静默跳过，不影响游戏运行。
 */

export interface NeonOptions {
  /** 泛光度，0 关闭 */
  bloom?: number;
  /** 暗角强度 */
  vignette?: number;
  /** 全局压暗 0-1（1 = 不压暗） */
  brightness?: number;
  /** 饱和度倍数（>1 提纯色） */
  saturation?: number;
}

const FX_KEY = 'neon-post';

export function applyNeonLook(scene: Phaser.Scene, opt: NeonOptions = {}) {
  const cam = scene.cameras.main;
  const o = {
    bloom: opt.bloom ?? 0.5,
    vignette: opt.vignette ?? 0.18,
    brightness: opt.brightness ?? 1.06,
    saturation: opt.saturation ?? 1.2,
  };

  // 幂等：重复调用先清掉旧的
  clearNeonLook(scene);

  const fx = (cam as unknown as { postFX?: Phaser.GameObjects.Components.FX }).postFX;
  if (!fx) return false; // Canvas 渲染器没有 postFX，直接返回

  let ok = false;
  try {
    if (o.bloom > 0) {
      // addBloom(color, offsetX, offsetY, blurStrength, strength, steps)
      const b = fx.addBloom(0xffffff, 1, 1, 1.2, o.bloom, 4);
      (b as unknown as { name: string }).name = FX_KEY;
      ok = true;
    }
  } catch { /* 部分设备不支持 bloom */ }

  try {
    // addVignette(x, y, radius, strength, color, alpha)
    const v = fx.addVignette(0.5, 0.5, 0.85, o.vignette);
    (v as unknown as { name: string }).name = FX_KEY;
    ok = true;
  } catch { /* ignore */ }

  try {
    const cm = fx.addColorMatrix();
    // 先压暗，再提高饱和度，让霓虹色更"跳"
    cm.brightness(o.brightness, true);
    if (o.saturation !== 1) cm.saturate(o.saturation - 1, true);
    (cm as unknown as { name: string }).name = FX_KEY;
    ok = true;
  } catch { /* ignore */ }

  return ok;
}

/** 移除所有霓虹后处理（离开战斗场景 / 关闭特效时调用） */
export function clearNeonLook(scene: Phaser.Scene) {
  // shutdown 时相机可能已被销毁，此时任何属性访问都会抛异常
  const cam = scene?.cameras?.main;
  if (!cam) return;
  // 相机的后处理挂在 postPipelines 上，postFX.list 对 Camera 不生效。
  // 必须调用 false 参数版本销毁底层 render target，否则场景重启后
  // 旧管道会拿着已释放的 GL 纹理去 drawImage，抛
  // "Cannot read properties of null (reading 'drawImage')"。
  const c = cam as unknown as {
    postPipelines?: unknown[];
    resetPostPipeline?: (destroy?: boolean) => void;
  };
  try { c.resetPostPipeline?.(true); } catch { /* ignore */ }
  if (Array.isArray(c.postPipelines)) c.postPipelines.length = 0;
}

/**
 * 技能特效的霓虹发光色：
 * 把招式本色提亮并偏向青白，配合 bloom 会形成明显的发光核心。
 */
export function neonTint(color: number, lighten = 0.35): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  const l = Phaser.Display.Color.GetColor(
    Math.min(255, Math.round(c.red + (255 - c.red) * lighten)),
    Math.min(255, Math.round(c.green + (255 - c.green) * lighten)),
    Math.min(255, Math.round(c.blue + (255 - c.blue) * lighten)),
  );
  return l;
}
