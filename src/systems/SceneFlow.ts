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

type SceneKeyActivity = 'Menu' | 'MapSelect' | 'TraitSelect' | 'PartnerSelect' | 'Game' | 'Shop' | 'Dex';

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
  'Shop', 'Dex', 'Game', 'UI', 'LevelUp', 'GameOver',
];

/** 注册场景构造器。main.ts 里对可重开的场景调用一次。 */
export function registerScene(key: string, factory: () => Phaser.Scene) {
  FACTORIES[key] = factory;
}

/**
 * 场景 shutdown 时清理本场景所有 Text 的 canvas 纹理。
 *
 * 【重要】Phaser 的 `Text.preDestroy` 已经调用 `texture.destroy()` +
 * `CanvasPool.remove(canvas)`，自己会完整回收。这里手动再删一遍反而出事：
 *  1. `textures.remove(key)` 先把纹理从管理器摘掉，
 *     随后 GameObject 销毁时 `texture.destroy()` 拿到的是已被拆空的纹理，
 *     内部 `drawImage` 的目标 canvas 为 null，抛
 *     `Cannot read properties of null (reading 'drawImage')`；
 *  2. `CanvasPool.remove` 会把 canvas 重置成 1×1 并放回池子复用，
 *     被下一个 Text 拿走时尺寸对不上。
 * 症状就是「重开一局、选完伙伴后卡死」——场景重建时 create() 里 setText
 * 撞到已损坏的纹理。
 *
 * 所以这里保留函数仅为兼容既有调用点，实际不做任何事。
 */
export function disposeTextTextures(_scene: Phaser.Scene) {
  /* 交给 Phaser 自己回收，见上方注释 */
}

/** 给场景挂 Text 纹理清理钩子（现为空实现，保留以兼容既有调用） */
export function installTextTextureCleanup(_scene: Phaser.Scene) {
  /* no-op */
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
  // 而"再加一个同 key 的场景"，卡成 status RUNNING 但查不到的局面。
  //
  // 解法：挪到下一帧再执行。注意不能用 scene.time.delayedCall ——
  // 那是场景时钟，场景停了就不走；用 rAF 最稳。
  if (mgr.isProcessing) {
    requestAnimationFrame(() => {
      try {
        performGoTo(mgr, target, data);
      } catch (e) {
        console.error('[SceneFlow] goTo failed:', e);
      }
    });
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
  // 顺序很关键：先把除目标外的场景全部停掉，再处理目标场景。
  // 反过来（先 add 再 stop）会留下"新实例已挂上、旧实例还在跑"的窗口，
  // 旧场景的输入层继续吃点击，表现为选完伙伴后点什么都没反应。
  // 先收集 key 再停：mgr.stop() 会实时改动 getScenes(true) 的数组。
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
  //    create(data) 的数据。漏传会让开局参数（trait / starterMove / stage）丢失。
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

  // 3. 把重建的场景挪回原始渲染位置。mgr.add 是追加到末尾的，不修正的话
  //    Game 会盖在 UI 上面，进游戏后整个 HUD 消失。
  restoreSceneOrder(mgr, target);

  // 4. 兜底：再扫一遍活跃场景，确认只剩目标（上面的 stop 可能因
  //    场景自己在这一帧又启动而漏停）。
  const stragglers = mgr
    .getScenes(true)
    .map((s) => s.sys.settings.key)
    .filter((key) => key !== target);
  for (const key of stragglers) {
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
