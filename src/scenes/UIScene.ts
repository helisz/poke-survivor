import Phaser from 'phaser';
import { MOVES, RARITY_ZH } from '../data/moves';
import { RUN_SECONDS, MAX_SLOTS } from '../data/stats';
import { POKEMON_PLAYABLE } from '../data/pokedex';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';
import { devRevealed } from '../ui/devGate';
import { Sfx } from '../systems/Sfx';
import { MAP_THEMES } from '../data/maps';
import type { GameScene } from './GameScene';
import { installTextTextureCleanup, abandonRun } from '../systems/SceneFlow';
import { PICKUP_DEFS } from '../data/pickups';
import { UI, TEXT } from '../ui/Theme';
import { RoundedPanel } from '../ui/RoundedPanel';
import { attachPressFeedback } from '../ui/Feedback';
import { makeCoinIcon, makePermIcon } from '../ui/Icons';
import { isMuted, toggleMuted, onMuteChange } from '../systems/Audio';
import { formatScore } from '../data/score';

/** 招式类别中文名 */
const CAT_ZH: Record<string, string> = {
  melee: '近战', projectile: '弹道', aura: '光环', aoe: '范围', summon: '召唤',
};

/** 招式特性中文名 */
const TRAIT_ZH: Record<string, string> = {
  homing: '追踪', pierce: '穿透', spread: '散射', orbit: '环绕',
  chain: '连锁', nova: '爆发', shockwave: '冲击波', slam: '落点砸击',
  sweep: '横扫', flurry: '连击', heal: '治疗',
};

export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private expBar!: Phaser.GameObjects.Rectangle;
  private expBg!: Phaser.GameObjects.Rectangle;
  private timeText!: Phaser.GameObjects.Text;
  private lvText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private coinText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private slotIcons: {
    box: Phaser.GameObjects.Rectangle | RoundedPanel;
    icon: Phaser.GameObjects.Image;
    lv: Phaser.GameObjects.Text;
    hit: Phaser.GameObjects.Rectangle;
    cd: Phaser.GameObjects.Graphics;
    /** 左上角进化星级（1~3 颗五角星） */
    stars: Phaser.GameObjects.Text;
  }[] = [];
  private moveTip?: Phaser.GameObjects.Container;
  /** 属性强化行的顶边 y（屏幕坐标）。0 表示还没排过版 */
  buffTopY = 0;

  /** 底部小图标：属性强化叠加层 */
  private buffIcons: { bg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; txt: Phaser.GameObjects.Text }[] = [];
  /**
   * 场上未拾取道具的倒计时条（左下角，技能栏上方）。
   * 每个道具一个「小图标 + 剩余秒数」，过期消失。
   */
  private pickupChips: {
    bg: Phaser.GameObjects.Rectangle | RoundedPanel;
    icon: Phaser.GameObjects.Image;
    txt: Phaser.GameObjects.Text;
    key: string;
  }[] = [];
  /** 扣血飘字：只在 damageSeq 变化时生成 */
  private lastDmgSeq = -1;
  private dmgFlash?: Phaser.GameObjects.Text;

  /** 布局参数，唯一由 relayout() 计算 */
  private L = { hpW: 200, hpH: 14, hpY: 56, barW: 300, slotSize: 48, slotGap: 5, slotY: 600 };

  constructor() { super('UI'); }

  create(data: { game: GameScene }) {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    this.gs = data.game;
    this.slotIcons = [];

    this.hpBg = this.add.rectangle(0, 0, 200, 14, 0x33121a).setOrigin(0, 0.5);
    this.hpBar = this.add.rectangle(0, 0, 200, 14, 0x63c256).setOrigin(0, 0.5);
    this.hpText = this.add.text(0, 0, '140/140', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);

    this.expBg = this.add.rectangle(0, 0, 300, 6, UI.card).setOrigin(0, 0);
    // 宽度必须 > 0：Rectangle 的 displayWidth = width * scaleX，width=0 时 scaleX 永远算不出
    this.expBar = this.add.rectangle(0, 0, 1, 6, UI.primary).setOrigin(0, 0);

    this.timeText = this.add.text(0, 0, '0:00', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    this.lvText = this.add.text(0, 0, 'Lv.1', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '15px', color: TEXT.gold, fontStyle: 'bold',
    });
    // 本局金币：Lv 右边的图标 + 数字，和 Lv 同一行
    // UIScene 可能先于 Menu/Shop 启动，纹理不一定已生成，这里确保一次
    makeCoinIcon(this, 22);
    this.coinIcon = this.add.image(0, 0, 'ui_coin').setDisplaySize(14, 14);
    this.coinText = this.add.text(0, 0, '0', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '15px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.killText = this.add.text(0, 0, '击杀 0', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '12px', color: '#c8dce8',
    });
    // 分数：和击杀数同字号同色，紧贴在它下面一行
    this.scoreText = this.add.text(0, 0, '分数 0', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '12px', color: '#c8dce8',
    });

    this.layoutSlots();
    this.refreshBuffs();

    // 右上角：左齿轮（仅开发者模式）、右暂停（常驻）
    // 位置与主页的齿轮&问号一致
    this.buildTopRightButtons();

    this.scale.on('resize', this.onResize, this);
    // 进化仪式：GameScene 广播，这里负责让对应技能格闪一下
    this.gs.events.on('evolve-ceremony', this.onEvolveCeremony, this);
    // 本局结束：收掉可能还开着的开发者面板，避免盖住结算页
    this.gs.events.on('run-ended', this.closeDevPanel, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.gs.events.off('evolve-ceremony', this.onEvolveCeremony, this);
      this.gs.events.off('run-ended', this.closeDevPanel, this);
    });

    this.relayout();
  }

  /** 读取手机底部安全区（iPhone 手势条 / Android 导航栏） */
  private readSafeBottom(): number {
    try {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
      document.body.appendChild(el);
      const h = el.getBoundingClientRect().height;
      el.remove();
      if (h > 0) return Math.min(h, 60);
    } catch { /* ignore */ }
    // 兜底：手机浏览器通常有工具栏，多留一截
    return window.innerWidth < 520 ? 24 : 0;
  }

  private onResize() { this.relayout(); }

  /** 所有 UI 坐标的唯一真源 */
  /**
   * 进化仪式第四拍：被进化的那一格技能放大回弹 + 描边高亮一下。
   *
   * 玩家最需要的信息是「哪一格变强了」，所以这里只动那一格，
   * 不给整条技能栏加效果，避免视觉噪音。
   */
  private onEvolveCeremony(payload: { moveId: string; color: number; accent: number }) {
    const ids = this.gs.combat.slotIds;
    const idx = ids.indexOf(payload.moveId);
    if (idx < 0 || idx >= this.slotIcons.length) return;
    const slot = this.slotIcons[idx];

    // 放大回弹：Back 缓动做出「弹出来」的手感
    this.tweens.add({
      targets: [slot.box, slot.icon],
      scaleX: 1.35, scaleY: 1.35,
      duration: 150, yoyo: true, ease: 'Back.easeOut',
    });

    // 高亮描边：一圈金色光环向外扩散后消失
    const glow = this.add.rectangle(slot.box.x, slot.box.y, slot.box.width, slot.box.height)
      .setStrokeStyle(3, payload.color, 1).setDepth(30);
    this.tweens.add({
      targets: glow, scaleX: 1.4, scaleY: 1.4, alpha: 0, duration: 520, ease: 'Cubic.easeOut',
      onComplete: () => glow.destroy(),
    });
  }

  private relayout() {
    if (!this.expBg) return;
    const { width, height } = this.scale;
    const pad = width < 480 ? 8 : 12;
    const narrow = width < 520;

    // 经验条：贴顶，左右留 pad
    const barW = Math.max(120, width - pad * 2);
    this.L.barW = barW;
    this.expBg.setPosition(pad, 6).setDisplaySize(barW, 6);
    this.expBar.setPosition(pad, 6).setDisplaySize(barW * this.expRatio(), 6);

    // 计时器：居中
    this.timeText.setPosition(width / 2, 16).setFontSize(narrow ? 17 : 20);

    // 血条：左上
    const hpW = Math.min(width * 0.46, 240);
    const hpH = narrow ? 12 : 14;
    const hpY = narrow ? 52 : 56;
    this.L.hpW = hpW;
    this.L.hpH = hpH;
    this.L.hpY = hpY;
    this.hpBg.setPosition(pad, hpY).setDisplaySize(hpW, hpH);
    this.hpBar.setPosition(pad, hpY).setDisplaySize(hpW * this.hpRatio(), hpH);
    this.hpText.setPosition(pad + hpW + 6, hpY).setFontSize(narrow ? 10 : 11);

    // 等级/击杀：血条下方（不贴底，避开招式槽与手机安全区）
    const lvY = hpY + hpH / 2 + 8;
    this.lvText.setPosition(pad, lvY);
    // 金币跟在 Lv 文字右边，垂直居中对齐 Lv（lvText 顶端对齐，故 +半行高）
    const lvMidY = lvY + this.lvText.height / 2;
    const coinX = pad + this.lvText.width + 14;
    this.coinIcon.setPosition(coinX + 7, lvMidY).setDisplaySize(14, 14);
    this.coinText.setPosition(coinX + 18, lvMidY);
    this.killText.setPosition(pad, hpY + hpH / 2 + 28);
    this.scoreText.setPosition(pad, hpY + hpH / 2 + 46);

    // 招式槽贴底，只留一点边距；属性强化一行移到它上面
    const size = narrow ? 40 : 48;
    const safeBottom = this.readSafeBottom();
    // 技能槽离屏幕底部的最小留白（手机安全区 + 视觉呼吸）
    const edgeGap = (narrow ? 14 : 16) + safeBottom;
    this.L.slotSize = size;
    this.L.slotGap = narrow ? 4 : 5;
    this.L.slotY = height - edgeGap - size / 2;

    this.layoutSlots();
  }

  private hpRatio() {
    if (!this.gs || !this.gs.player) return 1;
    return Phaser.Math.Clamp(this.gs.stats.hp / this.gs.stats.maxHp, 0, 1);
  }

  private expRatio() {
    if (!this.gs || !this.gs.expNext) return 0;
    return Phaser.Math.Clamp(this.gs.exp / this.gs.expNext, 0, 1);
  }

  update() {
    if (!this.gs || !this.gs.player) return;

    const ratio = this.hpRatio();
    this.hpBar.setDisplaySize(this.L.hpW * ratio, this.L.hpH);
    this.hpBar.setFillStyle(ratio > 0.5 ? 0x63c256 : ratio > 0.25 ? 0xf7d02c : 0xd0402c);

    // HP 数字：显示四舍五入后的当前/上限
    const st = this.gs.stats;
    this.hpText.setText(`${Math.ceil(st.hp)}/${Math.round(st.maxHp)}`);

    // 扣血飘字：血条右侧弹出 -N，快速上浮淡出
    const p = this.gs.player;
    if (p.damageSeq !== this.lastDmgSeq) {
      this.lastDmgSeq = p.damageSeq;
      this.flashDamage(p.lastDamage);
    }

    this.expBar.setDisplaySize(this.L.barW * this.expRatio(), 6);

    const left = Math.max(0, RUN_SECONDS - this.gs.elapsed);
    const m = Math.floor(left / 60), sec = Math.floor(left % 60);
    this.timeText.setText(`${m}:${String(sec).padStart(2, '0')}`);

    this.lvText.setText(`Lv.${this.gs.level}`);
    // 本局金币，与结算页同一公式（GameOverScene: floor(time/6) + kills）
    this.coinText.setText(String(Math.floor(this.gs.elapsed / 6) + this.gs.combat.kills));
    this.killText.setText(`击杀 ${this.gs.combat.kills}`);
    this.scoreText.setText(`分数 ${formatScore(this.gs.score)}`);

    this.syncSlots();
    this.drawCooldowns();
    this.layoutPickupChips();
  }

  /** 冷却矩形遮罩：从上往下退，越少越快放完 */
  private drawCooldowns() {
    const size = this.L.slotSize;
    const half = size / 2;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slotIcons[i];
      const id = this.gs.combat.slotIds[i];
      if (!slot) continue;
      const g = slot.cd;
      g.clear();
      if (!id) { g.setVisible(false); continue; }

      const p = this.gs.combat.getCooldownProgress(i);
      if (p <= 0.001) { g.setVisible(false); continue; }

      g.setVisible(true);
      // 剩余比例 p：遮罩从顶部盖到这里，往下退
      const h = size * p;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(-half, -half, size, h);

      // 遮罩下沿一条浅蓝细线，让边界清楚
      g.fillStyle(0x9cc4dc, 0.55);
      g.fillRect(-half, -half + h - 1, size, 1.5);
    }
  }

  /** 同步底部属性强化小图标 */
  refreshBuffs() {
    const stacks = this.gs.statStacks ?? {};
    // 用强化页同一套程序化图标（perm_hp / perm_damage / ...），
    // 不再用「攻/速/体/磁/冷」单字 —— 图标更直观，也不用给每种字挑颜色。
    const defs = [
      { id: 'atk', icon: 'perm_damage' },
      { id: 'spd', icon: 'perm_speed' },
      { id: 'hp', icon: 'perm_hp' },
      { id: 'pick', icon: 'perm_pickup' },
      { id: 'cd', icon: 'perm_cd' },
    ].filter((d) => (stacks[d.id] ?? 0) > 0);

    // 属性图标是程序化画的（和强化页同一套），UIScene 不保证在 Shop 之后启动，
    // 这里确保纹理存在，否则 add.image 会拿到缺失纹理
    for (const d of ['perm_damage', 'perm_speed', 'perm_hp', 'perm_pickup', 'perm_cd']) {
      makePermIcon(this, d.replace('perm_', ''));
    }

    // 图标对象数量对齐
    while (this.buffIcons.length < defs.length) {
      // 无边框、无底色：直接是图标 + 右下角层数
      const bg = this.add.rectangle(0, 0, 18, 18, 0x0e1a24, 0).setDepth(496).setVisible(false);
      const icon = this.add.image(0, 0, 'perm_hp').setDepth(497).setVisible(false);
      const txt = this.add.text(0, 0, '', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif',
        fontSize: '9px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(1, 1).setDepth(498);
      this.buffIcons.push({ bg, icon, txt });
    }

    this.buffIcons.forEach((b, i) => {
      const d = defs[i];
      if (!d) { b.bg.setVisible(false); b.icon.setVisible(false); b.txt.setVisible(false); return; }
      b.bg.setVisible(false);
      b.icon.setVisible(true).setTexture(d.icon);
      b.txt.setVisible(true).setText(String(stacks[d.id]))
        .setColor('#ffffff')
        .setOrigin(1, 1);
    });

    this.layoutBuffs();
  }

  private syncSlots() {
    const ids = this.gs.combat.slotIds;
    const size = this.L.slotSize;

    // ⚠️ 不用 Container 装招式格：Phaser 的 Container 子对象不参与场景命中检测，
    // 用 setInteractive 的 Container 坐标换算在缩放后会偏。
    // 改为场景顶层独立对象，统一由 layoutSlots() 摆放。
    while (this.slotIcons.length < MAX_SLOTS) {
      const i = this.slotIcons.length;
      // 技能栏不加阴影：格子贴在一起，投影会串成一圈黑框
      const box = new RoundedPanel(this, 0, 0, 48, 48, 0x0e1a24, 1, { radius: 0 })
        .setStrokeStyle(2, UI.cardStroke)
        .setDepth(500);
      box.setShadowVisible(false);
      const icon = this.add.image(0, 0, 'pk_25').setScale(0.55).setDepth(501).setVisible(false);
      const lv = this.add.text(0, 0, '1', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '11px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(1, 1).setDepth(502).setVisible(false);

      // 冷却扇形时钟：盖在图标上，随剩余时间收窄
      const cd = this.add.graphics().setDepth(503).setVisible(false);

      // 独立透明命中层：不参与视觉，只负责点击，尺寸可以给得很大
      // （视觉框本身不做 interactive，避免 setSize 每帧重置 hitArea 导致点不中）
      const hit = this.add.rectangle(0, 0, 48, 48, 0xffffff, 0)
        .setDepth(504)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.showMoveTip(i));

      // 进化星级：图标左上角，金色带描边，未进化时不显示
      const stars = this.add.text(0, 0, '', {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        fontSize: '10px', color: '#ffd75e', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0).setDepth(505).setVisible(false);

      this.slotIcons.push({ box, icon, lv, hit, cd, stars });
    }

    for (let i = 0; i < MAX_SLOTS; i++) {
      const slot = this.slotIcons[i];
      const { box, icon, lv } = slot;
      const id = ids[i];
      const def = id ? MOVES[id] : undefined;

      box.setVisible(true);
      // 用 setSize 而不是 setDisplaySize：Rectangle 的几何尺寸变了，命中区才好同步
      box.setSize(size, size);

      // 命中层：比视觉大 10px（手指容错），独立对象所以每帧改尺寸不会破坏输入
      const hitSize = size + 10;
      slot.hit.setVisible(true);
      slot.hit.setSize(hitSize, hitSize);

      if (def) {
        box.setFillStyle(0x0e1a24, 0.92);
        box.setStrokeStyle(2, def.color);
        const pkId = this.gs.combat.getDisplayPokeId(id);
        icon.setVisible(true).setTexture(`pk_${pkId}`);
        icon.setScale((size / 64) * 0.9);
        lv.setVisible(true).setOrigin(1, 1)
          .setFontSize(Math.max(9, Math.round(size * 0.28)))
          .setText(String(this.gs.combat.getMoveLevel(id)));

        // 进化等级 → 星数。icon 定位在 relayout 里统一处理，这里只写内容
        const evoStage = this.gs.combat.getEvoStage(id);
        if (evoStage > 0) {
          const n = Math.min(3, evoStage);
          slot.stars.setVisible(true)
            .setFontSize(Math.max(9, Math.round(size * 0.26)))
            .setText('★'.repeat(n));
        } else {
          slot.stars.setVisible(false);
        }
      } else {
        // 空槽：暗底 + 虚线感（低透明度描边）+ 小加号
        box.setFillStyle(0x0a1219, 0.55);
        box.setStrokeStyle(1, 0x2b4051, 0.9);
        icon.setVisible(false);
        lv.setVisible(false);
        slot.stars.setVisible(false);
      }
    }

    this.layoutSlots();
  }

  /** 右上角两颗钮：左齿轮（开发者模式才显示）、右暂停（常驻） */
  private buildTopRightButtons() {
    const TOP_Y = (this.scale.width < 640 ? 52 : 56) - 2;
    const pauseX = this.scale.width - 34;
    const gearX = this.scale.width - 34 - 44;

    // 暂停：半透明黑屏 + 中央恢复按钮
    const pause = this.add.container(pauseX, TOP_Y).setDepth(1900);
    const pBg = this.add.circle(0, 0, 17, UI.secondary, 0.92)
      .setStrokeStyle(1.5, UI.primaryStroke, 0.75).setInteractive({ useHandCursor: true });
    const pIcon = this.add.text(0, 0, '❚❚', {
      fontFamily: 'sans-serif', fontSize: '13px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5);
    pause.add([pBg, pIcon]);
    pBg.on('pointerdown', (p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
      ev?.stopPropagation?.();
      Sfx.click();
      this.showPauseOverlay();
    });
    this.pauseBtn = pause;

    // 齿轮：只有开发者模式开着才有
    if (devRevealed()) {
      this.devBtn = makeDevButton(this, () => this.openDev(), 1900);
      this.devBtn.setPosition(gearX, TOP_Y);
    }

    this.scale.on('resize', () => {
      const w = this.scale.width;
      this.pauseBtn?.setPosition(w - 34, TOP_Y);
      this.devBtn?.setPosition(w - 34 - 44, TOP_Y);
    });
  }

  /** 半透明黑屏 + 中央「恢复」按钮。点遮罩不恢复，必须点按钮 */
  private showPauseOverlay() {
    if (this.pauseOverlay) return;
    this.gs.paused = true;
    this.gs.scene.pause();

    const { width, height } = this.scale;
    const c = this.add.container(0, 0).setDepth(2100);
    const dim = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6)
      .setInteractive();
    c.add(dim);

    c.add(this.add.text(width / 2, height / 2 - 46, '已暂停', {
      fontFamily: 'sans-serif', fontSize: '22px', color: TEXT.gold, fontStyle: 'bold',
    }).setOrigin(0.5));

    const btn = new RoundedPanel(this, width / 2, height / 2 + 8, 168, 46, UI.primary, 1, { radius: 12 })
      .setStrokeStyle(1.5, UI.primaryStroke).setInteractive({ useHandCursor: true });
    attachPressFeedback(btn);
    btn.on('pointerdown', () => { Sfx.select(); this.hidePauseOverlay(); });
    c.add(btn);
    c.add(this.add.text(width / 2, height / 2 + 8, '恢复', {
      fontFamily: 'sans-serif', fontSize: '17px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5));

    // 放弃本关：与开发者面板同款「点两次确认」。
    // 不能只靠双击间隔判断 —— 误触一次就丢整局，所以第一次点了要变文案+变色，
    // 3 秒内不确认自动解除。
    const qy = height / 2 + 70;
    const quitBtn = new RoundedPanel(this, width / 2, qy, 168, 38, 0x3a1f22, 1, { radius: 10 })
      .setStrokeStyle(1.5, 0x6f3a3f).setInteractive({ useHandCursor: true });
    attachPressFeedback(quitBtn);
    const quitTxt = this.add.text(width / 2, qy, '放弃本关', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#e08a90', fontStyle: 'bold',
    }).setOrigin(0.5);
    let armed = false;
    let armTimer: Phaser.Time.TimerEvent | null = null;
    quitBtn.on('pointerdown', () => {
      if (!armed) {
        armed = true;
        quitTxt.setText('再点一次确认');
        quitBtn.setFillStyle(0x5a2a2e).setStrokeStyle(1.5, 0x9a4a52);
        armTimer?.remove();
        armTimer = this.time.delayedCall(3000, () => {
          armed = false;
          quitTxt.setText('放弃本关');
          quitBtn.setFillStyle(0x3a1f22).setStrokeStyle(1.5, 0x6f3a3f);
        });
        return;
      }
      armTimer?.remove();
      this.quitToMenu();
    });
    c.add([quitBtn, quitTxt]);

    // 静音：和主页右上角那个共用全局状态，图标两边同步。
    // 「恢复」宽 168 居中，右边缘在 width/2+84，静音按钮贴在它右边 8px。
    const muteSize = 40;
    const muteX = width / 2 + 84 + 8 + muteSize / 2;
    const muteBtn = new RoundedPanel(this, muteX, height / 2 + 8, muteSize, muteSize,
      UI.secondary, 0.95, { radius: 10 })
      .setStrokeStyle(1.5, UI.primaryStroke, 0.8).setInteractive({ useHandCursor: true });
    attachPressFeedback(muteBtn);
    const muteIcon = this.add.text(muteX, height / 2 + 8, isMuted() ? '🔇' : '🔊', {
      fontFamily: 'sans-serif', fontSize: '17px',
    }).setOrigin(0.5);
    const unsub = onMuteChange((m) => muteIcon.setText(m ? '🔇' : '🔊'));
    c.once('destroy', unsub);
    muteBtn.on('pointerdown', () => {
      const m = toggleMuted();
      if (!m) Sfx.select();
    });
    c.add([muteBtn, muteIcon]);

    this.pauseOverlay = c;
  }

  private hidePauseOverlay() {
    this.pauseOverlay?.destroy(true);
    this.pauseOverlay = undefined;
    this.gs.paused = false;
    this.gs.scene.resume();
  }

  /** 打开开发者面板（暂停游戏，关闭后恢复） */
  private openDev() {
    this.gs.paused = true;
    this.gs.scene.pause();
    this.devPanel = openDevPanel(this, (save) => {
      const st = this.gs.player.stats;
      st.damageMul = this.gs.baseDamageMul * (save.devDmgMul ?? 1);
      st.damageTakenMul = this.gs.baseTakenMul * (save.devTakenMul ?? 1);
      st.expMul = this.gs.baseExpMul * (save.devExpMul ?? 1);
    }, () => {
      this.gs.paused = false;
      this.gs.scene.resume();
    }, {
      themes: MAP_THEMES.map((t) => ({ name: t.name, nameJp: t.nameJp })),
      current: () => this.gs.devTimeStage,
      jump: (i: number) => this.gs.jumpToMap(i),
    }, () => this.quitToMenu());
  }

  /** 点击招式槽 → 气泡显示招式说明 */
  private showMoveTip(index: number) {
    const slot = this.slotIcons[index];
    if (!slot) return;
    const id = this.gs.combat.slotIds[index] ?? null;

    this.hideMoveTip();

    const size = this.L.slotSize;
    const width = this.scale.width;
    const height = this.scale.height;

    let title = '空槽位';
    let sub = '升级时可选择招式填入';
    let body = '';
    let color = 0x7d96a8;

    if (id && MOVES[id]) {
      const d = MOVES[id];
      const lvl = this.gs.combat.getMoveLevel(id);
      const p = POKEMON_PLAYABLE.find((x) => x.move === id);
      const evoName = this.gs.combat.getDisplayName(id);
      const evoStage = this.gs.combat.getEvoStage(id);
      title = `${evoName}  Lv.${lvl}${evoStage > 0 ? ' ★' : ''}`;
      sub = `${evoStage > 0 ? '已进化' : (p ? p.name : '')} · ${d.type} · ${CAT_ZH[d.category] || d.category}`;
      body = `${d.desc}\n伤害 ${d.baseDamage}　冷却 ${(d.cooldown / 1000).toFixed(2)}s` +
        (d.count ? `　弹数 ${d.count}` : '') +
        (d.pierce ? `　穿透 ${d.pierce}` : '') +
        (d.traits?.length ? `\n特性 ${d.traits.map((t) => TRAIT_ZH[t] ?? t).join(' · ')}` : '') +
        (d.rarity && d.rarity !== 'common' ? `\n稀有度 ${RARITY_ZH[d.rarity]}` : '') +
        (d.hasEvolution ? '　可进化 ★' : '');
      color = d.color;
    }

    const tip = this.add.container(0, 0).setDepth(999);
    const padX = 11, padY = 9, maxW = Math.min(width - 32, 260);
    const tTitle = this.add.text(padX, padY, title, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      wordWrap: { width: maxW - padX * 2 },
    });
    const tSub = this.add.text(padX, tTitle.y + tTitle.height + 3, sub, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '11px', color: '#8fa8b8',
      wordWrap: { width: maxW - padX * 2 },
    });
    const parts: Phaser.GameObjects.GameObject[] = [tTitle, tSub];
    let lastY = tSub.y + tSub.height;

    if (body) {
      const tBody = this.add.text(padX, lastY + 6, body, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '11.5px', color: '#c8dae6', lineSpacing: 3,
        wordWrap: { width: maxW - padX * 2 },
      });
      parts.push(tBody);
      lastY = tBody.y + tBody.height;
    }

    const boxW = maxW;
    const boxH = lastY + padY;
    const bg = this.add.rectangle(0, 0, boxW, boxH, 0x0b151d, 0.97)
      .setOrigin(0, 0)
      .setStrokeStyle(1.5, color, 0.9);
    tip.add([bg, ...parts]);

    // 位置：气泡在格子正上方，超出屏幕则夹紧
    const cx = slot.box.x, cy = slot.box.y;
    let tx = cx - boxW / 2;
    let ty = cy - size / 2 - boxH - 8;
    if (ty < 60) ty = cy + size / 2 + 8;      // 上方放不下 → 放下面
    tx = Phaser.Math.Clamp(tx, 8, width - boxW - 8);
    ty = Phaser.Math.Clamp(ty, 8, height - boxH - 8);
    tip.setPosition(tx, ty);

    this.moveTip = tip;

    // 点空白处关闭：延后注册，避免同一次点击立刻把气泡关掉
    this.time.delayedCall(120, () => {
      if (this.moveTip !== tip) return;
      const close = () => this.hideMoveTip();
      this.input.once('pointerdown', close);
    });
  }

  private hideMoveTip() {
    if (this.moveTip) {
      this.moveTip.destroy(true);
      this.moveTip = undefined;
    }
  }

  /** 血条右侧弹出扣血数字，400ms 内上浮淡出 */
  private flashDamage(amount: number) {
    const n = Math.max(1, Math.round(amount));
    const x = this.hpText.x + this.hpText.displayWidth + 8;
    const y = this.L.hpY;

    const t = this.add.text(x, y, `-${n}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '15px', color: '#ff5252', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(950);

    this.dmgFlash?.destroy();
    this.dmgFlash = t;

    this.tweens.add({
      targets: t, y: y - 16, alpha: 0, scale: 1.25,
      duration: 420, ease: 'Quad.easeOut',
      onComplete: () => { t.destroy(); if (this.dmgFlash === t) this.dmgFlash = undefined; },
    });
  }

  /** 招式槽排列：固定 6 格，整体居中；仅重排坐标，不销毁气泡（update 每帧调用） */
  private layoutSlots() {
    const { width } = this.scale;
    const n = MAX_SLOTS;
    const size = this.L.slotSize;
    const gap = this.L.slotGap;
    const totalW = n * size + (n - 1) * gap;
    const startX = (width - totalW) / 2 + size / 2;

    for (let i = 0; i < Math.min(n, this.slotIcons.length); i++) {
      const s = this.slotIcons[i];
      const sx = startX + i * (size + gap);
      s.box.setPosition(sx, this.L.slotY);
      s.icon.setPosition(sx, this.L.slotY);
      s.hit.setPosition(sx, this.L.slotY);
      s.lv.setPosition(sx + size / 2 - 2, this.L.slotY + size / 2 - 1);
      // 星标贴图标左上角，稍微压进格子一点，视觉上像挂在角上
      s.stars.setPosition(sx - size / 2 + 2, this.L.slotY - size / 2 + 1);
      s.cd.setPosition(sx, this.L.slotY);
    }

    this.layoutBuffs();
  }

  /** 面板对象引用：本局结束时需要能主动收掉 */
  private devPanel?: Phaser.GameObjects.Container;
  /** 右上角暂停按钮 / 开发者齿轮 / 暂停遮罩 */
  private pauseBtn?: Phaser.GameObjects.Container;
  private devBtn?: Phaser.GameObjects.Container;
  private pauseOverlay?: Phaser.GameObjects.Container;

  /** 本局结束（死亡/过关）时收掉开发者面板 */
  private closeDevPanel() {
    if (this.devPanel) {
      this.devPanel.destroy(true);
      this.devPanel = undefined;
    }
    this.gs.paused = false;
  }

  /**
   * 同步左下角的「道具倒计时」小条。
   *
   * 只显示还躺在地上的道具（pickups.arrows 是每帧重建的），
   * 按种类聚合：同种道具只留最靠前的那个，避免 3 块磁铁刷出 3 个条。
   * 位置固定在屏幕左下角、技能栏上方，不随相机移动。
   */
  private layoutPickupChips() {
    const { width, height } = this.scale;
    // 显示的是「吃到之后效果的剩余时间」，不是地上道具还能躺多久。
    // 磁铁是瞬发效果（吸取全场经验），不参与倒计时显示。
    const byKind = new Map<string, number>();
    if (this.gs.shieldTimer > 0) byKind.set('shield', this.gs.shieldTimer);
    if (this.gs.swordTimer > 0) byKind.set('sword', this.gs.swordTimer);
    // 剩余时间短的排前面，让最紧急的贴在最下面
    const entries = [...byKind.entries()].sort((a, b) => a[1] - b[1]);

    const size = Math.max(20, Math.round(this.L.slotSize * 0.5));
    const gap = 6;
    const pad = width < 480 ? 12 : 16;
    // 技能栏上沿再往上一点，避开 buff 行
    const baseY = this.L.slotY - this.L.slotSize / 2 - size - 26;

    // 补足对象池
    while (this.pickupChips.length < entries.length) {
      const bg = new RoundedPanel(this, 0, 0, size + 34, size, UI.card, 0.92, { radius: 8 })
        .setStrokeStyle(1.5, UI.cardStroke).setDepth(40);
      bg.setShadowVisible(false);
      const icon = this.add.image(0, 0, 'pk_magnet')
        .setDisplaySize(size - 6, size - 6).setDepth(41);
      const txt = this.add.text(0, 0, '', {
        fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color: '#ffd75e',
      }).setOrigin(0, 0.5).setDepth(42);
      this.pickupChips.push({ bg, icon, txt, key: '' });
    }

    this.pickupChips.forEach((c, i) => {
      const e = entries[i];
      if (!e) {
        c.bg.setVisible(false); c.icon.setVisible(false); c.txt.setVisible(false);
        return;
      }
      const [kind, life] = e;
      const def = PICKUP_DEFS[kind as keyof typeof PICKUP_DEFS];
      const y = baseY - i * (size + gap);
      // 从下往上排：第一个贴最下面
      const left = pad;
      c.bg.setVisible(true).setPosition(left + (size + 34) / 2, y);
      c.icon.setVisible(true).setTexture(this.pickupIconKey(kind as string))
        .setPosition(left + size / 2 + 3, y);
      const secs = Math.max(0, Math.ceil(life));
      c.txt.setVisible(true).setPosition(left + size + 10, y).setText(`${secs}s`);
      // 快过期时转红，给一点紧迫感
      c.txt.setColor(secs <= 5 ? '#ff6b6b' : '#ffd75e');
      c.bg.setStrokeStyle(1.5, secs <= 5 ? 0xd94f4f : UI.cardStroke);
      void def;
    });
  }

  /** 道具种类 → 图标纹理 key */
  private pickupIconKey(kind: string): string {
    return kind === 'magnet' ? 'pk_magnet'
      : kind === 'shield' ? 'pk_shield_pickup'
        : 'pk_sword_pickup';
  }

  /** 底部属性强化小图标：居中一行，放在技能槽正下方 */
  private layoutBuffs() {
    const { width } = this.scale;
    const n = this.buffIcons.length;
    if (!n) return;

    // 尺寸缩小：无边框后图标可以更紧凑，约为技能格的 0.46
    const bs = Math.max(16, Math.round(this.L.slotSize * 0.46));
    const gap = 8;
    const totalW = n * bs + (n - 1) * gap;
    const startX = (width - totalW) / 2 + bs / 2;
    // 属性强化行在技能槽正上方，间隔 6px
    const y = this.L.slotY - this.L.slotSize / 2 - 6 - bs / 2;
    // 记下属性行顶边，GameScene 的 BOSS 血条要靠它定位（血条在 GameScene 里画，
    // 它看不到这里的布局，只能读这个值）
    this.buffTopY = y - bs / 2;

    for (let i = 0; i < n; i++) {
      const b = this.buffIcons[i];
      const x = startX + i * (bs + gap);
      b.bg.setSize(bs, bs).setPosition(x, y);
      b.icon.setPosition(x, y).setDisplaySize(bs, bs);
      // 层数贴在图标右下角，白字，稍微压出边界一点更紧凑
      b.txt.setPosition(x + bs / 2 + 1, y + bs / 2 + 1)
        .setFontSize(Math.max(9, Math.round(bs * 0.5)));
    }
  }

  /**
   * 放弃本局：清场回主菜单，不结算金币。
   *
   * 顺序与 GameOverScene 同源踩过的坑：
   *  1. this.scene.stop() 停的是 UIScene 自己，调用后本方法后续语句可能不再执行
   *     → 必须用 scene manager，并先 start('Menu') 再停别的
   *  2. ScenePlugin.stop() 不是立即生效，它只是排队，因此不能靠"停自己"来收尾
   *  3. 任何全屏遮罩/交互层留在最上层都会吞掉主菜单的指针事件
   */
  private quitToMenu() {
    Sfx.click();
    this.gs.paused = false;
    abandonRun(this);
  }
}
