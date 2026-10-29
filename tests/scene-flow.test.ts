import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 场景流转回归测试。
 *
 * 历史上重开逻辑分散在 UIScene / GameOverScene / PartnerSelectScene 里各写一套，
 * 踩了三种坑（见 SceneFlow.ts 顶部注释）：
 *  - this.scene.stop() 停自己，后续 start 不执行
 *  - 边遍历边 stop，把目标场景也停掉 → 整屏空白
 *  - Text 的 canvas 纹理在 pixelArt 模式下不会随场景销毁，
 *    重建时命中已销毁帧 → drawImage 读 null → 全场景连锁崩溃
 *
 * 现在的约定：一切跳转走 SceneFlow，一切含 Text 的场景装纹理清理钩子。
 */

const root = resolve(__dirname, '..');
const flowPath = resolve(root, 'src/systems/SceneFlow.ts');

const scenes = [
  'MenuScene',
  'TraitSelectScene',
  'PartnerSelectScene',
  'ShopScene',
  'GameOverScene',
  'UIScene',
  'LevelUpScene',
];
const read = (name: string) => readFileSync(resolve(root, 'src/scenes', `${name}.ts`), 'utf8');

describe('场景渲染顺序', () => {
  it('SceneFlow 的 SCENE_ORDER 必须与 main.ts 的 scene 数组完全一致', () => {
    // 不做这个断言就会复发：mgr.add() 追加到末尾，Game 会盖住 UI，
    // 进游戏后整个 HUD 消失。
    const flow = readFileSync(flowPath, 'utf8');
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');

    // 抓 `const SCENE_ORDER = [ ... ];` 整段（非贪婪跨行）
    const orderMatch = flow.match(/const SCENE_ORDER\s*=\s*\[([\s\S]*?)\]\s*;/);
    expect(orderMatch, 'SceneFlow 缺少 SCENE_ORDER').toBeTruthy();
    const flowKeys = (orderMatch as RegExpMatchArray)[1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    const mainMatch = main.match(/scene:\s*\[([\s\S]*?)\]/);
    expect(mainMatch, 'main.ts 缺少 scene 数组').toBeTruthy();
    const mainKeys = (mainMatch as RegExpMatchArray)[1]
      .split(',')
      .map(s => s.trim().replace(/Scene$/, ''))
      .filter(Boolean);

    expect(flowKeys, 'SCENE_ORDER 与 main.ts scene 数组顺序不一致').toEqual(mainKeys);
  });

  it('goTo 重建场景后会调用 restoreSceneOrder 修正渲染顺序', () => {
    const src = readFileSync(flowPath, 'utf8');
    const goToBlock = src.slice(src.indexOf('export function goTo'));
    expect(goToBlock).toContain('restoreSceneOrder');
  });
});

describe('SceneFlow 统一入口', () => {
  it('模块存在', () => {
    expect(existsSync(flowPath)).toBe(true);
  });

  it('导出 goTo / abandonRun / installTextTextureCleanup', () => {
    const src = readFileSync(flowPath, 'utf8');
    expect(src).toContain('export function goTo');
    expect(src).toContain('export function abandonRun');
    expect(src).toContain('export function installTextTextureCleanup');
  });

  it('goTo 先收集 key 再停，避免边遍历边改数组', () => {
    const src = readFileSync(flowPath, 'utf8');
    const goToBlock = src.slice(src.indexOf('export function goTo'));
    expect(goToBlock).toMatch(/\.map\(\(s\)\s*=>\s*s\.sys\.settings\.key\)/);
    expect(goToBlock).toMatch(/\.filter\(\(key\)\s*=>\s*key\s*!==\s*target\)/);
  });

  it('纹理清理挂在场景 SHUTDOWN 上', () => {
    const src = readFileSync(flowPath, 'utf8');
    expect(src).toContain('SHUTDOWN');
    expect(src).toMatch(/textures\.remove\(/);
  });

  it('goTo 每次都用工厂重建目标场景实例（不复用脏 Scene）', () => {
    const src = readFileSync(flowPath, 'utf8');
    const goToBlock = src.slice(src.indexOf('export function goTo'));
    expect(goToBlock).toMatch(/mgr\.remove\(target\)/);
    expect(goToBlock).toMatch(/mgr\.add\(target, factory\(\)/);
  });

  it('main.ts 注册了所有可重开场景的工厂', () => {
    const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
    for (const key of ['Menu', 'TraitSelect', 'PartnerSelect', 'Shop', 'Game']) {
      expect(main, `缺少 registerScene('${key}')`).toContain(`registerScene('${key}'`);
    }
  });
});

describe('各场景使用统一流转', () => {
  for (const name of scenes) {
    it(`${name} 装了 Text 纹理清理钩子`, () => {
      expect(read(name)).toContain('installTextTextureCleanup(this)');
    });
  }

  it('不再有裸的 this.scene.start 跳转（一律走 goTo）', () => {
    for (const name of scenes) {
      const src = read(name);
      const starts = src.match(/this\.scene\.start\(['"][A-Z]/g) ?? [];
      expect(starts, `${name} 仍有 this.scene.start('Xxx')`).toHaveLength(0);
    }
  });

  it('UIScene 放弃本局走 abandonRun', () => {
    expect(read('UIScene')).toContain('abandonRun(this)');
  });

  it('GameOverScene 返回主页走 goTo', () => {
    const src = read('GameOverScene');
    expect(src).toContain("goTo(this, 'Menu')");
  });
});
