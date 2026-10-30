import Phaser from 'phaser';
import { MAP_THEMES, STAGE_COUNT } from '../data/maps';
import { loadSave, writeSave } from '../data/stats';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { UI, TEXT } from '../ui/Theme';

/** 每张地图在列表里的图标符号 */
const THEME_GLYPH: Record<string, string> = {
  grassland: '❀',
  forest: '♣',
  cave: '◈',
  swamp: '≈',
  volcano: '▲',
  ruins: '⌘',
};

/**
 * 第一步：选关。
 *
 * 6 张地图各是一关，按顺序解锁：通关第 N 关才开放第 N+1 关。
 * 右下角的锁图标是开发者开关，点一下在「按真实进度锁定」和
 * 「全部解锁」之间切换；它不改写真实进度，关掉就回到真实状态。
 */
export class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelect'); }

  private save = loadSave();
  private selected: number | null = null;
  private cards: {
    index: number;
    box: Phaser.GameObjects.Rectangle;
    name: Phaser.GameObjects.Text;
    sub: Phaser.GameObjects.Text;
    lock: Phaser.GameObjects.Text;
    icon: Phaser.GameObjects.Rectangle;
    glyph: Phaser.GameObjects.Text;
    base: number;
    locked: boolean;
  }[] = [];
  private startBtn!: Phaser.GameObjects.Rectangle;
  private startTxt!: Phaser.GameObjects.Text;
  private lockBtn!: Phaser.GameObjects.Container;
  private lockIcon!: Phaser.GameObjects.Text;
  private lockLabel!: Phaser.GameObjects.Text;

  create() {
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    this.save = loadSave();
    this.cards = [];
    this.selected = null;

    // 背景微光，与后面两步视觉统一
    const glow = this.add.graphics();
    glow.fillStyle(UI.primary, 0.055);
    glow.fillCircle(width / 2, height * 0.2, width * 0.75);

    // 标题坐标与特性页、伙伴页保持一致
    this.add.text(width / 2, height * 0.09, '选择关卡', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.09 + 28, '第 1 / 3 步 · 通关解锁下一关', {
      fontFamily: 'sans-serif', fontSize: '12px', color: TEXT.gold,
    }).setOrigin(0.5);

    this.buildCards(width, height);
    this.buildBackButton();
    this.buildStartButton(width, height);
    this.buildDevLock(width, height);
    this.refresh();
  }

  /** 当前可解锁到第几关（含） */
  private maxUnlockedIndex(): number {
    if (this.save.devAllStages) return STAGE_COUNT - 1;
    return Math.min(this.save.stageProgress ?? 0, STAGE_COUNT - 1);
  }

  private buildCards(width: number, height: number) {
    const topLimit = height * 0.21;
    const bottomLimit = height - 132;
    const gap = 8;
    // 单列列表：一行一关
    const cardW = Math.min(width - 44, 340);
    const cardH = Math.min((bottomLimit - topLimit - gap * (STAGE_COUNT - 1)) / STAGE_COUNT, 64);
    const iconSize = Math.min(cardH - 14, 46);

    MAP_THEMES.forEach((theme, i) => {
      const x = width / 2;
      const y = topLimit + i * (cardH + gap) + cardH / 2;

      const box = this.add.rectangle(x, y, cardW, cardH, UI.card)
        .setStrokeStyle(2, UI.cardStroke)
        .setInteractive({ useHandCursor: true });

      // 方形图标块：地图配色打底 + 装饰符号，作为关卡识别锚点
      const left = x - cardW / 2;
      const iconCx = left + 12 + iconSize / 2;
      const icon = this.add.rectangle(iconCx, y, iconSize, iconSize, theme.base)
        .setStrokeStyle(1.5, theme.ambient, 0.85);
      const glyph = this.add.text(iconCx, y, THEME_GLYPH[theme.id] ?? '·', {
        fontFamily: '"Apple Symbols", sans-serif', fontSize: `${Math.round(iconSize * 0.55)}px`,
        color: '#ffffff',
      }).setOrigin(0.5).setAlpha(0.9);

      const textX = iconCx + iconSize / 2 + 12;
      const name = this.add.text(textX, y - 9, theme.name, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
        fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      const sub = this.add.text(textX, y + 11, `第 ${i + 1} 关`, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#6f8ea6',
      }).setOrigin(0, 0.5);

      const lock = this.add.text(x + cardW / 2 - 16, y, '🔒', {
        fontFamily: '"Apple Symbols", sans-serif', fontSize: '14px', color: '#6f8ea6',
      }).setOrigin(0.5).setVisible(false);

      box.on('pointerdown', () => this.choose(i));
      box.on('pointerover', () => {
        if (!this.cards[i]?.locked && this.selected !== i) box.setStrokeStyle(2, UI.cardStrokeHover);
      });
      box.on('pointerout', () => {
        if (this.selected !== i) box.setStrokeStyle(2, this.cards[i]?.locked ? UI.cardStroke : UI.cardStroke);
      });

      this.cards.push({ index: i, box, name, sub, lock, icon, glyph, base: theme.base, locked: false });
    });
  }

  private choose(index: number) {
    const card = this.cards[index];
    if (!card || card.locked) { Sfx.hurt(); return; }
    this.selected = index;
    Sfx.select();
    this.refresh();
  }

  private buildBackButton() {
    const back = this.add.text(24, 30, '← 返回', {
      fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.dim,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => { Sfx.click(); goTo(this, 'Menu'); });
  }

  private buildStartButton(width: number, height: number) {
    const y = height - 68;
    this.startBtn = this.add.rectangle(width / 2, y, 220, 50, UI.disabled)
      .setStrokeStyle(2, UI.disabledStroke);
    this.startTxt = this.add.text(width / 2, y, '请选择关卡', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '16px', color: TEXT.off, fontStyle: 'bold',
    }).setOrigin(0.5);

    this.startBtn.setInteractive({ useHandCursor: true });
    this.startBtn.on('pointerdown', () => {
      if (this.selected === null) return;
      Sfx.click();
      goTo(this, 'TraitSelect', { stage: this.selected });
    });
  }

  /** 右下角开发者锁：切换「按进度锁定 / 全部解锁」 */
  private buildDevLock(width: number, height: number) {
    const x = width - 40;
    const y = height - 26;
    this.lockBtn = this.add.container(x, y);

    const bg = this.add.circle(0, 0, 16, UI.secondary, 0.92)
      .setStrokeStyle(1.5, UI.primaryStroke, 0.75).setInteractive({ useHandCursor: true });
    this.lockIcon = this.add.text(0, 0, '🔒', {
      fontFamily: '"Apple Symbols", sans-serif', fontSize: '14px', color: TEXT.gold,
    }).setOrigin(0.5);
    this.lockLabel = this.add.text(-24, 0, '', {
      fontFamily: 'sans-serif', fontSize: '10px', color: TEXT.dim,
    }).setOrigin(1, 0.5);

    this.lockBtn.add([bg, this.lockIcon, this.lockLabel]);

    bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      this.save = loadSave();
      this.save.devAllStages = !this.save.devAllStages;
      writeSave(this.save);
      Sfx.select();
      // 全解锁关掉后，若当前选中的关卡超出真实进度，清掉选择
      if (this.selected !== null && this.selected > this.maxUnlockedIndex()) this.selected = null;
      this.refresh();
    });
  }

  private refresh() {
    const maxIdx = this.maxUnlockedIndex();

    for (const c of this.cards) {
      const locked = c.index > maxIdx;
      c.locked = locked;
      const on = this.selected === c.index;

      if (locked) {
        c.box.setFillStyle(UI.disabled);
        c.box.setStrokeStyle(2, UI.cardStroke);
        c.name.setColor('#5a6b78');
        c.sub.setColor('#3f4c56');
        c.lock.setVisible(true);
        c.icon.setFillStyle(0x1a1f24);
        c.glyph.setAlpha(0.28);
      } else {
        c.box.setFillStyle(on ? UI.cardOn : UI.card);
        c.box.setStrokeStyle(on ? 2.5 : 2, on ? UI.primary : UI.cardStroke);
        c.name.setColor('#ffffff');
        c.sub.setColor('#6f8ea6');
        c.lock.setVisible(false);
        c.icon.setFillStyle(c.base);
        c.glyph.setAlpha(0.9);
      }
    }

    const ok = this.selected !== null;
    this.startBtn.setFillStyle(ok ? UI.primary : UI.disabled);
    this.startBtn.setStrokeStyle(2, ok ? UI.primaryStroke : UI.disabledStroke);
    this.startTxt.setColor(ok ? TEXT.onPrimary : TEXT.off);
    this.startTxt.setText(ok ? `开始第 ${(this.selected ?? 0) + 1} 关` : '请选择关卡');

    // 锁图标反映当前模式
    const allOpen = !!this.save.devAllStages;
    this.lockIcon.setText(allOpen ? '🔓' : '🔒');
    this.lockLabel.setText(allOpen ? '全解锁' : '已锁定');
    this.lockLabel.setColor(allOpen ? TEXT.gold : TEXT.dim);
  }
}
