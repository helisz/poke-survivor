import Phaser from 'phaser';
import { UI } from './Theme';

/**
 * 程序化生成一枚金币图标纹理（金圆 + 深色描边 + 内环 + 高光）。
 * 只生成一次，后续按 key 复用，避免重复 createCanvas。
 */
export const COIN_KEY = 'ui_coin';

/** 强化入口用的向上箭头图标（三星叠加 = 变强），与金币区分开 */
export const UPGRADE_KEY = 'ui_upgrade';

export function makeUpgradeIcon(scene: Phaser.Scene, size = 18): string {
  if (scene.textures.exists(UPGRADE_KEY)) return UPGRADE_KEY;
  const S = size;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = S / 2;
  // 三层递进箭头：下宽上尖
  const w1 = S * 0.20, w2 = S * 0.32, w3 = S * 0.44;
  g.fillStyle(UI.primaryLight, 1);
  g.fillTriangle(c - w1, c - S * 0.06, c + w1, c - S * 0.06, c, c - S * 0.40);
  g.fillStyle(UI.primary, 1);
  g.fillTriangle(c - w2, c + S * 0.18, c + w2, c + S * 0.18, c, c - S * 0.14);
  g.fillStyle(UI.primaryStroke, 1);
  g.fillTriangle(c - w3, c + S * 0.40, c + w3, c + S * 0.40, c, c + S * 0.10);
  g.generateTexture(UPGRADE_KEY, S, S);
  g.destroy();
  return UPGRADE_KEY;
}

export function makeCoinIcon(scene: Phaser.Scene, size = 22): string {
  if (scene.textures.exists(COIN_KEY)) return COIN_KEY;

  const S = size;
  const tex = scene.textures.createCanvas(COIN_KEY, S, S);
  if (!tex) return COIN_KEY;
  const ctx = tex.getContext();
  const c = S / 2;
  const r = S * 0.44;

  // 外圈：深金描边
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = '#b8860b';
  ctx.fill();

  // 主体：渐变金面
  const grad = ctx.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#ffe680');
  grad.addColorStop(0.5, '#ffd230');
  grad.addColorStop(1, '#e6a800');
  ctx.beginPath();
  ctx.arc(c, c, r * 0.86, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // 内环
  ctx.beginPath();
  ctx.arc(c, c, r * 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(160,110,0,0.55)';
  ctx.lineWidth = Math.max(1, S * 0.05);
  ctx.stroke();

  // 顶部高光
  ctx.beginPath();
  ctx.ellipse(c - r * 0.22, c - r * 0.3, r * 0.3, r * 0.18, -Math.PI / 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();

  tex.refresh();
  return COIN_KEY;
}


/**
 * 六项永久强化各配一个大图标（44×44）。
 * 用 Graphics 生成后转纹理，比文字符号清晰、风格统一。
 */
const PERM_ICON_DEFS: Record<string, { key: string; color: number; draw: (g: Phaser.GameObjects.Graphics, c: number) => void }> = {
  hp: {
    key: 'perm_hp', color: 0xe0574f,
    draw: (g, c) => {
      // 心形：两圆 + 三角
      g.fillStyle(0xe0574f, 1);
      g.fillCircle(c - 8, c - 6, 9);
      g.fillCircle(c + 8, c - 6, 9);
      g.fillTriangle(c - 16, c - 2, c + 16, c - 2, c, c + 15);
      g.fillStyle(0xff8a7a, 0.55);
      g.fillCircle(c - 6, c - 8, 4);
    },
  },
  damage: {
    key: 'perm_damage', color: 0xe07a52,
    draw: (g, c) => {
      // 剑：斜向剑身 + 护手
      g.fillStyle(0xe07a52, 1);
      g.fillRect(c - 3, c - 15, 6, 24);
      g.fillTriangle(c - 3, c - 15, c + 3, c - 15, c, c - 20);
      g.fillStyle(0xc9a227, 1);
      g.fillRect(c - 10, c + 7, 20, 5);
      g.fillRect(c - 2, c + 12, 4, 8);
    },
  },
  speed: {
    key: 'perm_speed', color: 0x63c8e0,
    draw: (g, c) => {
      // 闪电
      g.fillStyle(0x63c8e0, 1);
      g.fillTriangle(c + 2, c - 17, c - 10, c + 2, c - 1, c + 2);
      g.fillTriangle(c + 2, c - 17, c + 10, c + 2, c - 1, c + 2);
      g.fillTriangle(c - 2, c - 2, c + 9, c - 2, c - 3, c + 17);
    },
  },
  critRate: {
    key: 'perm_critRate', color: 0xff5c5c,
    draw: (g, c) => {
      // 靶心：外圈 + 中圈 + 实心红点，代表「精准」
      g.lineStyle(3.5, 0xff5c5c, 1);
      g.strokeCircle(c, c, 15);
      g.lineStyle(2.5, 0xff5c5c, 0.8);
      g.strokeCircle(c, c, 8);
      g.fillStyle(0xff5c5c, 1);
      g.fillCircle(c, c, 3.5);
    },
  },
  critDmg: {
    key: 'perm_critDmg', color: 0xff8a3c,
    draw: (g, c) => {
      // 爆炸星芒：8 道尖角 + 中心实心，代表「爆发」
      g.fillStyle(0xff8a3c, 1);
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i;
        const a1 = a - 0.16, a2 = a + 0.16;
        g.fillTriangle(
          c + Math.cos(a) * 19, c + Math.sin(a) * 19,
          c + Math.cos(a1) * 6, c + Math.sin(a1) * 6,
          c + Math.cos(a2) * 6, c + Math.sin(a2) * 6,
        );
      }
      g.fillCircle(c, c, 5);
    },
  },
  pickup: {
    key: 'perm_pickup', color: 0x8a5fbf,
    draw: (g, c) => {
      // 磁铁：U 形两臂 + 两端红白
      g.lineStyle(7, 0x8a5fbf, 1);
      g.beginPath();
      g.arc(c, c - 2, 11, 0, Math.PI, false);
      g.strokePath();
      g.fillStyle(0x8a5fbf, 1);
      g.fillRect(c - 15, c - 3, 8, 13);
      g.fillRect(c + 7, c - 3, 8, 13);
      g.fillStyle(0xe0574f, 1);
      g.fillRect(c - 15, c + 8, 8, 6);
      g.fillRect(c + 7, c + 8, 8, 6);
    },
  },
  exp: {
    key: 'perm_exp', color: 0x63c256,
    draw: (g, c) => {
      // 星形（六角）
      const r1 = 17, r2 = 7.5;
      const pts: number[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (Math.PI / 6) * i - Math.PI / 2;
        const r = i % 2 === 0 ? r1 : r2;
        pts.push(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.fillStyle(0x63c256, 1);
      g.fillPoints(pts.reduce<Phaser.Geom.Point[]>((acc, _v, i, arr) => {
        if (i % 2 === 0) acc.push(new Phaser.Geom.Point(arr[i], arr[i + 1]));
        return acc;
      }, []), true);
    },
  },
  cd: {
    key: 'perm_cd', color: 0xc6a44a,
    draw: (g, c) => {
      // 时钟：外圈 + 指针
      g.lineStyle(4, 0xc6a44a, 1);
      g.strokeCircle(c, c, 15);
      g.lineStyle(3.5, 0xffe0a0, 1);
      g.beginPath();
      g.moveTo(c, c);
      g.lineTo(c, c - 9);
      g.moveTo(c, c);
      g.lineTo(c + 7, c + 4);
      g.strokePath();
    },
  },
};

/** 生成（或复用）某项强化的大图标纹理 key */
export function makePermIcon(scene: Phaser.Scene, permKey: string): string | null {
  const def = PERM_ICON_DEFS[permKey];
  if (!def) return null;
  if (scene.textures.exists(def.key)) return def.key;
  const S = 44;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  def.draw(g, S / 2);
  g.generateTexture(def.key, S, S);
  g.destroy();
  return def.key;
}
