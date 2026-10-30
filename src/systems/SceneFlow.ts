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

type SceneKeyActivity = 'Menu' | 'MapSelect' | 'TraitSelect' | 'PartnerSelect' | 'Game' | 'Shop';

/** 场景构造器注册表：新增场景时要登记，供重建时 new 一个干净实例 */
const FACTORIES: Record<string, () => Phaser.Scene> = {};

/**
 * 场景的原始渲染顺序（必须与 main.ts 的 scene 数组一致）。
 *
 * 血泪教训：`mgr.add()` 会把场景追加到数组末尾，而渲染顺序就等于数组顺序，
 * 结果 Game 被排到 UI 后面、直接盖住整个 HUD，进游戏后"什么 UI 都没有"。
 * 重建后必须按这个表把场景挪回原来的位置。
 */
const SCENE_ORDER = [
  'Boot', 'Menu', 'MapSelect', 'TraitSelect', 'PartnerSelect',
  'Shop', 'Game', 'UI', 'LevelUp', 'GameOver',
];

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
 * 把被重建的场景挪回 SCENE_ORDER 里声明的相对位置。
 *
 * Phaser 的 SceneManager 用 `scenes` 数组决定渲染顺序（后面的画在上面）。
 * mgr.add() 是 push 到末尾，所以重建 Game/UI 之后顺序会乱。
 * 这里按期望顺序重排整个数组——只动已有的场景，不增不减。
 */
function restoreSceneOrder(mgr: Phaser.Scenes.SceneManager, target: string) {
  const desired = SCENE_ORDER.indexOf(target);
  if (desired < 0) return;

  const current = mgr.scenes;
  const scene = mgr.getScene(target);
  if (!scene) return;

  // 只保留仍注册着的场景，按 SCENE_ORDER 排序；不在表里的保持相对顺序放最后
  const known = current
    .slice()
    .sort((a, b) => {
      const ia = SCENE_ORDER.indexOf(a.sys.settings.key);
      const ib = SCENE_ORDER.indexOf(b.sys.settings.key);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });

  current.length = 0;
  for (const s of known) current.push(s);
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

  // 【最关键的坑】Phaser 的 SceneManager 有个 isProcessing 标志。
  // 在 pointerdown 这类输入回调里调 mgr.remove() / mgr.add()，不会立即执行，
  // 而是压进 _queue 延后处理。此时紧跟着的 add() 会因为旧场景还没被移除
  // 而"再加一个同 key 的场景"，同时 restoreSceneOrder 手动改的数组顺序
  // 和被延迟的 remove 互相打架 —— 结果就是 Game/UI 的 sys 状态错乱：
  // status 显示 RUNNING，但 getScenes(true) 里查不到，画面卡死不动。
  //
  // 解法：把整个切换扔到下一帧（scene.time.delayedCall(0) 走的是场景时钟，
  // 场景停了就不跑；用 game.loop 的 once('poststep') 更稳）。
  // 调用方（按钮回调）返回后再执行，isProcessing 已归 false，操作全部同步生效。
  if (mgr.isProcessing) {
    // requestAnimationFrame 不依赖场景时钟，即使场景已暂停也会触发
    requestAnimationFrame(() => performGoTo(mgr, target, data));
    return;
  }

  performGoTo(mgr, target, data);
}

/** 真正的切换逻辑。只做场景管理，不碰任何游戏对象。 */
function performGoTo(
  mgr: Phaser.Scenes.SceneManager,
  target: SceneKeyActivity,
  data?: Record<string, unknown>,
) {

  // 1. 彻底移除目标场景的旧实例，避免复用带脏状态的 Scene 对象
  //    （Text 纹理已失效、类字段残留旧引用、监听器还挂在旧对象上）
  if (mgr.getScene(target)) {
    try {
      mgr.remove(target);
    } catch {
      /* 尚未创建则忽略 */
    }
  }

  // 2. 用工厂 new 一个干净实例重新挂载。
  //    签名是 add(key, sceneConfig, autoStart, data) —— 第 4 个参数才是传给
  //    create(data) 的数据。漏传会让开局参数（trait / starterMove）丢失，
  //    表现为"选了伙伴但开局技能是随机的"。
  const factory = FACTORIES[target];
  if (factory) {
    try {
      mgr.add(target, factory(), true, data);
    } catch {
      /* 已存在则退化为普通 start */
      mgr.start(target, data);
    }
  } else {
    mgr.start(target, data);
  }

  // 2.5 把重建的场景挪回原始渲染位置。mgr.add 是追加到末尾的，不修正的话
  //     Game 会盖在 UI 上面，进游戏后整个 HUD 消失。
  restoreSceneOrder(mgr, target);

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

/**
 * 放弃本局：不结算，直接回主菜单。
 *
 * 必须先恢复游戏场景的 paused / 恢复物理与时间，否则即便场景被切走，
 * 残留的暂停状态也会让下一次开局卡住。
 */
export function abandonRun(scene: Phaser.Scene) {
  const gs = (scene as unknown as {
    gs?: {
      paused?: boolean;
      physics?: { world?: { resume?: () => void } };
    };
  }).gs;
  if (gs) {
    gs.paused = false;
    try {
      gs.physics?.world?.resume?.();
    } catch {
      /* 已恢复则忽略 */
    }
  }
  // 无论 gs 是否存在，都确保 Game 场景本身不再处于暂停态
  try {
    const gameScene = scene.scene.manager.getScene('Game');
    if (gameScene && gameScene.sys.isPaused()) scene.scene.manager.resume('Game');
  } catch {
    /* 已恢复则忽略 */
  }
  goTo(scene, 'Menu');
}

/** 回主菜单（死亡结算 / 通关后使用） */
export function backToMenu(scene: Phaser.Scene) {
  goTo(scene, 'Menu');
}
