/**
 * 程序化音效系统 —— 全部用 Web Audio 实时合成，不依赖任何音频文件。
 *
 * 好处：
 *  - 零体积、零加载时间、无版权问题
 *  - 像素风的方波/三角波音色天然契合
 *  - 音量、音高可参数化，方便做「连击音阶」之类的效果
 *
 * 用法：
 *   Sfx.init()            // 首次用户交互后调用（浏览器自动播放策略要求）
 *   Sfx.hit()             // 播放
 *   Sfx.setMuted(true)    // 静音
 */

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  /** 结束频率（做滑音用），省略则不变 */
  to?: number;
  dur?: number;      // 秒
  type?: Wave;
  vol?: number;      // 0-1
  delay?: number;    // 秒
  attack?: number;   // 秒
}

class SfxSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = false;
  private _volume = 0.35;
  /** 连续音效节流：避免同帧几十只怪死亡时爆音 */
  private lastPlay = new Map<string, number>();

  get muted() { return this._muted; }

  /** 必须在用户手势（点击/触摸）后调用一次 */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;   // 不支持就静默降级
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : this._volume;
    master.connect(ctx.destination);
    this.master = master;
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this._volume, this.ctx.currentTime, 0.01);
    }
  }

  setVolume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx && !this._muted) {
      this.master.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.01);
    }
  }

  /** 节流：同一 key 在 ms 内只响一次 */
  private throttled(key: string, ms: number): boolean {
    const now = performance.now();
    const last = this.lastPlay.get(key) ?? 0;
    if (now - last < ms) return false;
    this.lastPlay.set(key, now);
    return true;
  }

  /** 单个振荡器音 */
  private tone(o: ToneOpts) {
    if (!this.ctx || !this.master || this._muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const dur = o.dur ?? 0.1;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    }

    const vol = (o.vol ?? 0.3);
    const atk = o.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 白噪声爆点（爆炸/受击质感） */
  private noise(dur = 0.12, vol = 0.18, filterFreq = 1400) {
    if (!this.ctx || !this.master || this._muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = filterFreq;
    bp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master);
    src.start(t0);
  }

  // ============ 具体音效 ============

  /** 出招：短促上扬 */
  shoot() {
    if (!this.throttled('shoot', 55)) return;
    this.tone({ freq: 520, to: 780, dur: 0.055, type: 'square', vol: 0.11 });
  }

  /** 近战挥砍 */
  slash() {
    if (!this.throttled('slash', 70)) return;
    this.tone({ freq: 300, to: 140, dur: 0.09, type: 'sawtooth', vol: 0.14 });
    this.noise(0.07, 0.08, 2200);
  }

  /** 命中敌人 */
  hit() {
    if (!this.throttled('hit', 45)) return;
    this.tone({ freq: 210, to: 130, dur: 0.05, type: 'square', vol: 0.09 });
  }

  /** 击杀：闷响 */
  kill(big = false) {
    if (!this.throttled(big ? 'killBig' : 'kill', big ? 90 : 60)) return;
    this.tone({ freq: big ? 150 : 260, to: 60, dur: big ? 0.22 : 0.1, type: 'triangle', vol: big ? 0.22 : 0.13 });
    this.noise(big ? 0.2 : 0.09, big ? 0.2 : 0.1, big ? 700 : 1500);
  }

  /** 拾取经验球：清脆上升 */
  pickup() {
    if (!this.throttled('pickup', 42)) return;
    this.tone({ freq: 880, to: 1320, dur: 0.05, type: 'sine', vol: 0.075 });
  }

  /** 拾取回血球：柔和上行 */
  heal() {
    this.tone({ freq: 520, dur: 0.1, type: 'sine', vol: 0.16 });
    this.tone({ freq: 780, dur: 0.12, type: 'sine', vol: 0.14, delay: 0.08 });
    this.tone({ freq: 1040, dur: 0.14, type: 'sine', vol: 0.12, delay: 0.16 });
  }

  /** 玩家受伤 */
  hurt() {
    if (!this.throttled('hurt', 220)) return;
    this.tone({ freq: 260, to: 90, dur: 0.18, type: 'sawtooth', vol: 0.2 });
    this.noise(0.12, 0.12, 500);
  }

  /** 升级：三音上行琶音 */
  levelUp() {
    this.tone({ freq: 523, to: 523, dur: 0.1, type: 'square', vol: 0.16 });
    this.tone({ freq: 659, to: 659, dur: 0.1, type: 'square', vol: 0.16, delay: 0.09 });
    this.tone({ freq: 784, to: 784, dur: 0.16, type: 'square', vol: 0.16, delay: 0.18 });
  }

  /** 进化：华丽上行 + 光晕感 */
  evolve() {
    const seq = [523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.15, delay: i * 0.075 });
      this.tone({ freq: f * 2, dur: 0.1, type: 'sine', vol: 0.07, delay: i * 0.075 });
    });
  }

  /** 切图提示 */
  mapChange() {
    this.tone({ freq: 392, dur: 0.14, type: 'triangle', vol: 0.12 });
    this.tone({ freq: 587, dur: 0.2, type: 'triangle', vol: 0.1, delay: 0.13 });
  }

  /** BOSS 登场：低沉警报 */
  bossSpawn() {
    this.tone({ freq: 110, to: 55, dur: 0.7, type: 'sawtooth', vol: 0.26 });
    this.tone({ freq: 165, to: 82, dur: 0.7, type: 'square', vol: 0.12, delay: 0.06 });
    this.noise(0.5, 0.16, 320);
  }

  /** BOSS 技能蓄力 */
  bossSkill() {
    this.tone({ freq: 200, to: 640, dur: 0.3, type: 'sawtooth', vol: 0.14 });
  }

  /** 胜利 */
  win() {
    const seq = [523, 659, 784, 1047];
    seq.forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'square', vol: 0.17, delay: i * 0.13 }));
    this.tone({ freq: 1047, dur: 0.5, type: 'triangle', vol: 0.16, delay: 0.55 });
  }

  /** 失败：下行 */
  lose() {
    const seq = [440, 370, 294, 220];
    seq.forEach((f, i) => this.tone({ freq: f, dur: 0.26, type: 'triangle', vol: 0.17, delay: i * 0.15 }));
  }

  /** UI 点击 */
  click() {
    this.tone({ freq: 660, to: 880, dur: 0.05, type: 'square', vol: 0.12 });
  }

  /** UI 选择确认 */
  select() {
    this.tone({ freq: 784, dur: 0.07, type: 'square', vol: 0.14 });
    this.tone({ freq: 1175, dur: 0.09, type: 'square', vol: 0.11, delay: 0.06 });
  }
}

export const Sfx = new SfxSystem();
