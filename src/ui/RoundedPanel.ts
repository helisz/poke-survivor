import Phaser from 'phaser';

/**
 * 圆角面板 + 投影。
 *
 * Phaser 的 Rectangle 是硬边矩形，没有圆角。
 * 想拿圆角只能画 Graphics（fillRoundedRect），
 * 但 Graphics 不能直接 setStrokeStyle/改 fill，需要自己包一层。
 *
 * 这里返回一个「看起来像按钮」的对象，接口跟 Rectangle 尽量一致
 * （setFillStyle / setStrokeStyle / setAlpha / setScale / setInteractive），
 * 现有代码换过来基本不用改调用方式。
 */

export interface RoundedRectOpts {
  /** 圆角半径，默认按短边取 22% */
  radius?: number;
  /** 投影颜色，默认纯黑 */
  shadowColor?: number;
  /** 投影不透明度，硬阴影默认给满 1 */
  shadowAlpha?: number;
  /** 投影下移像素，默认 3 */
  shadowY?: number;
  /** 投影右移像素，默认 0 */
  shadowDX?: number;
}

export class RoundedPanel extends Phaser.GameObjects.Container {
  private face: Phaser.GameObjects.Graphics;
  private shadowG: Phaser.GameObjects.Graphics;
  private pw: number;
  private ph: number;
  private radius: number;
  private fill: number;
  private fillAlpha: number;
  private strokeColor?: number;
  private strokeAlpha = 1;
  private strokeWidth = 0;
  private shadowColor: number;
  private shadowAlpha: number;
  private shadowY: number;
  private shadowDX: number;
  /** 给外部读尺寸用（原 Rectangle 有 width/height） */
  rw: number;
  rh: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    fillAlpha = 1,
    opts: RoundedRectOpts = {},
  ) {
    super(scene, x, y);
    this.pw = w;
    this.ph = h;
    this.rw = w;
    this.rh = h;
    this.radius = opts.radius ?? Math.min(w, h) * 0.22;
    this.fill = fill;
    this.fillAlpha = fillAlpha;
    this.shadowColor = opts.shadowColor ?? 0x000000;
    // 硬阴影：纯黑整块，只错开几像素。不透明度给满，
    // 想更轻就调偏移量，而不是调 alpha（那种会变灰雾）。
    this.shadowAlpha = opts.shadowAlpha ?? 1;
    this.shadowY = opts.shadowY ?? 3;
    this.shadowDX = opts.shadowDX ?? 0;

    this.shadowG = scene.add.graphics();
    this.face = scene.add.graphics();
    this.add([this.shadowG, this.face]);
    this.redraw();

    // 命中区域必须显式给出以中心为原点的矩形。
    // Container 的 setSize 只改宽高，input 默认生成的 hitArea 是 (0,0,w,h)，
    // 会整体偏到右下角 → 按钮「看得见点不着」。
    this.setSize(w, h);
    scene.add.existing(this);
  }

  /** 重画：先投影（多层近似模糊），再本体 */
  redraw() {
    const w = this.pw, h = this.ph, radius = this.radius;
    const x0 = -w / 2;
    const y0 = -h / 2;

    // --- 投影：单层硬阴影 ---
    // 用整块不透明黑往下错一点，边缘跟着圆角走。
    // 不做任何模糊/扩散 —— 柔化多层在深色底上会糊成一圈灰雾，
    // 像素风就该是干净的硬边。
    this.shadowG.clear();
    this.shadowG.fillStyle(this.shadowColor, this.shadowAlpha);
    this.shadowG.fillRoundedRect(
      x0 + this.shadowDX,
      y0 + this.shadowY,
      w,
      h,
      radius,
    );

    // --- 本体 ---
    this.face.clear();
    this.face.fillStyle(this.fill, this.fillAlpha);
    this.face.fillRoundedRect(x0, y0, w, h, radius);
    if (this.strokeWidth > 0 && this.strokeColor !== undefined) {
      this.face.lineStyle(this.strokeWidth, this.strokeColor, this.strokeAlpha);
      this.face.strokeRoundedRect(x0, y0, w, h, radius);
    }
  }

  /**
   * 覆写 setSize：外部（技能栏）会在 narrow/宽屏切换时按新尺寸重设，
   * 内部分辨率必须跟着重画，否则 rw/rh 还是旧值，绘制出来的块比布局大，
   * 相邻格子就会视觉重叠。
   */
  setSize(w: number, h?: number) {
    this.pw = w;
    this.ph = h ?? w;
    this.rw = this.pw;
    this.rh = this.ph;
    super.setSize(this.pw, this.ph);
    this.fixHitArea();
    this.redraw();
    return this;
  }

  setFillStyle(color: number, alpha = 1) {
    this.fill = color;
    this.fillAlpha = alpha;
    this.redraw();
    return this;
  }

  setStrokeStyle(width: number, color: number, alpha = 1) {
    this.strokeWidth = width;
    this.strokeColor = color;
    this.strokeAlpha = alpha;
    this.redraw();
    return this;
  }

  /**
   * 覆写 setInteractive：Container 默认按 (0,0,w,h) 生成命中矩形，
   * 那是左上角坐标，而容器里的内容是以中心为原点的 —— 结果命中区偏到右下角，
   * 表现就是「按钮看得见但点不着」。这里强制用 -w/2, -h/2 起算。
   */
  setInteractive(
    hitArea?: Phaser.Types.Input.InputConfiguration | unknown,
    callback?: Phaser.Types.Input.HitAreaCallback,
    dropZone?: boolean,
  ) {
    // 幂等：已经可交互就只更新光标，不再重建 InteractiveObject。
    // 重建会清掉外部已经挂上的 pointerdown 等监听器，
    // 表现就是「点一次之后再怎么点都没反应」。
    const self = this as unknown as { input: Phaser.Types.Input.InteractiveObject | null };
    if (self.input) {
      self.input.cursor = 'pointer';
      return this;
    }
    // 不给 super 传几何体：Container 会忽略它，改用 setSize(w,h) 生成
    // (0,0,w,h) —— 那是左上角坐标，而容器内容以中心为原点，
    // 结果只有左下四分之一能点中。所以 setInteractive 之后直接改写 hitArea。
    super.setInteractive({ useHandCursor: true });
    this.fixHitArea();
    const cursor = hitArea && (hitArea as Phaser.Types.Input.InputConfiguration).useHandCursor === false
      ? 'default' : 'pointer';
    this.applyCursor(cursor);
    void callback;
    return this;
  }

  /** 命中矩形强制以容器中心为原点，尺寸 = 面板尺寸 */
  private fixHitArea() {
    const inp = (this as unknown as {
      input: (Phaser.Types.Input.InteractiveObject & { hitArea: Phaser.Geom.Rectangle }) | null;
    }).input;
    if (!inp) return;
    // Phaser 判定 Container 时会先把指针转成「相对 displayOrigin」的局部坐标，
    // 也就是 x 已经落在 0..w 区间。所以 hitArea 必须从 (0,0) 起算，
    // 写成 -w/2 反而只覆盖左半边。
    inp.hitArea = new Phaser.Geom.Rectangle(0, 0, this.pw, this.ph);
    inp.hitAreaCallback = Phaser.Geom.Rectangle.Contains;
  }

  /** 单独抽出来，避免 TS 在 super.setInteractive 之后把 input 收窄成 never */
  private applyCursor(cursor: string) {
    const inp = (this as unknown as { input: Phaser.Types.Input.InteractiveObject | null }).input;
    if (inp) inp.cursor = cursor;
  }

  /**
   * 按下反馈：只缩内部图形，不缩容器本身。
   *
   * 为什么不能直接 container.setScale()：容器一缩，它的 hitArea 也跟着缩，
   * 鼠标还停在原位就变成「移出」，Phaser 会立刻发 pointerout → 回弹 →
   * 再次判定进入，形成反复抖动，手指按住时按下状态一直丢，表现就是「点不进去」。
   * 缩放 Graphics 子对象则完全不碰命中区域。
   */
  popScale(s = 1) {
    this.face.setScale(s);
    // 硬阴影在按下时一起收，按下态才看得出来
    this.shadowG.setScale(s);
    this.face.setAlpha(s < 1 ? 0.82 : 1);
    return this;
  }

  /** 关掉投影（比如遮罩、纯装饰条） */
  setShadowVisible(v: boolean) {
    this.shadowG.setVisible(v);
    return this;
  }

  get fillColor() { return this.fill; }
}

/** 判断某个对象是不是圆角面板 */
export function isRoundedPanel(o: unknown): o is RoundedPanel {
  return o instanceof RoundedPanel;
}
