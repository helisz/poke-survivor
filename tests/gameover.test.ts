import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 回归测试：结算后返回主页，所有按钮点不了。
 *
 * 历史根因有两层：
 *  1. GameOverScene 返回时没停自己 → 全屏遮罩吞掉所有 pointer 事件
 *  2. 各处手写 scene.start/stop，顺序与清理都不一致，重开多次后
 *     Text 纹理命中已销毁帧，直接抛 drawImage 异常
 *
 * 现在统一走 SceneFlow.goTo：它先建目标场景，再停掉其它一切（包含调用者自己），
 * 所以这里只校验"调用的是统一入口"，具体顺序由 scene-flow.test.ts 覆盖。
 */

const src = readFileSync(
  resolve(__dirname, '../src/scenes/GameOverScene.ts'),
  'utf8',
);

function backBody(): string {
  const i = src.indexOf('const back = () => {');
  expect(i, 'GameOverScene 应存在 back()').toBeGreaterThan(-1);
  const j = src.indexOf('};', i);
  return src.slice(i, j);
}

describe('结算返回主页不拦截点击', () => {
  it('返回时走统一流转入口 goTo', () => {
    expect(backBody()).toContain("goTo(this, 'Menu')");
  });

  it('不再手写 scene.start / scene.stop 组合', () => {
    const body = backBody();
    expect(body).not.toMatch(/this\.scene\.start\(/);
    expect(body).not.toMatch(/this\.scene\.stop\(/);
  });

  it('场景装了 Text 纹理清理钩子', () => {
    expect(src).toContain('installTextTextureCleanup(this)');
  });
});
