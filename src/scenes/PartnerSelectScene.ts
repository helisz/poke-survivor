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
    const cardW = Math.min((width - 44) / 3, 108);
    const cardH = 168;
    const gap = 6;
    const startX = (width - (cardW * 3 + gap * 2)) / 2 + cardW / 2;
    const y = height * 0.30 + cardH / 2;

    this.choices.forEach((p, i) => {
      const x = startX + i * (cardW + gap);
      const color = TYPE_COLORS[p.type] ?? 0x449ddf;
      const move = MOVES[p.move];

      const box = this.add.rectangle(x, y, cardW, cardH, 0x11202c)
        .setStrokeStyle(2, 0x1e3344).setInteractive({ useHandCursor: true });

      const pkKey = `pk_${p.id}`;
      if (this.textures.exists(pkKey)) {
        this.add.image(x, y - 52, pkKey).setScale((cardW - 62) / 64);
      }
      this.add.text(x, y - 6, p.name, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(x, y + 14, move?.name ?? p.move, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#ffffff',
      }).setOrigin(0.5);
      this.add.text(x, y + 30, `${p.type} · ${move ? this.catZh(move.category) : ''}`, {
        fontFamily: 'sans-serif', fontSize: '9px',
        color: `#${color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0.5);
      this.add.text(x, y + 48, move ? `伤害 ${move.baseDamage}　冷却 ${(move.cooldown / 1000).toFixed(1)}s` : '', {
        fontFamily: 'sans-serif', fontSize: '9px', color: '#8fa8b8',
        wordWrap: { width: cardW - 12 }, align: 'center',
      }).setOrigin(0.5);
      const trait = move?.traits?.length
        ? move.traits.map((t) => this.traitZh(t)).join(' · ')
        : (move?.desc ?? '');
      this.add.text(x, y + 66, trait, {
        fontFamily: 'sans-serif', fontSize: '9px', color: '#6f8ca0',
        wordWrap: { width: cardW - 12 }, align: 'center',
      }).setOrigin(0.5);

      const mark = this.add.text(x, y - cardH / 2 + 12, '', {
        fontFamily: 'sans-serif', fontSize: '10px', color: '#449ddf', fontStyle: 'bold',
      }).setOrigin(0.5);

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
