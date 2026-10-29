import Phaser from 'phaser';
import { TRAITS, loadSave, type TraitId } from '../data/stats';
import { POKEMON_PLAYABLE, TYPE_COLORS } from '../data/pokedex';
import { MOVES } from '../data/moves';
import { openDevPanel, makeDevButton } from '../ui/DevPanel';

/** 从数组里随机抽 n 个不重复 */
function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, n);
}

export class MenuScene extends Phaser.Scene {
  /** 本局抽中的 3 个特性候选 */
  private traitChoices: typeof TRAITS[number][] = [];
  private selected: TraitId | null = null;
  /** 本局抽中的 3 个伙伴候选 */
  private partnerChoices: typeof POKEMON_PLAYABLE[number][] = [];
  private selectedStarter: string | null = null;

  constructor() { super('Menu'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');

    // 每次回到菜单都重新抽卡
    this.traitChoices = pickN(TRAITS, 3);
    this.partnerChoices = pickN(POKEMON_PLAYABLE, 3);
    this.selected = null;
    this.selectedStarter = null;
    // 场景复用：清空上一局残留的卡片引用，否则会指向已销毁对象
    this.traitCardRefs = [];
    this.partnerCardRefs = [];

    const save = loadSave();

    this.add.text(width / 2, height * 0.13, 'POKE SURVIVOR', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '34px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.13 + 36, '宝可梦幸存者 · 草原试炼', {
      fontFamily: 'sans-serif', fontSize: '14px', color: '#7fa8c0',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.13 + 54, 'ポケモンサバイバー · 草原の試練', {
      fontFamily: '"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif',
      fontSize: '10px', color: '#5f7a8c',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.13 + 78, `金币 ${save.coins}   最长生存 ${this.fmt(save.bestTime)}`, {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '12px', color: '#a8c4d8',
    }).setOrigin(0.5);

    this.buildTraitCards(width, height);
    this.buildPartnerCards(width, height);
    this.buildStartButton(width, height);

    makeDevButton(this, () => openDevPanel(this));
  }

  /** 第一段：特性 3 选 1 */
  private buildTraitCards(width: number, height: number) {
    this.add.text(width / 2, height * 0.29, '① 选择特性', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    const cardW = Math.min((width - 44) / 3, 104);
    const cardH = 108;
    const gap = 6;
    const startX = (width - (cardW * 3 + gap * 2)) / 2 + cardW / 2;
    const y = height * 0.29 + 30 + cardH / 2;

    this.traitChoices.forEach((t, i) => {
      const x = startX + i * (cardW + gap);
      const box = this.add.rectangle(x, y, cardW, cardH, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });
      const name = this.add.text(x, y - 28, t.name, {
        fontFamily: 'sans-serif', fontSize: '17px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      const desc = this.add.text(x, y + 12, t.desc, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#8fa8b8',
        wordWrap: { width: cardW - 14 }, align: 'center',
      }).setOrigin(0.5);
      const mark = this.add.text(x, y + cardH / 2 - 14, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#449ddf', fontStyle: 'bold',
      }).setOrigin(0.5);

      box.on('pointerdown', () => {
        this.selected = t.id;
        this.refreshTraitCards();
        this.startBtnRefresh?.();
      });

      (box as any).__traitBox = true;
      this.traitCardRefs.push({ box, name, desc, mark });
    });

    this.refreshTraitCards();
  }

  private traitCardRefs: {
    box: Phaser.GameObjects.Rectangle;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    mark: Phaser.GameObjects.Text;
  }[] = [];

  private refreshTraitCards() {
    this.traitCardRefs.forEach((r, i) => {
      const t = this.traitChoices[i];
      const on = t.id === this.selected;
      r.box.setStrokeStyle(2, on ? 0x449ddf : 0x1e3344);
      r.box.setFillStyle(on ? 0x16293a : 0x11202c);
      r.name.setColor(on ? '#449ddf' : '#ffffff');
      r.desc.setColor(on ? '#a8c4d8' : '#8fa8b8');
      r.mark.setText(on ? '已选择' : '');
    });
  }

  /** 第二段：伙伴 3 选 1，并列出它的招式 */
  private buildPartnerCards(width: number, height: number) {
    this.add.text(width / 2, height * 0.52, '② 选择伙伴', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#449ddf', fontStyle: 'bold',
    }).setOrigin(0.5);

    const cardW = Math.min((width - 44) / 3, 104);
    const cardH = 150;
    const gap = 6;
    const startX = (width - (cardW * 3 + gap * 2)) / 2 + cardW / 2;
    const y = height * 0.52 + 26 + cardH / 2;

    this.partnerChoices.forEach((p, i) => {
      const x = startX + i * (cardW + gap);
      const color = TYPE_COLORS[p.type] ?? 0x449ddf;
      const move = MOVES[p.move];

      const box = this.add.rectangle(x, y, cardW, cardH, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });

      const pkKey = `pk_${p.id}`;
      if (this.textures.exists(pkKey)) {
        this.add.image(x, y - 44, pkKey).setScale((cardW - 60) / 64);
      }

      this.add.text(x, y + 4, p.name, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);

      // 招式名 + 类型
      this.add.text(x, y + 22, move?.name ?? p.move, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5);

      this.add.text(x, y + 38, `${p.type} · ${move ? this.catZh(move.category) : ''}`, {
        fontFamily: 'sans-serif', fontSize: '9px', color: `#${color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);

      const stat = move
        ? `伤害 ${move.baseDamage}　冷却 ${(move.cooldown / 1000).toFixed(1)}s`
        : '';
      this.add.text(x, y + 54, stat, {
        fontFamily: 'sans-serif', fontSize: '9px', color: '#8fa8b8',
        wordWrap: { width: cardW - 12 }, align: 'center',
      }).setOrigin(0.5);

      const trait = move?.traits?.length
        ? move.traits.map((t) => this.traitZh(t)).join(' · ')
        : (move?.desc ?? '');
      this.add.text(x, y + 70, trait, {
        fontFamily: 'sans-serif', fontSize: '9px', color: '#6f8ca0',
        wordWrap: { width: cardW - 12 }, align: 'center',
      }).setOrigin(0.5);

      const mark = this.add.text(x, y - cardH / 2 + 10, '', {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#449ddf', fontStyle: 'bold',
      }).setOrigin(0.5);

      box.on('pointerdown', () => {
        this.selectedStarter = p.move;
        this.refreshPartnerCards();
        this.startBtnRefresh?.();
      });

      this.partnerCardRefs.push({ box, mark });
    });

    this.refreshPartnerCards();
  }

  private partnerCardRefs: { box: Phaser.GameObjects.Rectangle; mark: Phaser.GameObjects.Text }[] = [];

  private refreshPartnerCards() {
    this.partnerCardRefs.forEach((r, i) => {
      const p = this.partnerChoices[i];
      const on = p.move === this.selectedStarter;
      const color = TYPE_COLORS[p.type] ?? 0x449ddf;
      r.box.setStrokeStyle(2, on ? color : 0x1e3344);
      r.box.setFillStyle(on ? 0x16293a : 0x11202c);
      r.mark.setText(on ? '已选择' : '').setColor(`#${color.toString(16).padStart(6, '0')}`);
    });
  }

  private buildStartButton(width: number, height: number) {
    const y = height - 74;
    const btn = this.add.rectangle(width / 2, y, 220, 50, 0x24404f)
      .setStrokeStyle(2, 0x2b4256).setInteractive({ useHandCursor: true });
    const txt = this.add.text(width / 2, y, '请选择特性与伙伴', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#7d96a8', fontStyle: 'bold',
    }).setOrigin(0.5);

    const refresh = () => {
      const ok = !!this.selected && !!this.selectedStarter;
      btn.setFillStyle(ok ? 0x449ddf : 0x24404f);
      btn.setStrokeStyle(2, ok ? 0x449ddf : 0x2b4256);
      txt.setText(ok ? '开 始 游 戏' : '请选择特性与伙伴')
        .setColor(ok ? '#041018' : '#7d96a8');
    };
    this.startBtnRefresh = refresh;
    refresh();

    btn.on('pointerdown', () => this.startRun());
    btn.on('pointerover', () => { if (this.canStart()) btn.setFillStyle(0x63b4ef); });
    btn.on('pointerout', () => refresh());

    this.add.text(width / 2, height - 34, 'WASD / 方向键 移动 · 升级时按 1/2/3 选择', {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#4c6272',
    }).setOrigin(0.5);
  }

  private startBtnRefresh: (() => void) | null = null;

  private canStart() { return !!this.selected && !!this.selectedStarter; }

  private catZh(c: string) {
    return ({ melee: '近战', projectile: '弹道', aura: '光环', aoe: '范围', summon: '召唤' } as Record<string, string>)[c] ?? c;
  }

  private traitZh(t: string) {
    return ({
      homing: '追踪', pierce: '穿透', spread: '散射', orbit: '环绕',
      chain: '连锁', nova: '爆发', shockwave: '冲击波', slam: '落点砸击',
      sweep: '横扫', flurry: '连击', heal: '治疗',
    } as Record<string, string>)[t] ?? t;
  }

  private fmt(s: number) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  private startRun() {
    if (!this.canStart()) return;
    this.scene.start('Game', { trait: this.selected, starterMove: this.selectedStarter });
  }
}
