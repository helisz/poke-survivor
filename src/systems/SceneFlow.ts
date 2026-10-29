import Phaser from 'phaser';

/**
 * 全流程场景切换总入口。
 *
 * 历史坑（三段式演进，别重复踩）：
 *
 * 1. `this.scene.stop()` 停的是自己，后面的语句不再执行
 *    → 一律用 scene.manager，先建目标再停别的
 * 2. 边遍历边 stop 会改动内部数组，把目标场景也停掉 → 整屏空白
 *    → 必须先把 key 收集到数组，再逐个停
 * 3. **最隐蔽的一个**：Phaser 的 Scene 实例是复用的。`scene.start()` 复用同一个
 *    对象，只重跑 create()。而 Text 在 `pixelArt: true` 下会丢弃自己的 source canvas，
 *    类字段（cardRefs / nextBtn 等）与旧监听器仍指向上一轮的 Text，
 *    重启后任何 setText/setColor 都会因 glTexture.canvas 为 null 而抛
 *    "Cannot read properties of null (reading 'drawImage')"，连锁让整个场景崩掉。
 *
 * 结论：需要"重来"的场景不能复用实例。SceneFlow 在切换前把目标场景**彻底移除并
 * 重新挂载一个新实例**，保证每次进入都是干净状态。
 */

type SceneKeyActivity = 'Menu' | 'TraitSelect' | 'PartnerSelect' | 'Game' | 'Shop';

/** 场景构造器注册表：新增场景时要登记，供重建时 new 一个干净实例 */
const FACTORIES: Record<string, () => Phaser.Scene> = {};

/** 注册场景构造器。main.ts 里对可重开的场景调用一次。 */
export function registerScene(key: string, factory: () => Phaser.Scene) {
  FACTORIES[key] = factory;
}

/** 场景 shutdown 时清理本场景所有 Text 的 canvas 纹理 */
export function disposeTextTextures(scene: Phaser.Scene) {
  const textures = scene.sys?.textures;
  if (!textures) return;
  const children = (scene.children?.list ?? []) as Phaser.GameObjects.GameObject[];
  for (const obj of children) {
    const t = obj as unknown as { type?: string; _textureKey?: string };
    if (t.type !== 'Text' || !t._textureKey) continue;
    try {
      if (textures.exists(t._textureKey)) textures.remove(t._textureKey);
    } catch {
      /* 已回收则忽略 */
    }
  }
}

/** 给场景挂 Text 纹理清理钩子 */
export function installTextTextureCleanup(scene: Phaser.Scene) {
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => disposeTextTextures(scene));
}

/**
 * 切到目标场景：目标是全新实例，先建目标再停掉其它一切。
 *
 * @param scene 发起切换的场景
 * @param target 目标场景 key
 * @param data 传给目标场景 create(data) 的数据
 */
export function goTo(
  scene: Phaser.Scene,
  target: SceneKeyActivity,
  data?: Record<string, unknown>,
) {
  const mgr = scene.scene.manager;

  // 1. 彻底移除目标场景的旧实例，避免复用带脏状态的 Scene 对象
  //    （Text 纹理已失效、类字段残留旧引用、监听器还挂在旧对象上）
  if (mgr.getScene(target)) {
    try {
      mgr.remove(target);
    } catch {
      /* 尚未创建则忽略 */
    }
  }

  // 2. 用工厂 new 一个干净实例重新挂载
  const factory = FACTORIES[target];
  if (factory) {
    try {
      mgr.add(target, factory(), true);
    } catch {
      /* 已存在则退化为普通 start */
      mgr.start(target, data);
    }
  } else {
    mgr.start(target, data);
  }

  // 3. 停掉除目标外的所有活跃场景。先收集 key 再停：mgr.stop() 会实时改动
  //    getScenes(true) 返回的数组，边遍历边停会漏停或把目标自己停掉。
  const others = mgr
    .getScenes(true)
    .map((s) => s.sys.settings.key)
    .filter((key) => key !== target);
  for (const key of others) {
    try {
      mgr.stop(key);
    } catch {
      /* 已停则忽略 */
    }
  }
}

/** 放弃本局：不结算，直接回主菜单 */
export function abandonRun(scene: Phaser.Scene) {
  const gs = (scene as unknown as { gs?: { paused?: boolean } }).gs;
  if (gs) gs.paused = false;
  goTo(scene, 'Menu');
}

/** 回主菜单（死亡结算 / 通关后使用） */
export function backToMenu(scene: Phaser.Scene) {
  goTo(scene, 'Menu');
}
