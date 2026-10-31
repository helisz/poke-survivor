/**
 * 背景音乐：两首，菜单曲和战斗曲，按场景切换。
 *
 *   菜单 / 选关 / 选特性 / 选伙伴 / 强化 / 图鉴 / 结算  → bgm-menu
 *   战斗（Game 场景）                                  → bgm-game
 *
 * 用 HTMLAudioElement 而不是 Web Audio 解码：
 *  - m4a 一两 MB，decodeAudioData 要整段解进内存再播，手机上首屏要卡一下
 *  - 要循环，audio 元素原生 loop 就够，不用自己排调度
 *
 * 浏览器自动播放策略：必须等用户第一次手势后再 play()，
 * 否则 play() 返回的 Promise 会被 reject（不报错但静默失败）。
 * 所以 init() 只在用户点击后调用，之后切场景就能正常起停。
 */

export type BgmTrack = 'menu' | 'game';

const SRC: Record<BgmTrack, string> = {
  menu: './assets/audio/bgm-menu.m4a',
  game: './assets/audio/bgm-game.m4a',
};

/** 目标音量：比音效低一档，别把方波音效盖住 */
const TARGET_VOL = 0.28;
const FADE_STEPS = 12;
const FADE_MS = 40;

class BgmSystem {
  private els: Partial<Record<BgmTrack, HTMLAudioElement>> = {};
  /** 用户是否已经触发过手势（解锁了自动播放） */
  private unlocked = false;
  /** 当前该播哪首；null 表示全静音 */
  private want: BgmTrack | null = 'menu';
  private _muted = false;

  get muted() { return this._muted; }

  /** 首次用户手势后调用一次 */
  init() {
    this.unlocked = true;
    this.apply();
  }

  /** 切到指定场景该放的音乐 */
  setTrack(track: BgmTrack | null) {
    this.want = track;
    this.apply();
  }

  setMuted(m: boolean) {
    this._muted = m;
    this.apply();
  }

  private ensure(track: BgmTrack): HTMLAudioElement {
    let el = this.els[track];
    if (!el) {
      el = new Audio(SRC[track]);
      el.loop = true;
      el.volume = 0;
      el.preload = 'auto';
      this.els[track] = el;
    }
    return el;
  }

  private apply() {
    if (!this.unlocked) return;
    const active = this._muted ? null : this.want;

    for (const track of ['menu', 'game'] as BgmTrack[]) {
      const el = this.els[track];
      if (track === active) {
        const audio = el ?? this.ensure(track);
        // 已经在下就别重复 play()，否则会从头开始
        if (audio.paused) {
          void audio.play().catch(() => { /* 没解锁/被拦，静默 */ });
        }
        this.fadeTo(audio, TARGET_VOL);
      } else if (el) {
        // 非当前曲：淡出后暂停，别让两首同时响
        this.fadeTo(el, 0, () => {
          if (this.want !== track || this._muted) el.pause();
        });
      }
    }
  }

  /** 手动做淡入淡出：audio.volume 没有原生过渡 */
  private fadeTo(el: HTMLAudioElement, target: number, done?: () => void) {
    const from = el.volume;
    if (Math.abs(from - target) < 0.01) {
      el.volume = target;
      done?.();
      return;
    }
    let i = 0;
    const tick = () => {
      i++;
      el.volume = from + (target - from) * (i / FADE_STEPS);
      if (i < FADE_STEPS) window.setTimeout(tick, FADE_MS);
      else { el.volume = target; done?.(); }
    };
    window.setTimeout(tick, FADE_MS);
  }
}

export const Bgm = new BgmSystem();
