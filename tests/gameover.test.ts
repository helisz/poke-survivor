import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 回归测试：结算后返回主页，所有按钮点不了。
 * 根因：GameOverScene 返回菜单时没有 stop 自己，
 * 它作为全屏遮罩一直盖在最上层，吞掉所有 pointer 事件。
 */

const src = readFileSync(
  resolve(__dirname, '../src/scenes/GameOverScene.ts'),
  'utf8',
);

/** 抽出 back() 函数体 */
function backBody(): string {
  const i = src.indexOf('const back = () => {');
  expect(i, 'GameOverScene 应存在 back()').toBeGreaterThan(-1);
  const j = src.indexOf('};', i);
  return src.slice(i, j);
}

describe('结算返回主页不拦截点击', () => {
  it('返回时必须停掉结算场景本身', () => {
    const body = backBody();
    // this.scene.stop() 不带参数 = 停自己
    expect(body).toMatch(/this\.scene\.stop\(\s*\)/);
  });

  it('返回时必须清理 Game 与 UI 场景', () => {
    const body = backBody();
    expect(body).toContain("this.scene.stop('Game')");
    expect(body).toContain("this.scene.stop('UI')");
  });

  it('返回时必须真正启动菜单场景', () => {
    expect(backBody()).toContain("this.scene.start('Menu')");
  });

  it('停自己必须发生在启动菜单之后（否则 start 可能被中断）', () => {
    const body = backBody();
    const startIdx = body.indexOf("this.scene.start('Menu')");
    const stopSelfIdx = body.search(/this\.scene\.stop\(\s*\)/);
    expect(startIdx).toBeGreaterThan(-1);
    expect(stopSelfIdx).toBeGreaterThan(startIdx);
  });
});
