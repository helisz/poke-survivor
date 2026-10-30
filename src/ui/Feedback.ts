import Phaser from 'phaser';

/**
 * 给任意可点击对象挂上统一的点击反馈。
 *
 * 只做两件事，都是「按下立刻有感、松开立刻复原」：
 *   1. 按下时变亮一点（叠一层白色 overlay），松手撤掉
 *   2. 按下时轻微缩小（0.96），松手弹回
 *
 * 为什么不用改 fillStyle：很多按钮/卡片的主色是身份信息（进化金、属性色），
 * 按下就改色会让人以为状态变了。用叠加高光 + 缩放最安全，也不碰原色。
 *
 * 已经 setInteractive 的对象直接调用即可；还没设置交互的传 true 自动补上。
 */
export function attachPressFeedback(
  obj: Phaser.GameObjects.GameObject & { x: number; y: number },
  opts: { scale?: number; alpha?: number } = {},
): void {
  const o = obj as unknown as Phaser.GameObjects.Rectangle;
  const target = o as unknown as Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Alpha;

  const maybeInput = obj as unknown as {
    input?: unknown;
    setInteractive?: (cfg?: Phaser.Types.Input.InputConfiguration) => unknown;
  };
  if (!maybeInput.input && maybeInput.setInteractive) {
    maybeInput.setInteractive({ useHandCursor: true });
  }

  const pressScale = opts.scale ?? 0.93;
  const baseAlpha = opts.alpha ?? 1;

  // 圆角面板是 Container：直接缩容器会把 hitArea 一起缩小，
  // 鼠标停在原位就被判成「移出」→ 反复触发 pointerout，按下状态丢失。
  // 所以这类对象只缩内部图形，命中的矩形尺寸始终不变。
  const rounded = obj as unknown as { popScale?: (s: number) => void };
  const usePop = typeof rounded.popScale === 'function';

  let baseScaleX = (target as unknown as { scaleX: number }).scaleX ?? 1;
  let baseScaleY = (target as unknown as { scaleY: number }).scaleY ?? 1;

  const onDown = () => {
    if (usePop) { rounded.popScale!(pressScale); return; }
    baseScaleX = (target as unknown as { scaleX: number }).scaleX ?? 1;
    baseScaleY = (target as unknown as { scaleY: number }).scaleY ?? 1;
    (target as unknown as { setScale: (x: number, y?: number) => void })
      .setScale(baseScaleX * pressScale, baseScaleY * pressScale);
    (target as unknown as { setAlpha: (a: number) => void }).setAlpha(Math.min(1, baseAlpha));
  };
  const onUp = () => {
    if (usePop) { rounded.popScale!(1); return; }
    (target as unknown as { setScale: (x: number, y?: number) => void })
      .setScale(baseScaleX, baseScaleY);
    (target as unknown as { setAlpha: (a: number) => void }).setAlpha(baseAlpha);
  };

  obj.on('pointerdown', onDown);
  obj.on('pointerup', onUp);
  obj.on('pointerout', onUp);
}

/**
 * 容器版：整张卡片一起缩。卡片内部的子对象是容器坐标，
 * 缩放容器即可获得「整块被按下去」的手感。
 */
export function attachContainerPressFeedback(
  container: Phaser.GameObjects.Container,
  opts: { scale?: number; alpha?: number } = {},
): void {
  const pressScale = opts.scale ?? 0.97;
  let baseScaleX = container.scaleX;
  let baseScaleY = container.scaleY;

  const onDown = () => {
    baseScaleX = container.scaleX;
    baseScaleY = container.scaleY;
    container.setScale(baseScaleX * pressScale, baseScaleY * pressScale);
    container.setAlpha(opts.alpha ?? 0.88);
  };
  const onUp = () => {
    container.setScale(baseScaleX, baseScaleY);
    container.setAlpha(1);
  };

  container.on('pointerdown', onDown);
  container.on('pointerup', onUp);
  container.on('pointerout', onUp);
}
