import Phaser from 'phaser';
import {
  POKEMON_PLAYABLE, POKEDEX_NAME, ENEMY_POOL, ELITE_POOL, BOSS_POOL, POKEMON_TYPE, POKEMON_GENUS,
} from '../data/pokedex';
import { MOVES } from '../data/moves';
import { EVOLUTIONS } from '../data/evolutions';
import { loadSave } from '../data/stats';
import { ensureSprites, isSpriteReady } from '../data/lazySprites';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { UI, TEXT } from '../ui/Theme';
import { attachPressFeedback } from '../ui/Feedback';
import { RoundedPanel } from '../ui/RoundedPanel';

/** 属性 → 本色。图鉴里属性是信息主体，不能用金色。 */
const TYPE_COLOR: Record<string, number> = {
  电: 0xf7d02c, 火: 0xf0803c, 水: 0x4a9be8, 草: 0x5cbb5c, 一般: 0xbbaa8a,
  幽灵: 0x7f6bb5, 龙: 0x6b5ce8, 格斗: 0xd05c3c, 超能: 0xe86ba8, 岩石: 0xb8a67c,
  地面: 0xd0a83c, 钢: 0x9aabbc, 毒: 0xa85cc8,
};

const RARITY_LABEL: Record<string, string> = { common: '普通', rare: '稀有', epic: '史诗' };

/** 每页格子数上限（4~5 列 × 若干行，按屏幕算出来是 20~30） */
const PER_PAGE = 24;

type Tab = 'partner' | 'enemy';

interface Entry {
  id: number;
  name: string;
  type?: string;
  move?: string;
}

/**
 * 图鉴
 *
 * 两个 tab：
 *  - 伙伴：24 只可玩宝可梦，出战过才亮
 *  - 敌人：小怪池 / 精英池 / BOSS 池，在场上出现过才亮
 *
 * 未解锁的格子压暗、只显示「？？？」，点开也只有一句 ？？？ + 解锁提示。
 * 解锁态来自存档 seenPartners / seenEnemies。
 */
export class DexScene extends Phaser.Scene {
  constructor() { super('Dex'); }

  private tab: Tab = 'partner';
  private page = 0;
  private seenPartners = new Set<number>();
  private seenEnemies = new Set<number>();
  private grid?: Phaser.GameObjects.Container;
  private tabBtns: { key: Tab; panel: RoundedPanel; label: Phaser.GameObjects.Text }[] = [];
  private detail?: Phaser.GameObjects.Container;
  /** 详情页当前展示的条目与解锁态，贴图异步到位后用它重开详情。 */
  private detailEntry?: Entry;
  private detailUnlocked = false;

  create() {
    installTextTextureCleanup(this);
    const { width, height } = this.scale;

    this.grid = undefined;
    this.detail = undefined;
    this.tabBtns = [];
    this.tab = 'partner';
    this.page = 0;

    const sv = loadSave();
    this.seenPartners = new Set(sv.seenPartners ?? []);
    this.seenEnemies = new Set(sv.seenEnemies ?? []);

    this.add.rectangle(width / 2, height / 2, width, height, 0x041018);
    this.buildHeader();
    this.buildTabs();
    this.buildGrid();
    this.buildBack();
  }

  private buildHeader() {
    const { width } = this.scale;
    this.add.text(width / 2, 32, '图 鉴', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '21px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10);
  }

  private buildTabs() {
    const { width } = this.scale;
    const tabW = 106, tabH = 34, gap = 10;
    const y = 68;
    const leftX = width / 2 - gap / 2 - tabW / 2;
    const rightX = width / 2 + gap / 2 + tabW / 2;

    const make = (key: Tab, x: number, text: string) => {
      const panel = new RoundedPanel(this, x, y, tabW, tabH, UI.card, 1, { radius: 9 })
        .setStrokeStyle(1.5, UI.cardStroke)
        .setInteractive({ useHandCursor: true })
        .setDepth(10);
      attachPressFeedback(panel, { scale: 0.95 });
      const label = this.add.text(x, y, text, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '14px', fontStyle: 'bold', color: TEXT.dim,
      }).setOrigin(0.5).setDepth(11);
      panel.on('pointerup', () => {
        if (this.tab === key) return;
        Sfx.click();
        this.tab = key;
        this.page = 0;
        this.paintTabs();
        this.buildGrid();
      });
      this.tabBtns.push({ key, panel, label });
    };

    make('partner', leftX, '伙 伴');
    make('enemy', rightX, '敌 人');
    this.paintTabs();
  }

  private paintTabs() {
    for (const t of this.tabBtns) {
      const on = t.key === this.tab;
      t.panel.setFillStyle(on ? UI.cardOn : UI.card, 1);
      t.panel.setStrokeStyle(1.5, on ? UI.primaryStroke : UI.cardStroke);
      t.label.setColor(on ? TEXT.gold : TEXT.dim);
    }
  }

  /** 当前 tab 的条目（id 升序，保证格子位置稳定） */
  private entries(): Entry[] {
    if (this.tab === 'partner') {
      const playables = POKEMON_PLAYABLE as readonly { id: number; name: string; type: string; move: string }[];
      return playables.map((p) => ({
        id: p.id, name: p.name, type: p.type, move: p.move,
      }));
    }
    // 敌人页：BOSS 排最前，然后精英，最后小怪 —— 越稀有的越靠前
    const order = [...BOSS_POOL, ...ELITE_POOL, ...ENEMY_POOL];
    const seen = new Set<number>();
    const out: Entry[] = [];
    for (const id of order) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: POKEDEX_NAME[id] ?? `No.${id}`, type: POKEMON_TYPE[id] });
    }
    return out;
  }

  /**
   * 画当前页的格子。
   *
   * 伙伴 34 只、敌人 134 只，一屏放不下 —— 固定每页 24 格（4 列 × 6 行），
   * 底下翻页。格子尺寸按「一页 24 格」算，不随条目总数变化，
   * 这样翻页时格子大小不会跳。
   */
  private buildGrid() {
    this.grid?.destroy(true);
    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(5);
    this.grid = c;

    const list = this.entries();
    // 固定 3 列 × 4 行 = 12 格一页（敌人 134 只 → 12 页）。
    // 配合按需加载，每页只请求这 12 张图。
    const cols = 3;
    const rows = 4;
    const perPage = cols * rows;
    const totalPages = Math.max(1, Math.ceil(list.length / perPage));
    this.page = Math.min(this.page, totalPages - 1);

    // 紧凑布局：格子间距统一用 GAP，四周留同样的 pad。
    // 旧算法把剩余空间全摊进 gap 里，手机上会散得很难看。
    const GAP = 10;
    const padX = 16;
    const topY = 96;
    // 底部要放「已解锁」+ 翻页器，留出两条
    const bottomReserved = 76;

    const availW = width - padX * 2;
    const availH = height - topY - bottomReserved;

    // 格子尺寸由「可用宽高里更紧的那一维」决定，保证 3×4 能完整放下，
    // 上限 104 防止平板/桌面上格子大到失真。
    const byW = (availW - GAP * (cols - 1)) / cols;
    const byH = (availH - GAP * (rows - 1)) / rows;
    // 上限压到 88：104 那一版横向撑满、纵向大片留白，看着头重脚轻。
    // 88 让 3×4 成为一个居中的紧凑方块，上下也留出呼吸感。
    const cell = Math.max(48, Math.min(byW, byH, 88));

    const totalW = cell * cols + GAP * (cols - 1);
    const totalH = cell * rows + GAP * (rows - 1);
    // 水平居中；垂直在可用区里居中
    const startX = (width - totalW) / 2 + cell / 2;
    const startY = topY + (availH - totalH) / 2 + cell / 2;

    const begin = this.page * perPage;
    const slice = list.slice(begin, begin + perPage);
    // 按需加载：只请求本页这 12 张，加载完成后再重建一次网格
    ensureSprites(this, slice.map((e) => e.id), () => this.buildGrid());
    slice.forEach((e, i) => {
      const cx = startX + (i % cols) * (cell + GAP);
      const cy = startY + Math.floor(i / cols) * (cell + GAP);
      this.makeCell(c, cx, cy, cell, e);
    });

    const seenSet = this.tab === 'partner' ? this.seenPartners : this.seenEnemies;
    const seen = list.filter((e) => seenSet.has(e.id)).length;
    // 统计放左下，跟返回按钮同一条水平线（返回按钮中心 x=62，宽 96）
    const stat = this.add.text(122, height - 26, `已解锁 ${seen} / ${list.length}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '11px', color: TEXT.dim,
    }).setOrigin(0, 0.5);
    c.add(stat);

    // 翻页器贴右下角，只有多页时才出现
    if (totalPages > 1) this.buildPager(c, totalPages);
  }

  /** 右下角翻页器：‹ 页码 › */
  private buildPager(parent: Phaser.GameObjects.Container, totalPages: number) {
    const { width, height } = this.scale;
    const y = height - 26;
    const btnW = 34;
    const btnGap = 44;   // 页码文字宽度 + 两侧留白
    const rightPad = 16;

    // 从右往左排：› 贴边，页码居中，‹ 在左边
    const arrowRightX = width - rightPad - btnW / 2;
    const arrowLeftX = arrowRightX - btnGap;
    const pageX = (arrowLeftX + arrowRightX) / 2;

    const mk = (x: number, label: string, enabled: boolean, onClick: () => void) => {
      const btn = new RoundedPanel(this, x, y, btnW, 30,
        enabled ? UI.secondary : 0x0d1116, enabled ? 0.95 : 1, { radius: 8 })
        .setStrokeStyle(1.5, enabled ? UI.secondaryStroke : UI.cardStroke)
        .setInteractive({ useHandCursor: enabled });
      attachPressFeedback(btn, { scale: 0.94 });
      const t = this.add.text(x, y, label, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '15px', color: enabled ? TEXT.gold : TEXT.off, fontStyle: 'bold',
      }).setOrigin(0.5);
      if (enabled) {
        btn.on('pointerup', () => { Sfx.click(); onClick(); });
      }
      parent.add([btn, t]);
    };

    mk(arrowLeftX, '‹', this.page > 0, () => { this.page--; this.buildGrid(); });
    mk(arrowRightX, '›', this.page < totalPages - 1,
      () => { this.page++; this.buildGrid(); });

    const p = this.add.text(pageX, y, `${this.page + 1}/${totalPages}`, {
      fontFamily: 'monospace', fontSize: '12px', color: TEXT.dim,
    }).setOrigin(0.5);
    parent.add(p);
  }

  private makeCell(
    parent: Phaser.GameObjects.Container, cx: number, cy: number, size: number, e: Entry,
  ) {
    const unlocked = this.tab === 'partner'
      ? this.seenPartners.has(e.id)
      : this.seenEnemies.has(e.id);
    const color = TYPE_COLOR[e.type ?? ''] ?? UI.cardStroke;

    const box = new RoundedPanel(this, cx, cy, size, size,
      unlocked ? UI.card : 0x0d1116, 1, { radius: 9 })
      .setStrokeStyle(1.5, unlocked ? color : UI.cardStroke, unlocked ? 0.55 : 1)
      .setInteractive({ useHandCursor: true });
    attachPressFeedback(box, { scale: 0.94 });
    parent.add(box);

    // 贴图一律画：没解锁的用 tintFill 压成暗剪影，比空盒子更有「待解锁」的感觉
    if (isSpriteReady(this, e.id)) {
      const icon = this.add.image(cx, cy - size * 0.09, `pk_${e.id}`)
        .setDisplaySize(size * 0.60, size * 0.60);
      if (!unlocked) icon.setTintFill(0x1d232b);
      parent.add(icon);
    }

    const label = this.add.text(cx, cy + size * 0.28, unlocked ? e.name : '？？？', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: `${Math.max(9, Math.round(size * 0.13))}px`,
      color: unlocked ? TEXT.main : TEXT.off,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    parent.add(label);

    box.on('pointerup', () => {
      Sfx.click();
      this.openDetail(e, unlocked);
    });
  }

  private openDetail(e: Entry, unlocked: boolean) {
    this.closeDetail();
    this.detailEntry = e;
    this.detailUnlocked = unlocked;
    const { width, height } = this.scale;
    const c = this.add.container(width / 2, height / 2).setDepth(100);
    this.detail = c;

    const mask = this.add.rectangle(0, 0, width * 2, height * 2, 0x000000, 0.74)
      .setInteractive();
    mask.on('pointerdown', () => this.closeDetail());

    const panelW = Math.min(width - 44, 320);
    // 伙伴页要容纳 头像/名字/属性/招式/进化/关闭，440 才不挤
    const panelH = unlocked ? (this.tab === 'partner' ? 468 : 300) : 224;
    const panel = new RoundedPanel(this, 0, 0, panelW, panelH, UI.card, 1, { radius: 14 })
      .setStrokeStyle(2, UI.cardStroke);

    c.add([mask, panel]);

    const closeY = panelH / 2 - 26;
    const closeBtn = new RoundedPanel(this, 0, closeY, 116, 40,
      UI.secondary, 0.95, { radius: 10 })
      .setStrokeStyle(1.5, UI.secondaryStroke)
      .setInteractive({ useHandCursor: true });
    attachPressFeedback(closeBtn);
    const closeText = this.add.text(0, closeY, '关 闭', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '14px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5);
    closeBtn.on('pointerup', () => { Sfx.click(); this.closeDetail(); });

    if (!unlocked) {
      const q = this.add.text(0, -22, '？？？', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '30px', color: TEXT.off, fontStyle: 'bold',
      }).setOrigin(0.5);
      const hint = this.add.text(0, 28, this.tab === 'partner'
        ? '还没用过这只伙伴\n选它出战一次就能解锁'
        : '还没遇到过这只宝可梦\n进关卡里待一会儿就会遇到', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '12px', color: TEXT.dim, align: 'center', lineSpacing: 6,
      }).setOrigin(0.5);
      c.add([q, hint, closeBtn, closeText]);
    } else {
      this.buildUnlockedDetail(c, panelW, panelH, e, closeBtn, closeText);
    }

    c.setScale(0.9).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' });
  }

  private buildUnlockedDetail(
    c: Phaser.GameObjects.Container, panelW: number, panelH: number, e: Entry,
    closeBtn: RoundedPanel, closeText: Phaser.GameObjects.Text,
  ) {
    const color = TYPE_COLOR[e.type ?? ''] ?? UI.cardStroke;
    const top = -panelH / 2;

    // 顶部属性色带
    const accent = this.add.graphics();
    accent.fillStyle(color, 1);
    accent.fillRoundedRect(-panelW / 2 + 12, top + 10, panelW - 24, 5, 2.5);
    c.add(accent);

    // 详情页可能翻到还没加载过的图：先请求，到位后重开详情
    ensureSprites(this, [e.id], () => this.reopenDetail(e));
    if (isSpriteReady(this, e.id)) {
      const big = this.add.image(0, top + 84, `pk_${e.id}`).setDisplaySize(104, 104);
      c.add(big);
    }

    const nameText = this.add.text(0, top + 160, e.name, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '21px', color: TEXT.main, fontStyle: 'bold',
    }).setOrigin(0.5);
    const genus = POKEMON_GENUS[e.id];
    const noText = this.add.text(0, top + 186,
      genus ? `No.${String(e.id).padStart(3, '0')} · ${genus}` : `No.${String(e.id).padStart(3, '0')}`, {
        fontFamily: 'monospace', fontSize: '11px', color: TEXT.dim,
      }).setOrigin(0.5);
    c.add([nameText, noText]);

    if (e.type) {
      const tagY = top + 212;
      const tag = new RoundedPanel(this, 0, tagY, 54, 22, color, 0.9, { radius: 6 });
      const tagText = this.add.text(0, tagY, e.type, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '12px', color: '#041018', fontStyle: 'bold',
      }).setOrigin(0.5);
      c.add([tag, tagText]);
    }

    // 专属招式（只有伙伴才带招式和进化链）
    const move = e.move ? MOVES[e.move] : undefined;
    let y = top + 246;
    if (move) {
      const moveW = panelW - 36;
      const box = new RoundedPanel(this, 0, y + 28, moveW, 64, 0x0e1a24, 1, { radius: 9 })
        .setStrokeStyle(1.5, UI.cardStroke);
      const nameLbl = this.add.text(-moveW / 2 + 14, y + 10, move.name, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '15px', color: TEXT.main, fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      const descLbl = this.add.text(-moveW / 2 + 14, y + 36, move.desc, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '11px', color: TEXT.dim,
        wordWrap: { width: moveW - 132 },
      }).setOrigin(0, 0.5);
      const rarLbl = this.add.text(moveW / 2 - 14, y + 10, RARITY_LABEL[move.rarity as string] ?? '', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '10px', color: TEXT.goldDim, fontStyle: 'bold',
      }).setOrigin(1, 0.5);
      const statLbl = this.add.text(moveW / 2 - 14, y + 36,
        `伤害 ${move.baseDamage} · ${(move.cooldown / 1000).toFixed(2)}s`, {
          fontFamily: 'monospace', fontSize: '10px', color: TEXT.goldDim,
        }).setOrigin(1, 0.5);
      c.add([box, nameLbl, descLbl, rarLbl, statLbl]);
      y += 78;
    }

    const evo = e.move ? EVOLUTIONS[e.move] : undefined;
    if (this.tab === 'partner' && evo && evo.length) {
      const label = this.add.text(-panelW / 2 + 18, y + 2, '进化', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '11px', color: TEXT.dim,
      }).setOrigin(0, 0.5);
      c.add(label);

      const first = evo[0];
      // 448 路卡利欧、130 暴鲤龙的进化形态是自身 Mega，贴图还是同一张。
      // 这种情况不画第二个图标（两个一样的图会让人以为没进化），
      // 只在名字后面标「强化形态」。
      const sameId = first.toId === e.id;
      const steps = sameId
        ? [{ id: e.id, name: `${e.name} · ${first.name}` }]
        : [
          { id: e.id, name: e.name },
          { id: first.toId, name: first.name ?? POKEDEX_NAME[first.toId] ?? '' },
        ];
      const stepGap = Math.min(96, panelW * 0.34);
      // 进化目标往往没在图鉴当前页里，得单独请求，否则只有占位圆
      ensureSprites(this, steps.map((s) => s.id), () => this.reopenDetail(e));
      steps.forEach((s, i) => {
        const sx = (i - (steps.length - 1) / 2) * stepGap;
        const iy = y + 44;
        if (isSpriteReady(this, s.id)) {
          const img = this.add.image(sx, iy, `pk_${s.id}`).setDisplaySize(44, 44);
          c.add(img);
        } else {
          // 素材库没有该形态的贴图，用占位圆顶上，别让详情页缺一块
          const ph = this.add.circle(sx, iy, 20, UI.cardStroke, 0.5);
          c.add(ph);
        }
        const nm = this.add.text(sx, iy + 32, s.name, {
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
          fontSize: '10px', color: TEXT.main,
        }).setOrigin(0.5);
        c.add(nm);
        if (i === 0) {
          const arrow = this.add.text(sx + stepGap / 2, iy, '›', {
            fontFamily: 'sans-serif', fontSize: '20px', color: TEXT.dim,
          }).setOrigin(0.5);
          c.add(arrow);
        }
      });
    }

    c.add([closeBtn, closeText]);
  }

  private closeDetail() {
    this.detailEntry = undefined;
    if (!this.detail) return;
    const c = this.detail;
    this.detail = undefined;
    this.tweens.add({
      targets: c, scale: 0.92, alpha: 0, duration: 110,
      onComplete: () => c.destroy(true),
    });
  }

  /**
   * 贴图异步加载完成后重开详情页。
   * 用户可能已经关掉了详情，那就别硬弹回来。
   */
  private reopenDetail(e: Entry) {
    if (this.detailEntry?.id !== e.id) return;
    // 贴图已就绪才会走到这里，重开时 ensureSprites 是空操作，不会递归
    this.openDetail(e, this.detailUnlocked);
  }

  private buildBack() {
    const { height } = this.scale;
    // 翻页器占了底部一条，返回按钮抬高一点，跟箭头别撞
    const y = height - 26;
    const back = new RoundedPanel(this, 62, y, 96, 34, UI.secondary, 0.95, { radius: 10 })
      .setStrokeStyle(1.5, UI.secondaryStroke)
      .setInteractive({ useHandCursor: true })
      .setDepth(20);
    attachPressFeedback(back);
    this.add.text(62, height - 26, '← 返回', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '13px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    back.on('pointerup', () => { Sfx.click(); goTo(this, 'Menu'); });
  }
}

