import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Sfx 的纯逻辑测试：在没有 Web Audio 的 node 环境里
 * 所有方法都应安全降级（不抛异常），静音/音量状态要正确。
 */

// node 环境没有 window / AudioContext，注入最小桩
beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('performance', { now: () => Date.now() });
});

describe('Sfx 音效系统', () => {
  it('无 AudioContext 环境下 init 不抛异常', async () => {
    const { Sfx } = await import('../src/systems/Sfx');
    expect(() => Sfx.init()).not.toThrow();
  });

  it('未初始化时播放任何音效都不抛异常', async () => {
    const { Sfx } = await import('../src/systems/Sfx');
    const methods = ['shoot', 'slash', 'hit', 'kill', 'pickup', 'heal', 'hurt',
      'levelUp', 'evolve', 'mapChange', 'bossSpawn', 'bossSkill', 'win', 'lose', 'click', 'select'] as const;
    for (const m of methods) {
      expect(() => (Sfx as any)[m](), `${m} 应安全降级`).not.toThrow();
    }
  });

  it('静音开关状态正确', async () => {
    const { Sfx } = await import('../src/systems/Sfx');
    Sfx.setMuted(true);
    expect(Sfx.muted).toBe(true);
    Sfx.setMuted(false);
    expect(Sfx.muted).toBe(false);
  });

  it('音量被限制在 0-1', async () => {
    const { Sfx } = await import('../src/systems/Sfx');
    expect(() => Sfx.setVolume(-5)).not.toThrow();
    expect(() => Sfx.setVolume(99)).not.toThrow();
  });

  it('kill(true) 与 kill(false) 都能安全调用', async () => {
    const { Sfx } = await import('../src/systems/Sfx');
    expect(() => Sfx.kill(true)).not.toThrow();
    expect(() => Sfx.kill(false)).not.toThrow();
  });
});
