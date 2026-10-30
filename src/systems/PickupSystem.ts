import Phaser from 'phaser';
import { PICKUP_DEFS, PICKUP_LIST, PICKUP_LIFETIME, type PickupKind } from '../data/pickups';

/**
 * 拾取道具系统：每分钟在玩家附近刷一个道具，屏幕外时由 GameScene 画箭头。
 */
export class PickupSystem {
  private scene: Phaser.Scene;
  private group: Phaser.Physics.Arcade.Group;
  private timer = 0;
  /** 每帧刷新一次：供 UIScene / GameScene 画屏幕外箭头 */
  arrows: {
    kind: PickupKind; x: number; y: number; onScreen: boolean; ang: number;
    /** 剩余存活秒数，给左下角倒计时用 */
    life: number;
  }[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.makeTextures();
    this.group = scene.physics.add.group({ allowGravity: false });
  }

  get groupRef() { return this.group; }

  /** 生成三种道具的像素纹理 */
  private makeTextures() {
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);

    // 磁铁：U 形
    g.clear();
    g.fillStyle(0xd94f4f, 1);
    g.fillRect(6, 8, 5, 16);
    g.fillRect(17, 8, 5, 16);
    g.fillRect(6, 20, 16, 5);
    g.fillStyle(0xf0f4f8, 1);
    g.fillRect(6, 8, 5, 5);
    g.fillRect(17, 8, 5, 5);
    g.lineStyle(1.5, 0x521a1a, 0.9);
    g.strokeRect(6, 8, 5, 16);
    g.strokeRect(17, 8, 5, 16);
    g.strokeRect(6, 20, 16, 5);
    g.generateTexture('pk_magnet', 28, 28);

    // 盾牌
    g.clear();
    g.fillStyle(0x4fa3d9, 1);
    g.beginPath();
    g.moveTo(14, 3);
    g.lineTo(24, 8);
    g.lineTo(24, 16);
    g.lineTo(14, 25);
    g.lineTo(4, 16);
    g.lineTo(4, 8);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xbfe4ff, 0.85);
    g.beginPath();
    g.moveTo(14, 6);
    g.lineTo(20, 9.5);
    g.lineTo(14, 20);
    g.closePath();
    g.fillPath();
    g.lineStyle(1.5, 0x15405e, 0.9);
    g.beginPath();
    g.moveTo(14, 3); g.lineTo(24, 8); g.lineTo(24, 16);
    g.lineTo(14, 25); g.lineTo(4, 16); g.lineTo(4, 8);
    g.closePath();
    g.strokePath();
    g.generateTexture('pk_shield_pickup', 28, 28);

    // 剑
    g.clear();
    g.fillStyle(0xe0c04a, 1);
    g.beginPath();
    g.moveTo(14, 2);
    g.lineTo(18, 14);
    g.lineTo(14, 18);
    g.lineTo(10, 14);
    g.closePath();
    g.fillPath();
    g.fillStyle(0xfff3b0, 0.9);
    g.fillRect(12.5, 4, 3, 12);
    g.fillStyle(0x8a6b1c, 1);
    g.fillRect(7, 18, 14, 3);
    g.fillRect(12.5, 21, 3, 5);
    g.lineStyle(1.5, 0x4a3608, 0.9);
    g.strokeRect(7, 18, 14, 3);
    g.generateTexture('pk_sword_pickup', 28, 28);

    g.destroy();
  }

  private keyOf(kind: PickupKind) {
    return kind === 'magnet' ? 'pk_magnet'
      : kind === 'shield' ? 'pk_shield_pickup'
      : 'pk_sword_pickup';
  }

  /** 在玩家附近（屏幕上但偏外围）刷一个道具 */
  spawnNear(px: number, py: number) {
    const kind = Phaser.Utils.Array.GetRandom(PICKUP_LIST) as PickupKind;
    const ang = Math.random() * Math.PI * 2;
    const dist = 140 + Math.random() * 120;
    const x = px + Math.cos(ang) * dist;
    const y = py + Math.sin(ang) * dist;
    this.spawnAt(kind, x, y);
  }

  spawnAt(kind: PickupKind, x: number, y: number) {
    // 场上只允许存在一个道具：新的一出现，没被捡走的那个立即消失
    this.clearAll();
    const p = this.group.get(x, y, this.keyOf(kind)) as Phaser.Physics.Arcade.Image | null;
    if (!p) return null;
    p.setActive(true).setVisible(true);
    p.setTexture(this.keyOf(kind));
    p.setData('kind', kind);
    p.setData('t', 0);
    // 存活倒计时：过期就消失，UI 左下角会显示剩余秒数
    p.setData('life', PICKUP_LIFETIME);
    p.setScale(1);
    p.setDepth(60);
    // 呼吸浮动
    this.scene.tweens.add({
      targets: p, y: y - 6, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    const def = PICKUP_DEFS[kind];
    const glow = this.scene.add.circle(x, y, 17, def.glow, 0.28).setDepth(59);
    this.scene.tweens.add({
      targets: glow, scale: 1.5, alpha: 0, duration: 900, repeat: -1,
    });
    p.setData('glow', glow);
    return p;
  }

  /** 每帧：推进计时器 + 同步箭头信息 */
  update(dtSec: number, px: number, py: number, cam: Phaser.Cameras.Scene2D.Camera) {
    this.timer += dtSec;
    if (this.timer >= 60) {
      this.timer = 0;
      this.spawnNear(px, py);
    }

    this.arrows.length = 0;
    const view = cam.worldView;
    const pad = 30;
    for (const obj of this.group.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!obj.active) continue;

      // 存活倒计时：到点自动消失，不占场上位置
      const life = (obj.getData('life') as number) - dtSec;
      obj.setData('life', life);
      if (life <= 0) {
        const glow = obj.getData('glow') as Phaser.GameObjects.Arc | undefined;
        if (glow) { this.scene.tweens.killTweensOf(glow); glow.destroy(); }
        this.scene.tweens.killTweensOf(obj);
        obj.setActive(false).setVisible(false);
        obj.setData('glow', undefined);
        continue;
      }

      const kind = obj.getData('kind') as PickupKind;
      const onScreen = obj.x > view.x - pad && obj.x < view.right + pad
        && obj.y > view.y - pad && obj.y < view.bottom + pad;
      const ang = Math.atan2(obj.y - py, obj.x - px);
      this.arrows.push({ kind, x: obj.x, y: obj.y, onScreen, ang, life });
      // 光晕跟随
      const glow = obj.getData('glow') as Phaser.GameObjects.Arc | undefined;
      if (glow && glow.active) { glow.x = obj.x; glow.y = obj.y; }
    }
  }

  /** 拾取后回收 */
  consume(obj: Phaser.Physics.Arcade.Image) {
    const glow = obj.getData('glow') as Phaser.GameObjects.Arc | undefined;
    if (glow) { this.scene.tweens.killTweensOf(glow); glow.destroy(); }
    this.scene.tweens.killTweensOf(obj);
    obj.setActive(false).setVisible(false);
    obj.destroy();
  }

  /** 清空所有道具（BOSS 出场等） */
  clearAll() {
    for (const obj of this.group.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (obj.active) this.consume(obj);
    }
  }
}
