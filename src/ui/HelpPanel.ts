import Phaser from 'phaser';
import { UI, TEXT } from './Theme';
import { attachPressFeedback } from './Feedback';

/**
 * 操作说明弹层（主菜单右上角 ? 按钮打开）。
 *
 * 上半区：电脑端 —— WASD 键盘示意图 + 升级时按 1/2/3 选卡
 * 下半区：移动端 —— 拖动屏幕移动（虚拟摇杆抽象图，非固定位置）
 *
 * 全图用 Graphics + Text 现画，不引入素材文件。
 */
export function openHelpPanel(scene: Phaser.Scene) {
  const { width, height } = scene.scale;
  const panel = scene.add.container(0, 0).setDepth(2100);

  const mask = scene.add.rectangle(0, 0, width, height, 0x000000, 0.72)
    .setOrigin(0).setInteractive();
  panel.add(mask);

  const pw = Math.min(width - 32, 348);
  const cw = pw - 28;
  // 高度按内容算：卡片顶 179 到末行底 543，再留 24 底边距
  const ph = Math.min(height - 60, 388);
  const cx = width / 2;
  const cy = height / 2;

  const card = scene.add.rectangle(cx, cy, pw, ph, UI.card, 0.98)
    .setStrokeStyle(2, UI.primaryStroke);
  panel.add(card);

  const top = cy - ph / 2;
  const left = cx - pw / 2;

  // 标题
  panel.add(scene.add.text(cx, top + 26, '操作说明', {
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
    fontSize: '19px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0.5));

  // 关闭按钮
  const close = scene.add.text(cx + pw / 2 - 24, top + 24, '✕', {
    fontFamily: 'sans-serif', fontSize: '18px', color: TEXT.dim,
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });
  attachPressFeedback(close);
  close.on('pointerdown', () => { panel.destroy(); });
  close.on('pointerover', () => close.setColor('#ffffff'));
  close.on('pointerout', () => close.setColor(TEXT.dim));
  panel.add(close);

  let y = top + 58;

  // ---------- 电脑端 ----------
  panel.add(scene.add.text(left + 16, y, '电脑端', {
    fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0, 0.5));
  y += 24;

  // WASD 键盘图：W 在上，ASD 在下
  drawKeyCluster(scene, panel, cx, y + 22);
  y += 60;

  panel.add(scene.add.text(cx, y, 'W A S D 移动', {
    fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
  }).setOrigin(0.5));
  y += 22;
  panel.add(scene.add.text(cx, y, '升级选卡片时按 1 / 2 / 3 选择', {
    fontFamily: 'sans-serif', fontSize: '12px', color: TEXT.dim,
  }).setOrigin(0.5));
  y += 30;

  // 分隔线
  panel.add(scene.add.rectangle(cx, y, cw, 1, UI.cardStroke).setOrigin(0.5));
  y += 22;

  // ---------- 移动端 ----------
  panel.add(scene.add.text(left + 16, y, '移动端', {
    fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.gold, fontStyle: 'bold',
  }).setOrigin(0, 0.5));
  y += 26;

  drawJoystick(scene, panel, cx, y + 40);
  y += 88;

  panel.add(scene.add.text(cx, y, '手指按住屏幕任意位置拖动，角色随之移动', {
    fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff',
    align: 'center', wordWrap: { width: cw },
  }).setOrigin(0.5));
  y += 22;
  panel.add(scene.add.text(cx, y, '摇杆不固定 · 松手即停 · 招式自动释放', {
    fontFamily: 'sans-serif', fontSize: '11px', color: TEXT.dim,
    align: 'center', wordWrap: { width: cw },
  }).setOrigin(0.5));

  // 点遮罩关闭
  mask.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation?.();
    panel.destroy();
  });

  return panel;
}

/** 四个方向键组成的十字，W 在上排，A S D 在下排 */
function drawKeyCluster(
  scene: Phaser.Scene, panel: Phaser.GameObjects.Container, cx: number, cy: number,
) {
  const K = 34;      // 键帽边长
  const G = 5;       // 间距
  const keys: { label: string; dx: number; dy: number }[] = [
    { label: 'W', dx: 0, dy: -(K + G) },
    { label: 'A', dx: -(K + G), dy: 0 },
    { label: 'S', dx: 0, dy: 0 },
    { label: 'D', dx: K + G, dy: 0 },
  ];

  for (const k of keys) {
    const x = cx + k.dx;
    const y = cy + k.dy;
    // 键帽：深底 + 金色描边，底部加一道暗边做出厚度
    panel.add(scene.add.rectangle(x, y + 2, K, K, UI.secondaryHover, 1)
      .setStrokeStyle(1, UI.secondaryStroke));
    panel.add(scene.add.rectangle(x, y, K, K, UI.secondary, 1)
      .setStrokeStyle(1.5, UI.primaryStroke));
    panel.add(scene.add.text(x, y, k.label, {
      fontFamily: 'monospace', fontSize: '14px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5));
  }
}

/** 虚拟摇杆抽象图：底盘 + 摇杆头，右侧带一个手指点 */
function drawJoystick(
  scene: Phaser.Scene, panel: Phaser.GameObjects.Container, cx: number, cy: number,
) {
  const R = 36;   // 底盘半径
  const r = 17;   // 摇杆头半径

  // 底盘：外圈虚线感（用两层描边近似）+ 内部微弱填充
  panel.add(scene.add.circle(cx, cy, R, UI.primary, 0.06)
    .setStrokeStyle(2, UI.primaryStroke, 0.55));
  panel.add(scene.add.circle(cx, cy, R - 6, 0x000000, 0)
    .setStrokeStyle(1, UI.primaryStroke, 0.22));

  // 指向箭头：左 / 右 / 上 / 下（很淡，表示可任意方向）
  const g = scene.add.graphics();
  g.lineStyle(1.5, UI.primaryLight, 0.45);
  for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const x1 = cx + Math.cos(a) * (r + 6);
    const y1 = cy + Math.sin(a) * (r + 6);
    const x2 = cx + Math.cos(a) * (R - 8);
    const y2 = cy + Math.sin(a) * (R - 8);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
  }
  panel.add(g);

  // 摇杆头（往右上偏一点，表示正在拖）
  const hx = cx + 7;
  const hy = cy - 6;
  panel.add(scene.add.circle(hx, hy, r, UI.primary, 0.92));
  panel.add(scene.add.circle(hx - 3, hy - 4, r * 0.34, 0xffffff, 0.35));

  // 手指：一个圆润的小椭圆 + 指尖，落在摇杆头上方
  const fx = hx + 3;
  const fy = hy - 24;
  panel.add(scene.add.ellipse(fx, fy, 19, 26, 0xffffff, 0.92));
  panel.add(scene.add.ellipse(fx, fy - 14, 12, 11, 0xffffff, 0.92));
  // 指尖接触点
  panel.add(scene.add.circle(fx, fy + 15, 3, 0xffffff, 0.6));
}
