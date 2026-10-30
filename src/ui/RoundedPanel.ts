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
  /** 投影颜色 */
  shadowColor?: number;
  /** 投影透明度 */
  shadowAlpha?: number;
  /** 投影下移距离 */
  shadowY?: number;
  /** 投影模糊半径（用多层递减模拟） */
  shadowBlur?: number;
  /** 投影横向扩展（让影子比本体宽一点，显得浮起来） */
  shadowSpread?: number;
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
  private shadowBlur: number;
  private shadowSpread: number;
  /** 给外部读尺寸用（原 Rectangle 有 width/height） */
  readonly rw: number;
  readonly rh: number;

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
    this.shadowAlpha = opts.shadowAlpha ?? 0.55;
    this.shadowY = opts.shadowY ?? Math.max(3, Math.round(h * 0.10));
    this.shadowBlur = opts.shadowBlur ?? 6;
    this.shadowSpread = opts.shadowSpread ?? 2;

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

    // --- 投影：纯多层柔化，不画实心块 ---
    // 之前多叠了一层「同尺寸实心圆角块」当主投影，边缘是硬的，
    // 和柔和层交界会出现明显锯齿和方块感。改成全部用递减扩散的层，
    // 每层透明度很低，靠叠加自然过渡成柔边。
    this.shadowG.clear();
    const layers = Math.max(3, Math.round(this.shadowBlur));
    for (let i = layers; i >= 1; i--) {
      const t = i / layers;                    // 1 = 最外层
      const grow = this.shadowSpread + t * (this.shadowBlur * 1.6);
      // 最外层几乎不可见，越靠内越实 —— 形成平滑的衰减
      const a = this.shadowAlpha * Math.pow(1 - t, 2.2) * 0.9 + this.shadowAlpha * 0.06;
      this.shadowG.fillStyle(this.shadowColor, a);
      this.shadowG.fillRoundedRect(
        x0 - grow,
        y0 - grow + this.shadowY,
        w + grow * 2,
        h + grow * 2,
        radius + grow,
      );
    }

    // --- 本体 ---
    this.face.clear();
    this.face.fillStyle(this.fill, this.fillAlpha);
    this.face.fillRoundedRect(x0, y0, w, h, radius);
    if (this.strokeWidth > 0 && this.strokeColor !== undefined) {
      this.face.lineStyle(this.strokeWidth, this.strokeColor, this.strokeAlpha);
      this.face.strokeRoundedRect(x0, y0, w, h, radius);
    }
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
    const area = new Phaser.Geom.Rectangle(-this.pw / 2, -this.ph / 2, this.pw, this.ph);
    super.setInteractive(area, Phaser.Geom.Rectangle.Contains, dropZone ?? false);
    if (this.input) {
      this.input.cursor = 'pointer';
      // 保留旧代码里传 useHandCursor 的语义
      if (hitArea && (hitArea as Phaser.Types.Input.InputConfiguration).useHandCursor === false) {
        this.input.cursor = 'default';
      }
    }
    void callback;
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
