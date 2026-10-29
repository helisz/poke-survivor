import Phaser from 'phaser';
import { loadSave, writeSave, PERM_EMPTY } from '../data/stats';
import { MOVES } from '../data/moves';
import type { GameScene } from './GameScene';
import { Sfx } from '../systems/Sfx';
import { installTextTextureCleanup, goTo } from '../systems/SceneFlow';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(data: { game: GameScene; survived: boolean; time: number; level: number; kills: number }) {
    // 场景 shutdown 时清理本场景 Text 的 canvas 纹理，防止重建时命中已销毁帧
    installTextTextureCleanup(this);
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x041018, 0.94).setOrigin(0);

    const save = loadSave();
    save.perm ??= { ...PERM_EMPTY };

    const coins = Math.floor(data.time / 6) + data.kills;
    save.coins += coins;

    // 纪录对比
    const prevBest = save.bestTime;
    const isRecord = data.time > prevBest;
    if (isRecord) save.bestTime = data.time;

    // 解锁：按最高生存时间阶梯解锁
    const unlockTable: { at: number; id: string; name: string }[] = [
      { at: 60, id: 'trait_pick2', name: '双特性' },
      { at: 120, id: 'slot_7', name: '第 7 招式槽' },
      { at: 180, id: 'elite_hunter', name: '精英猎手' },
      { at: 240, id: 'boss_slayer', name: '屠龙者' },
    ];
    const newlyUnlocked: string[] = [];
    for (const u of unlockTable) {
      if (data.time >= u.at && !save.unlocked.includes(u.id)) {
        save.unlocked.push(u.id);
        newlyUnlocked.push(u.name);
      }
    }
    writeSave(save);

    const title = data.survived ? '生 存 成 功' : '你 倒 下 了';
    const color = data.survived ? '#63c256' : '#d0402c';
    this.add.text(width / 2, height * 0.13, title, {
      fontFamily: 'sans-serif', fontSize: '30px', color, fontStyle: 'bold',
    }).setOrigin(0.5);

    const m = Math.floor(data.time / 60), s = Math.floor(data.time % 60);
    const tstr = `${m}:${String(s).padStart(2, '0')}`;

    // 主要数据
    const rows = [
      ['生存时间', tstr],
      ['等级', `Lv.${data.level}`],
      ['击杀数', `${data.kills}`],
    ];
    const top = height * 0.22;
    rows.forEach(([k, v], i) => {
      const y = top + i * 26;
      this.add.text(width / 2 - 100, y, k, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#6f8ea6',
      }).setOrigin(0, 0.5);
      this.add.text(width / 2 + 100, y, v, {
        fontFamily: 'sans-serif', fontSize: '15px', color: '#cfe4f5', fontStyle: 'bold',
      }).setOrigin(1, 0.5);
    });

    // 纪录提示
    const recY = top + rows.length * 26 + 10;
    if (isRecord) {
      this.add.text(width / 2, recY, '★ 新 纪 录 ★', {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffd75e', fontStyle: 'bold',
      }).setOrigin(0.5);
    } else {
      this.add.text(width / 2, recY, `最高纪录 ${this.fmt(prevBest)}`, {
        fontFamily: 'sans-serif', fontSize: '11px', color: '#4c6272',
      }).setOrigin(0.5);
    }

    // 招式列表
    const moves = (data.game?.combat?.slots ?? [])
      .filter((sl) => sl.moveId)
      .map((sl) => ({
        name: MOVES[sl.moveId]?.name ?? sl.moveId,
        lv: sl.level ?? 1,
      }));

    const listY = recY + 30;
    this.add.text(width / 2, listY, '本局招式', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#6f8ea6',
    }).setOrigin(0.5);

    if (moves.length === 0) {
      this.add.text(width / 2, listY + 22, '（无）', {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#3d5468',
      }).setOrigin(0.5);
    } else {
      moves.slice(0, 6).forEach((mv, i) => {
        const y = listY + 22 + i * 20;
        this.add.text(width / 2 - 90, y, mv.name, {
          fontFamily: 'sans-serif', fontSize: '12px', color: '#8fb3cc',
        }).setOrigin(0, 0.5);
        this.add.text(width / 2 + 90, y, `Lv.${mv.lv}`, {
          fontFamily: 'sans-serif', fontSize: '11px', color: '#5f7a8c',
        }).setOrigin(1, 0.5);
      });
    }

    // 金币
    const coinY = listY + 22 + Math.max(moves.length, 1) * 20 + 18;
    this.add.text(width / 2, coinY, `获得金币 +${coins}    总额 ${save.coins}`, {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#ffd75e', fontStyle: 'bold',
    }).setOrigin(0.5);

    // 新解锁
    if (newlyUnlocked.length) {
      this.add.text(width / 2, coinY + 24, `解锁：${newlyUnlocked.join('、')}`, {
        fontFamily: 'sans-serif', fontSize: '12px', color: '#63b4ef', fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    // 底部按钮
    const btnY = height - 96;
    const btn = this.add.rectangle(width / 2, btnY, 200, 48, 0x449ddf)
      .setStrokeStyle(2, 0x63b4ef).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, btnY, '返 回 主 页', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5);
    const back = () => {
      Sfx.click();
      // 统一走 SceneFlow：先建 Menu，再停掉包括自己在内的一切；
      // 本场景同样会被停掉，无需再单独停自己。
      goTo(this, 'Menu');
    };
    btn.on('pointerdown', back);

    this.add.text(width / 2, height - 46, '按 R 返回', {
      fontFamily: 'sans-serif', fontSize: '11px', color: '#4c6272',
    }).setOrigin(0.5);
    this.input.keyboard!.once('keydown-R', back);
  }

  private fmt(sec: number) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
