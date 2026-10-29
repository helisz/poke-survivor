import Phaser from 'phaser';

/**
 * 特性图标：用 Graphics 现场绘制像素风小图标，零素材依赖。
 * 每个图标统一画在 32×32 的画布内，主色由调用方指定。
 */

export type TraitIcon =
  | 'wind' | 'shield' | 'heart' | 'fist' | 'clock'
  | 'plus' | 'book' | 'magnet' | 'armor';

interface Opts {
  /** 底色圆盘 */
  bg?: number;
  /** 描边色 */
  ring?: number;
  /** 图标线条色 */
  color?: number;
}

/** 在 (cx, cy) 处画一个 d 像素直径的圆形底板 */
function disc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, d: number, o: Required<Opts>) {
  g.fillStyle(o.bg, 1);
  g.fillCircle(cx, cy, d / 2);
  g.lineStyle(1.5, o.ring, 0.95);
  g.strokeCircle(cx, cy, d / 2);
  // 顶部高光
  g.fillStyle(0xffffff, 0.10);
  g.slice(cx, cy, d / 2 - 1, Math.PI * 1.05, Math.PI * 1.75, false);
  g.fillPath();
}

/** 画图标本体（坐标基于 32×32 网格，c 为中心 16,16） */
function glyph(g: Phaser.GameObjects.Graphics, icon: TraitIcon, cx: number, cy: number, s: number, color: number) {
  g.lineStyle(Math.max(1.5, 2 * s), color, 1);
  g.fillStyle(color, 1);
  const u = s; // 单位长度

  switch (icon) {
    case 'wind': {
      // 三道风线
      for (let i = 0; i < 3; i++) {
        const y = cy - 5 * u + i * 5 * u;
        const w = (i === 1 ? 9 : 7) * u;
        g.beginPath();
        g.moveTo(cx - 6 * u, y);
        g.lineTo(cx - 6 * u + w, y);
        g.strokePath();
        g.fillCircle(cx - 6 * u + w, y, 1.4 * u);
      }
      break;
    }
    case 'shield': {
      g.beginPath();
      g.moveTo(cx, cy - 7 * u);
      g.lineTo(cx + 6 * u, cy - 4 * u);
      g.lineTo(cx + 6 * u, cy + 2 * u);
      g.lineTo(cx, cy + 7 * u);
      g.lineTo(cx - 6 * u, cy + 2 * u);
      g.lineTo(cx - 6 * u, cy - 4 * u);
      g.closePath();
      g.strokePath();
      g.fillStyle(color, 0.35);
      g.fillPath();
      break;
    }
    case 'armor': {
      // 双层盾 + 十字
      g.beginPath();
      g.moveTo(cx, cy - 7 * u);
      g.lineTo(cx + 6 * u, cy - 3 * u);
      g.lineTo(cx, cy + 7 * u);
      g.lineTo(cx - 6 * u, cy - 3 * u);
      g.closePath();
      g.strokePath();
      g.beginPath();
      g.moveTo(cx, cy - 3 * u); g.lineTo(cx, cy + 3 * u);
      g.moveTo(cx - 3 * u, cy); g.lineTo(cx + 3 * u, cy);
      g.strokePath();
      break;
    }
    case 'heart': {
      // 两个半圆 + 底部三角拼成心形
      g.fillCircle(cx - 3 * u, cy - 2.5 * u, 3.6 * u);
      g.fillCircle(cx + 3 * u, cy - 2.5 * u, 3.6 * u);
      g.beginPath();
      g.moveTo(cx - 6.4 * u, cy - 1.2 * u);
      g.lineTo(cx + 6.4 * u, cy - 1.2 * u);
      g.lineTo(cx, cy + 7 * u);
      g.closePath();
      g.fillPath();
      break;
    }
    case 'fist': {
      // 拳掌方块 + 指节
      g.fillRect(cx - 5 * u, cy - 4 * u, 10 * u, 8 * u);
      for (let i = 0; i < 3; i++) {
        g.fillStyle(0x000000, 0.25);
        g.fillRect(cx - 4 * u + i * 3 * u, cy - 3.5 * u, 1.6 * u, 7 * u);
      }
      break;
    }
    case 'clock': {
      g.strokeCircle(cx, cy, 6.5 * u);
      g.beginPath();
      g.moveTo(cx, cy); g.lineTo(cx, cy - 4 * u);
      g.moveTo(cx, cy); g.lineTo(cx + 3 * u, cy + 1.5 * u);
      g.strokePath();
      break;
    }
    case 'plus': {
      const t = 2.4 * u;
      g.fillRect(cx - t / 2, cy - 6 * u, t, 12 * u);
      g.fillRect(cx - 6 * u, cy - t / 2, 12 * u, t);
      break;
    }
    case 'book': {
      g.strokeRect(cx - 6 * u, cy - 6 * u, 12 * u, 12 * u);
      g.beginPath();
      g.moveTo(cx, cy - 6 * u); g.lineTo(cx, cy + 6 * u);
      for (let i = 0; i < 3; i++) {
        const y = cy - 3 * u + i * 3 * u;
        g.moveTo(cx - 4.5 * u, y); g.lineTo(cx - 1.5 * u, y);
        g.moveTo(cx + 1.5 * u, y); g.lineTo(cx + 4.5 * u, y);
      }
      g.strokePath();
      break;
    }
    case 'magnet': {
      g.lineStyle(3 * u, color, 1);
      g.beginPath();
      g.arc(cx, cy + 2 * u, 5 * u, Math.PI, Math.PI * 2, false);
      g.strokePath();
      g.lineStyle(3 * u, color, 1);
      g.beginPath();
      g.moveTo(cx - 5 * u, cy + 2 * u); g.lineTo(cx - 5 * u, cy - 3 * u);
      g.moveTo(cx + 5 * u, cy + 2 * u); g.lineTo(cx + 5 * u, cy - 3 * u);
      g.strokePath();
      // 白端
      g.fillStyle(0xffffff, 0.85);
      g.fillRect(cx - 6.5 * u, cy - 5 * u, 3 * u, 2.5 * u);
      g.fillRect(cx + 3.5 * u, cy - 5 * u, 3 * u, 2.5 * u);
      break;
    }
  }
}

/**
 * 生成特性图标纹理（每个 icon 只生成一次，key = `trait_icon_${icon}`）
 */
export function makeTraitIconTexture(
  scene: Phaser.Scene, icon: TraitIcon, accent: number,
): string {
  const key = `trait_icon_${icon}_${accent.toString(16)}`;
  if (scene.textures.exists(key)) return key;

  const size = 64;
  const g = scene.add.graphics();
  const cx = size / 2, cy = size / 2;

  disc(g, cx, cy, size - 4, {
    bg: Phaser.Display.Color.ValueToColor(accent).darken(72).color,
    ring: accent,
    color: accent,
  });
  glyph(g, icon, cx, cy, 1.9, accent);

  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}
