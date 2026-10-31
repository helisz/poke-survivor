import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * 回归：切曲要从头播。
 *
 * 曾经 apply() 里是 `if (audio.paused) play()`，只看暂停状态。
 * 退出战斗回主菜单时，菜单曲还躺在暂停状态、currentTime 停在原处，
 * 于是接着上次的位置放 —— 听感上就是「切场景音乐没重来」。
 *
 * 现在只要发生曲目切换（active 变了）就把 currentTime 归零；
 * 同一首内部重复 apply()（改静音等）不能归零，否则一按静音就跳回开头。
 */

type FakeAudio = {
  src: string; loop: boolean; volume: number; preload: string;
  paused: boolean; currentTime: number;
  play: () => Promise<void>; pause: () => void;
};

const created: FakeAudio[] = [];

function makeFakeAudio(src: string): FakeAudio {
  const el: FakeAudio = {
    src, loop: false, volume: 0, preload: '',
    paused: true, currentTime: 0,
    play: () => { el.paused = false; return Promise.resolve(); },
    pause: () => { el.paused = true; },
  };
  created.push(el);
  return el;
}

const timers: Array<() => void> = [];

describe('背景音乐切曲', () => {
  let Bgm: any;

  beforeEach(async () => {
    created.length = 0;
    timers.length = 0;

    vi.stubGlobal('Audio', function (src: string) { return makeFakeAudio(src); });
    vi.stubGlobal('window', {
      // fadeTo 用 setTimeout 分帧；测试里直接同步执行掉
      setTimeout: (fn: () => void) => { fn(); return 0; },
    });

    vi.resetModules();
    ({ Bgm } = await import('../src/systems/Bgm'));
  });

  it('从菜单切到战斗，战斗曲从 0 开始', () => {
    Bgm.init();                       // 菜单曲开始
    const menu = created.find((e) => e.src.includes('bgm-menu'))!;
    expect(menu.paused).toBe(false);
    expect(menu.currentTime).toBe(0);

    Bgm.setTrack('game');
    const game = created.find((e) => e.src.includes('bgm-game'))!;
    expect(game.paused).toBe(false);
    expect(game.currentTime).toBe(0);
  });

  it('退出战斗回菜单，菜单曲要重新从头放', () => {
    Bgm.init();
    const menu = created.find((e) => e.src.includes('bgm-menu'))!;

    // 菜单曲播了一会儿
    menu.currentTime = 42;
    // 进战斗 → 菜单曲暂停在当前进度
    Bgm.setTrack('game');
    expect(menu.paused).toBe(true);
    expect(menu.currentTime).toBe(42);

    // 退回菜单 → 必须归零重放
    Bgm.setTrack('menu');
    expect(menu.paused).toBe(false);
    expect(menu.currentTime).toBe(0);
  });

  it('同一首内部重复调用（例如改静音）不会把进度重置', () => {
    Bgm.init();
    const menu = created.find((e) => e.src.includes('bgm-menu'))!;
    menu.currentTime = 77;

    // 没换曲，只是重新 apply 一次
    Bgm.setTrack('menu');
    expect(menu.currentTime).toBe(77);
  });

  it('战斗曲只创建一次，来回切不会重复建对象', () => {
    Bgm.init();
    Bgm.setTrack('game');
    Bgm.setTrack('menu');
    Bgm.setTrack('game');
    const gameEls = created.filter((e) => e.src.includes('bgm-game'));
    expect(gameEls.length).toBe(1);
  });
});
