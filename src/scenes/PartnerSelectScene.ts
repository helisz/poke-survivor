import Phaser from 'phaser';
import { POKEMON_PLAYABLE, TYPE_COLORS } from '../data/pokedex';
import { MOVES } from '../data/moves';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';

/** 从数组里随机抽 n 个不重复 */
function pickN<T>(arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  Phaser.Utils.Array.Shuffle(pool);
  return pool.slice(0, n);
}

/** 第三步：伙伴 3 选 1（排除无法造成伤害的招式） */
export class PartnerSelectScene extends Phaser.Scene {
  private trait: string | null = null;
  private choices: typeof POKEMON_PLAYABLE[number][] = [];
  private selected: string | null = null;
  private cardRefs: { box: Phaser.GameObjects.Rectangle; mark: Phaser.GameObjects.Text }[] = [];
  private startBtn!: Phaser.GameObjects.Rectangle;
  private startTxt!: Phaser.GameObjects.Text;

  constructor() { super('PartnerSelect'); }

  init(data: { trait?: string }) {
    this.trait = data?.trait ?? null;
  }

  create() {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0a1620');
    this.cardRefs = [];
    this.selected = null;

    // 排除无法造成伤害的招式（baseDamage <= 0，如「晨光」纯治疗）
    const damageDealers = POKEMON_PLAYABLE.filter((p) => {
      const m = MOVES[p.move];
      return m && m.baseDamage > 0;
    });
    this.choices = pickN(damageDealers, Math.min(3, damageDealers.length));

    this.add.text(width / 2, height * 0.09, '选择伙伴', {
      fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.09 + 28, '第 2 / 2 步 · 三选一', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#449ddf',
    }).setOrigin(0.5);

    this.buildCards(width, height);
    this.buildStartButton(width, height);
  }

  private buildCards(width: number, height: number) {
    // 竖排：宽卡 + 左图右字，手机竖屏下更好点、也放得下更多信息
    const cardW = Math.min(width - 48, 460);
    // 顶部标题占 21%，底部按钮占 100px，卡片平分剩余高度（上限 150）
    const topLimit = height * 0.21;
    const bottomLimit = height - 100;
    const gap = 14;
    const availH = bottomLimit - topLimit;
    const cardH = Math.min(150, (availH - gap * (this.choices.length - 1)) / this.choices.length);
    const totalH = cardH * this.choices.length + gap * (this.choices.length - 1);
    // 在可用区里居中
    const startY = topLimit + (availH - totalH) / 2 + cardH / 2;
    const cx = width / 2;

    this.choices.forEach((p, i) => {
      const y = startY + i * (cardH + gap);
      const color = TYPE_COLORS[p.type] ?? 0x449ddf;
      const move = MOVES[p.move];

      const box = this.add.rectangle(cx, y, cardW, cardH, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });

      // 左侧：宝可梦头像
      const iconX = cx - cardW / 2 + cardH * 0.52;
      const pkKey = `pk_${p.id}`;
      if (this.textures.exists(pkKey)) {
        this.add.image(iconX, y, pkKey).setScale((cardH - 50) / 64);
      }

      // 右侧文本区：左对齐，5 行在卡片内垂直居中
      const textX = cx - cardW / 2 + cardH * 0.95;
      const lineGap = Math.min(19, (cardH - 34) / 4);
      const baseY = y - (lineGap * 4) / 2;

      this.add.text(textX, baseY, p.name, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      this.add.text(textX, baseY + lineGap, move?.name ?? p.move, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff',
      }).setOrigin(0, 0.5);
      this.add.text(textX, baseY + lineGap * 2, `${p.type} · ${move ? this.catZh(move.category) : ''}`, {
        fontFamily: 'sans-serif', fontSize: '10px',
        color: `#${color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0, 0.5);
      this.add.text(textX, baseY + lineGap * 3,
        move ? `伤害 ${move.baseDamage}　冷却 ${(move.cooldown / 1000).toFixed(1)}s` : '', {
          fontFamily: 'sans-serif', fontSize: '10px', color: '#a7c0d0',
        }).setOrigin(0, 0.5);
      const trait = move?.traits?.length
        ? move.traits.map((t) => this.traitZh(t)).join(' · ')
        : (move?.desc ?? '');
      this.add.text(textX, baseY + lineGap * 4, trait, {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#93aec0',
        wordWrap: { width: cardW - cardH * 0.95 - 20 }, align: 'left',
      }).setOrigin(0, 0.5);

      // 右上角的选中标记
      const mark = this.add.text(cx + cardW / 2 - 14, y - cardH / 2 + 14, '', {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#449ddf', fontStyle: 'bold',
      }).setOrigin(1, 0.5);

      box.on('pointerdown', () => {
        this.selected = p.move;
        Sfx.select();
        this.refresh();
      });
      this.cardRefs.push({ box, mark });
    });

    this.refresh();
  }

  private refresh() {
    if (!this.cardRefs.length || !this.startBtn) return;
    this.cardRefs.forEach((r, i) => {
      const p = this.choices[i];
      if (!p) return;
      const on = p.move === this.selected;
      const color = TYPE_COLORS[p.type] ?? 0x449ddf;
      r.box.setStrokeStyle(2, on ? color : 0x1e3344);
      r.box.setFillStyle(on ? 0x16293a : 0x11202c);
      r.mark.setText(on ? '已选择' : '')
        .setColor(`#${color.toString(16).padStart(6, '0')}`);
    });
    const ok = !!this.selected;
    this.startBtn.setFillStyle(ok ? 0x449ddf : 0x24404f);
    this.startBtn.setStrokeStyle(2, ok ? 0x449ddf : 0x2b4256);
    this.startTxt.setText(ok ? '开 始 游 戏' : '请选择伙伴')
      .setColor(ok ? '#041018' : '#7d96a8');
  }

  private buildStartButton(width: number, height: number) {
    const y = height - 70;
    this.startBtn = this.add.rectangle(width / 2, y, 220, 50, 0x24404f)
      .setStrokeStyle(2, 0x2b4256).setInteractive({ useHandCursor: true });
    this.startTxt = this.add.text(width / 2, y, '请选择伙伴', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#7d96a8', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.startBtn.on('pointerdown', () => {
      if (!this.selected) return;
      goTo(this, 'Game', { trait: this.trait, starterMove: this.selected });
    });

    // 返回上一步
    const back = this.add.text(24, 30, '← 返回', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#7fa8c0',
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => goTo(this, 'TraitSelect'));
  }

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
}
