import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 「返回主菜单」类操作的回归测试。
 *
 * 历史上踩过两次同源的坑：
 *  - GameOverScene: 只停 UI/Game 不停自己 → 结算遮罩留在最上层吞掉所有点击
 *  - UIScene.quitToMenu: 先 this.scene.stop() 停自己 → 方法后续的 start('Menu')
 *    永远不会执行，结果卡在主菜单不出来/点了没反应
 *
 * 规则：必须用 scene manager，且 start('Menu') 必须出现在任何 stop 之前。
 */

const ui = readFileSync(resolve(__dirname, '../src/scenes/UIScene.ts'), 'utf8');
const over = readFileSync(resolve(__dirname, '../src/scenes/GameOverScene.ts'), 'utf8');

function block(src: string, marker: string, len = 1200): string {
  const i = src.indexOf(marker);
  return i < 0 ? '' : src.slice(i, i + len);
}

describe('返回主菜单：清场顺序', () => {
  const quit = block(ui, 'private quitToMenu()');

  it('quitToMenu 存在', () => {
    expect(quit.length).toBeGreaterThan(0);
  });

  it('quitToMenu 必须使用 scene manager（不能靠 this.scene.stop 停自己）', () => {
    expect(quit).toContain('this.scene.manager');
    // 不允许出现裸的 this.scene.stop() —— 那是停自己
    expect(quit).not.toMatch(/this\.scene\.stop\(\s*\)/);
  });

  it("quitToMenu 里 start('Menu') 必须在所有 stop 之前", () => {
    const startIdx = quit.indexOf("start('Menu')");
    const firstStop = quit.search(/\.stop\(/);
    expect(startIdx).toBeGreaterThan(-1);
    expect(firstStop).toBeGreaterThan(-1);
    expect(startIdx).toBeLessThan(firstStop);
  });

  it('quitToMenu 必须停掉除 Menu 之外的所有活跃场景', () => {
    // 点名停几个固定场景不够：TraitSelect / PartnerSelect / GameOver 残留会抢输入
    expect(quit).toMatch(/getScenes\(true\)/);
    expect(quit).toMatch(/!==\s*'Menu'/);
  });

  it('GameOverScene 返回前必须先 start Menu，最后停自己', () => {
    const i = over.indexOf("this.scene.start('Menu')");
    expect(i).toBeGreaterThan(-1);
    const tail = over.slice(i, i + 200);
    expect(tail, 'start Menu 之后必须停掉自己，否则遮罩会拦住点击').toMatch(/this\.scene\.stop\(\s*\)/);
  });
});
