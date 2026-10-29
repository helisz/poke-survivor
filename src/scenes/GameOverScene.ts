import Phaser from 'phaser';
import { loadSave, writeSave } from '../data/stats';
import type { GameScene } from './GameScene';

export class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  create(data: { game: GameScene; survived: boolean; time: number; level: number; kills: number }) {
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x000000, 0.82).setOrigin(0);

    const save = loadSave();
    const coins = Math.floor(data.time / 6) + data.kills;
    save.coins += coins;
    if (data.time > save.bestTime) save.bestTime = data.time;
    writeSave(save);

    const title = data.survived ? '生 存 成 功' : '你 倒 下 了';
    const color = data.survived ? '#63c256' : '#d0402c';

    this.add.text(width / 2, height * 0.24, title, {
      fontFamily: 'sans-serif', fontSize: '32px', color, fontStyle: 'bold',
    }).setOrigin(0.5);

    const m = Math.floor(data.time / 60), s = Math.floor(data.time % 60);
    const rows = [
      `生存时间   ${m}:${String(s).padStart(2, '0')}`,
      `等级       Lv.${data.level}`,
      `击杀数     ${data.kills}`,
      ``,
      `获得金币   +${coins}`,
      `金币总额   ${save.coins}`,
    ];
    rows.forEach((r, i) => {
      this.add.text(width / 2, height * 0.38 + i * 26, r, {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif', fontSize: '14px', color: i >= 4 ? '#f7d02c' : '#c8d8e4',
      }).setOrigin(0.5);
    });

    // 再来一局
    const btn = this.add.rectangle(width / 2, height * 0.78, 200, 48, 0x449ddf).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, height * 0.78, '再 来 一 局', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#041018', fontStyle: 'bold',
    }).setOrigin(0.5);
    btn.on('pointerdown', () => {
      this.scene.stop('UI');
      this.scene.stop('Game');
      this.scene.start('Menu');
    });

    this.add.text(width / 2, height * 0.9, '按 R 返回', { fontFamily: 'sans-serif', fontSize: '11px', color: '#4c6272' }).setOrigin(0.5);
    this.input.keyboard!.once('keydown-R', () => {
      this.scene.stop('UI');
      this.scene.stop('Game');
      this.scene.start('Menu');
    });
  }
}
