import Phaser from 'phaser';
import { loadSave } from '../data/stats';
import { formatScore } from '../data/score';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';
import { devTap, devTaps, devRevealed, setDevRevealed } from '../ui/devGate';
import { openHelpPanel } from '../ui/HelpPanel';
import { confirmOverwrite, openProfileCard } from '../ui/AccountRow';
import { openAuthPanel } from '../ui/AuthPanel';
import { openBenchmarkPanel } from '../ui/BenchmarkPanel';
import { currentSession, startSession } from '../data/session';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';
import { makeCoinIcon } from '../ui/Icons';
import { MenuBackdrop } from '../ui/MenuBackdrop';
import { UI, TEXT } from '../ui/Theme';
import { attachPressFeedback } from '../ui/Feedback';
import { RoundedPanel } from '../ui/RoundedPanel';

/** 登录页：动态背景 + 顶部 logo + 底部操作区 */
export class MenuScene extends Phaser.Scene {
  private backdrop?: MenuBackdrop;

  constructor() { super('Menu'); }

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    const save = loadSave();
    makeCoinIcon(this, 22);

    // 背景：地面自下而上卷动 + 主角居中 + 飘过的宝可梦 + 技能粒子
    this.backdrop = new MenuBackdrop(this);
    this.events.once('shutdown', () => { this.backdrop = undefined; });

    // ① Logo —— 中心落在屏幕垂直方向 1/3 处
    //
    // logo 资源已按 2x 显示尺寸预渲染成 644×193，这里固定 0.5 倍缩放：
    // 显示 322 逻辑像素，DPR 2 下正好 1:1 落在物理像素上。
    // 缩放比是整数，NEAREST 采样不会插值，边缘就不会翻出一圈白点。
    // 换图时必须用同一尺寸重出资源，否则又会变成非整数缩放。
    const logo = this.add.image(width / 2, height / 3, 'logo')
      .setScale(0.5).setDepth(20);

    // ② 左上角：金币（带硬币图标）+ 下方最长生存
    const padX = 18;
    const coinY = 26;
    this.add.image(padX + 11, coinY, 'ui_coin').setDisplaySize(22, 22).setDepth(20);
    this.add.text(padX + 28, coinY, `${save.coins}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
      fontSize: '17px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0, 0.5).setDepth(20);

    this.add.text(padX, coinY + 24, `最长生存 ${this.fmt(save.bestTime)}`, {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#cfe4f5',
    }).setOrigin(0, 0.5).setDepth(20).setShadow(0, 1, '#041018', 3);

    // 最高关卡 + 那一关的最高分。
    // 取「有记录的最高关」而不是 stageProgress —— 进度可能停在没打过的关，
    // 那关分数是 0，显示「第 5 关 0 分」很怪。这里只认真正打出过分的关。
    {
      const best = save.stageBest ?? [];
      let bestStage = -1;
      let bestScore = 0;
      best.forEach((v, i) => { if (v > bestScore) { bestScore = v; bestStage = i; } });
      const label = bestStage >= 0
        ? `最高 第${bestStage + 1}关 ${formatScore(bestScore)}`
        : '最高 第—关 —';
      this.add.text(padX, coinY + 42, label, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fa8b8',
      }).setOrigin(0, 0.5).setDepth(20).setShadow(0, 1, '#041018', 3);
    }

    // ③ 底部操作区
    //  上排：「强化」+「图鉴」并排，两个按钮合计宽度/高度与「开始」完全一致
    //  下排：「开始」主按钮
    const startW = 220;
    const startH = 54;
    const subGap = 10;
    const subW = (startW - subGap) / 2;   // 105
    const startY = height - 58 - startH / 2;
    const subY = startY - startH / 2 - 16 - startH / 2;
    const leftX = width / 2 - subGap / 2 - subW / 2;
    const rightX = width / 2 + subGap / 2 + subW / 2;

    // 账号行：全宽，放在强化/图鉴那排上方
    this.drawAccountRow(width / 2, subY - startH - 10, startW, 40);

    // 强化：左半
    const shopBtn = new RoundedPanel(this, leftX, subY, subW, startH, UI.secondary, 0.88)
      .setStrokeStyle(1.5, UI.secondaryStroke).setInteractive({ useHandCursor: true }).setDepth(20);
    attachPressFeedback(shopBtn);
    this.add.text(leftX, subY, '强 化', {
      fontFamily: 'sans-serif', fontSize: '15px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    shopBtn.on('pointerup', () => {
      Sfx.init(); Sfx.click();
      this.time.delayedCall(90, () => goTo(this, 'Shop'));
    });
    shopBtn.on('pointerover', () => shopBtn.setFillStyle(UI.secondaryHover, 0.95));
    shopBtn.on('pointerout', () => shopBtn.setFillStyle(UI.secondary, 0.88));

    // 图鉴：右半，与「强化」同尺寸同风格
    const dexBtn = new RoundedPanel(this, rightX, subY, subW, startH, UI.secondary, 0.88)
      .setStrokeStyle(1.5, UI.secondaryStroke).setInteractive({ useHandCursor: true }).setDepth(20);
    attachPressFeedback(dexBtn);
    this.add.text(rightX, subY, '图 鉴', {
      fontFamily: 'sans-serif', fontSize: '15px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    dexBtn.on('pointerup', () => {
      Sfx.init(); Sfx.click();
      this.time.delayedCall(90, () => goTo(this, 'Dex'));
    });
    dexBtn.on('pointerover', () => dexBtn.setFillStyle(UI.secondaryHover, 0.95));
    dexBtn.on('pointerout', () => dexBtn.setFillStyle(UI.secondary, 0.88));

    // 开始：主按钮，宽度撑开
    const btn = new RoundedPanel(this, width / 2, startY, startW, startH, UI.primary)
      .setStrokeStyle(2, UI.primaryStroke).setInteractive({ useHandCursor: true }).setDepth(20);
    attachPressFeedback(btn);
    this.add.text(width / 2, startY, '开 始', {
      fontFamily: 'sans-serif', fontSize: '19px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(21);
    // 跳转放在 pointerup：pointerdown 立刻切场景会让按钮来不及显示按下态，
    // 看起来像「点了没反应」。留一小段让缩放动画走完。
    btn.on('pointerup', () => {
      Sfx.init(); Sfx.click();
      this.time.delayedCall(90, () => goTo(this, 'MapSelect'));
    });
    btn.on('pointerover', () => btn.setFillStyle(UI.primaryLight));
    btn.on('pointerout', () => btn.setFillStyle(UI.primary));

    // 构建标识：标签·迭代数 · 日期 时间
    // 草地纹理会把细字冲淡 → 黑描边保证纯白可读
    const S = __BUILD_STAMP__;
    this.add.text(width / 2, height - 12, `${S.tag}·${S.iter} · ${S.date} ${S.time}`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);

    // 右上角按钮：左齿轮、右问号（问号连点 5 次开启开发者模式）
    this.makeHelpButton(width);
  }

  /**
   * 右上角问号：打开操作说明。
   * 开发者模式默认关闭，连点 5 次问号才显示齿轮（本次会话有效）。
   */
  /** 账号行：未登录显示「登录 / 注册」，已登录显示用户名 */
  /** 排行榜按钮：绿色圆钮，显示「榜」字，点开榜单 */
  private buildRankButton(x: number, y: number) {
    const c = this.add.container(x, y).setDepth(1900);
    const bg = this.add.circle(0, 0, 17, UI.green, 0.95)
      .setStrokeStyle(1.5, UI.greenStroke, 0.9).setInteractive({ useHandCursor: true });
    const icon = this.add.text(0, 0, '榜', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#04180d', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add([bg, icon]);

    bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      Sfx.click();
      openBenchmarkPanel(this);
    });
    bg.on('pointerover', () => bg.setFillStyle(UI.greenHover, 1));
    bg.on('pointerout', () => bg.setFillStyle(UI.green, 0.95));

    this.rankBtn = c;
    this.scale.on('resize', () => c.setPosition(this.scale.width - 34 - 44, y));
  }

  private rankBtn?: Phaser.GameObjects.Container;
  private accountRow?: Phaser.GameObjects.Container;
  private drawAccountRow(cx: number, y: number, w: number, h: number) {
    this.accountRow?.destroy(true);
    // 容器必须自己设 depth：子对象在容器内的 depth 不参与场景排序，
    // 不设会被背景漂浮的宝可梦盖住。与「开始」按钮同级 20/21。
    this.accountRow = this.add.container(0, 0).setDepth(20);
    const session = currentSession();
    const isLogin = !session;

    const panel = new RoundedPanel(this, cx, y, w, h, UI.greenDark, 0.95, { radius: 10 })
      .setStrokeStyle(1.5, UI.greenDarkStroke).setInteractive({ useHandCursor: true }).setDepth(21);
    attachPressFeedback(panel);
    const label = this.add.text(cx, y, isLogin ? '登 录 / 注 册' : session!.username, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#8fe0a8', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(22);
    this.accountRow.add([panel, label]);

    panel.on('pointerover', () => panel.setFillStyle(UI.greenDarkHover, 1));
    panel.on('pointerout', () => panel.setFillStyle(UI.greenDark, 0.95));
    panel.on('pointerup', () => {
      Sfx.init(); Sfx.click();
      if (isLogin) {
        confirmOverwrite(this, () => {
          openAuthPanel(this, (s) => {
            if (s) startSession(s);
            this.scene.restart();
          });
        });
      } else {
        openProfileCard(this, () => this.scene.restart());
      }
    });
  }

  private makeHelpButton(width: number) {
    const TOP_Y = (width < 640 ? 52 : 56) - 2;
    // 从右到左：问号 → 排行榜（绿）→ 齿轮（仅开发者模式）
    const helpX = width - 34;
    const rankX = width - 34 - 44;
    const gearX = width - 34 - 88;

    this.buildRankButton(rankX, TOP_Y);

    const btn = this.add.container(helpX, TOP_Y).setDepth(1900);
    const bg = this.add.circle(0, 0, 17, UI.secondary, 0.92)
      .setStrokeStyle(1.5, UI.primaryStroke, 0.75).setInteractive({ useHandCursor: true });
    const q = this.add.text(0, 0, '?', {
      fontFamily: 'sans-serif', fontSize: '18px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.add([bg, q]);

    bg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      if (this.revealDev(this)) return;   // 第 5 次点击只开面板，不弹操作说明
      Sfx.click();
      openHelpPanel(this);
    });
    bg.on('pointerover', () => bg.setFillStyle(UI.secondaryHover, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(UI.secondary, 0.92));
    this.scale.on('resize', () => btn.setPosition(this.scale.width - 34, TOP_Y));

    // 已开启过（同一会话返回主页）就直接补上齿轮
    if (devRevealed()) this.showDevGear(gearX, TOP_Y);
  }

  /** 连点计数：满 5 次把齿轮放出来 */
  private revealDev(scene: Phaser.Scene): boolean {
    if (devRevealed()) return false;
    devTap();
    if (devTaps() >= 5) {
      setDevRevealed();
      const width = scene.scale.width;
      const TOP_Y = (width < 640 ? 52 : 56) - 2;
      this.showDevGear(width - 34 - 88, TOP_Y);
      Sfx.select();
      return true;
    }
    return false;
  }

  private devGear?: Phaser.GameObjects.Container;

  private showDevGear(x: number, y: number) {
    if (this.devGear) { this.devGear.destroy(); }
    this.devGear = makeDevButton(this, () => openDevPanel(this));
    this.devGear.setPosition(x, y);
    this.scale.on('resize', () => this.devGear?.setPosition(this.scale.width - 34 - 88, y));
  }

  update(_time: number, delta: number) {
    this.backdrop?.update(delta);
  }

  private fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
}
