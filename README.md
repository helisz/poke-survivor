<div align="right">

**简体中文** · [English](README.en.md)

</div>

# Poke Survivor

宝可梦题材的 Roguelite 弹幕生存游戏（吸血鬼幸存者玩法），Phaser 3 + TypeScript + Vite 构建，纯前端，浏览器即开即玩。

**🎮 在线游玩 → https://helisz.github.io/poke-survivor/**

---

## 目录

- [一、游戏介绍](#一游戏介绍)
- [二、玩法说明](#二玩法说明)
  - [2.1 一局怎么打](#21-一局怎么打)
  - [2.2 训练家特性](#22-训练家特性)
  - [2.3 升级三选一](#23-升级三选一)
  - [2.4 敌人三档威胁](#24-敌人三档威胁)
  - [2.5 六张地图](#25-六张地图)
  - [2.6 局外成长](#26-局外成长)
  - [2.7 操作方式](#27-操作方式)
- [三、面向开发者：二次开发指引](#三面向开发者二次开发指引)
  - [3.1 Fork 与 Clone](#31-fork-与-clone)
  - [3.2 开发环境要求](#32-开发环境要求)
  - [3.3 本地启动](#33-本地启动)
  - [3.4 技术栈](#34-技术栈)
  - [3.5 测试](#35-测试)
  - [3.6 构建与部署](#36-构建与部署)
  - [3.7 可选：接入云端账号与排行榜](#37-可选接入云端账号与排行榜)
  - [3.8 二次开发常见任务](#38-二次开发常见任务)
- [四、技术架构](#四技术架构)
  - [4.1 目录结构](#41-目录结构)
  - [4.2 场景流转](#42-场景流转)
  - [4.3 一局的运行时循环](#43-一局的运行时循环)
  - [4.4 核心系统职责](#44-核心系统职责)
  - [4.5 数据层](#45-数据层)
  - [4.6 数值体系](#46-数值体系)
  - [4.7 UI 层](#47-ui-层)
  - [4.8 渲染与性能约束](#48-渲染与性能约束)
  - [4.9 已知陷阱](#49-已知陷阱)
- [五、贡献](#五贡献)
- [六、版权与声明](#六版权与声明)

---

## 一、游戏介绍

玩过《吸血鬼幸存者》就懂了：你什么都不用按，只要走位躲技能，角色会自己打人。区别在于这里的「角色」是一整队宝可梦 —— 你抽到哪个招式，对应的宝可梦就会现身跟着你、自动出招。

- **一局 5 分钟**（`RUN_SECONDS = 5 * 60`，正式版计划改回 15 分钟）
- **6 张地图**，刷怪倍率与经验产出各不相同
- **24 只可玩宝可梦**，每只绑定一条专属招式，可进化
- **24 种招式**，5 大类（近战 / 弹道 / 光环 / AOE / 召唤）
- **6 个招式槽**，升级三选一，可重掷
- **三级 BOSS 体系**：精英（每 30 秒一波）→ 小 BOSS（定时刷新）→ 终局 BOSS（三技能轮转）
- **局外成长**：金币存 localStorage，商店里买 9 项永久强化，跨局累计

代码规模约 **12,700 行 TypeScript**，28 个测试文件、232 项断言。

---

## 二、玩法说明

### 2.1 一局怎么打

1. **选地图** — 六张地图，越往后怪越多、经验越高
2. **选训练家特性** — 9 选 1，决定这局的基础属性偏向
3. **选伙伴** — 24 只可玩宝可梦选 1，决定起手招式
4. **进场开打** — 走位躲怪，自动出招杀怪
5. **捡经验球** — 击杀掉落，吸附到身上后升级
6. **升级三选一** — 新招式 / 招式强化 / 属性加成，可以消耗重掷次数换一批
7. **扛到时间结束** — 倒计时归零会刷出终局 BOSS，**杀掉才算通关**
8. **结算** — 拿到金币，回主菜单去商店花掉

时间轴：

| 时间 | 事件 |
|---|---|
| 0:00 | 开局，普通怪开始刷 |
| 每 30 秒 | 精英怪一波（后期一波 2~3 只） |
| 2:00 左右 | 小 BOSS 刷新（体型 1.47×，3000 血） |
| 4:40 左右 | 第二只小 BOSS |
| 5:00 | 倒计时结束，终局 BOSS 进场（三技能轮转） |
| 击杀终局 BOSS | 通关结算 |

### 2.2 训练家特性

9 选 1，都是小幅加成，决定这局的成长方向：

| 特性 | 效果 |
|---|---|
| 急足 | 移速 +6% |
| 铁壁 | 最大 HP +12，受伤 -5% |
| 亲和 | 拾取范围 +15%，经验 +5% |
| 蛮力 | 伤害 +5% |
| 迅捷 | 招式冷却 -4% |
| 活力 | 最大 HP +18，回血球效果 +15% |
| 好学 | 经验 +8% |
| 磁力 | 拾取范围 +25% |
| 守护 | 受伤 -8% |

定义在 `src/data/stats.ts` 的 `TRAITS`。

### 2.3 升级三选一

每次升级弹出三张卡，四种卡型：

| 卡型 | 说明 |
|---|---|
| **新招式** | 占用一个空槽，加入一条新的宝可梦伙伴 |
| **强化** | 已有招式升一级，伤害/范围/冷却按招式表成长 |
| **进化** | 招式达到 `MOVE_LEVEL_EVOLVE_AT = 8` 级时出现，宝可梦变身，伤害倍率跳升 |
| **属性** | 直接加角色属性（HP / 攻速 / 移速 / 暴击 / 拾取） |

槽位上限 `MAX_SLOTS = 6`。重掷次数基础 3 次，商店「赌神」每级 +1。

**进化规则**（重要）：

- **进化不认存活时长**。触发条件只有两个：玩家总等级达到阈值，或该招式自身练到 `MOVE_LEVEL_EVOLVE_AT = 8` 级。坐着不动熬时间不会白送进化
- 进化**不会重置招式等级**。进化那一刻的等级被记为 `evoBaseLevel`，之后再升级都在这个基数上继续累加
- 伤害 = `baseDamage × (1 + (当前等级-1) × 0.42) × 进化倍率`，一路只增不减
- 进化后的弹道**全部穿透**（`pierce = Infinity`），不再被单个目标吃掉
- 进化后的弹道**自带追踪**（转向速率比原生 homing 慢一半），不会出现「弹体只顾朝一个方向飞」的情况
- 火球类进化后，分裂出来的子弹同样继承穿透与进化特效

### 2.4 敌人三档威胁

| 类型 | 体型 | 血量 | 出场 | 行为 |
|---|---|---|---|---|
| 普通怪 | 0.62~0.70× | 26 | 全程 | 只会撞人 |
| **精英** | 1.35× | 260 | 每 30 秒一波 | **会放技能**：间隔 5.5s、威力 0.45 |
| **小 BOSS** | 1.47× | 3000 | 2:00 / 4:40 各 1 只 | **会放技能**：间隔 4.2s、威力 0.55 |
| **终局 BOSS** | 1.47× | — | 倒计时结束 | **三技能轮转**：2.4s 一招、威力 1.0 |

**精英与 BOSS 的技能按自身宝可梦属性走，每个属性 4 招轮转**（草→震地/火柱/落雷/弹弹球，火→陨石/冲锋/火柱/激光…）。属性表见 `src/data/pokedex.ts` 的 `POKEDEX_TYPE`，未收录的按属性名兜底。

技能库共 10 种，躲法各不相同：

| 技能 | 表现 | 躲法 |
|---|---|---|
| **定点落雷** | 地面先亮预警圈，0.42s 后雷柱砸下 | 看到圈就走开 |
| **毒潭** | 地面留下 3~4 滩持续 5 秒的毒圈，每 0.5s 掉血 | 绕开地面 |
| **火球抛物线** | 火球飞向预判点，落地点留下火圈二次伤害 | 别停在原地 |
| **弹弹球** | 3~4 颗球在屏幕边界反弹，最多弹 5 次 | 侧向拉开 |
| **N 向激光** | 先画 0.42s 预警线，再开 4/6/8 向光柱 | 站进两条光柱的夹缝 |
| **火柱** | 沿玩家垂直方向依次喷出火墙 | 顺着火墙推来的方向跑 |
| **水柱** | 4~5 道横向水流，命中附带击退 | 斜向错开 |
| **震地** | 脚下尘环，0.34s 后放射碎石 | 提前拉开 |
| **冰棱** | 扇形冰刺，命中减速 30% | 横向切出扇形 |
| **冲锋/念波** | BOSS 突进 + 落地甩一圈弹 | 预判落点绕开 |

**弹体尺寸统一收紧**：普通弹 `scale` 从 2.0~3.0 降到 0.8~1.0。大型技能不再靠放大弹体表达威力，改用激光线、火柱、地面区域等形态——视觉存在感强，但判定明确，不会糊住半个屏幕。

精英为了防止变成弹幕地狱，做了三道限制：

- 只有距离玩家 **620px** 以内的才出招，屏幕外的继续走近
- 同屏最多 **2 只**精英同时施法
- 每只精英**独立计时**，首次出现带 1.5~5.5s 随机延迟，不会同波一起开火

终局 BOSS 三种技能，需要三种不同的躲法：

1. **本命属性主招** — 该 BOSS 属性的专属技能
2. **追踪狙击** — 3~4 连发追踪弹，每发重新锁定玩家实时位置，站着不动必吃、跑动可躲
3. **环形爆发** — 双圈交错弹幕（13+11，暴怒时 16+13），第二圈错开半格留缝

血量低于 **40%** 进入暴怒，提升弹数与弹速。

### 2.5 六张地图

| 关卡 | 地图 | 刷怪倍率 | 经验倍率 |
|---|---|---|---|
| 1 | 草原 | 1.00× | 1.00× |
| 2 | 森林 | 1.15× | 1.05× |
| 3 | 洞窟 | 0.85× | 1.20× |
| 4 | 沼泽 | 1.35× | 1.10× |
| 5 | 火山 | 1.10× | 1.30× |
| 6 | 遗迹 | 1.20× | 1.45× |

每张地图有独立的配色、地面装饰、敌人池、精英池。定义在 `src/data/maps.ts` 的 `MAP_THEMES`。

### 2.6 局外成长

金币存 localStorage，跨局累计。商店有 9 项永久强化，每项 10 级（「赌神」3 级），价格从 50 涨到 30000，曲线前缓后陡：

| 强化 | 效果 |
|---|---|
| 体魄 | 最大 HP |
| 威力 | 伤害 |
| 脚力 | 移速 |
| 锐眼 | 暴击率 |
| 怒击 | 暴击伤害 |
| 磁引 | 拾取范围 |
| 悟性 | 经验获取 |
| 节律 | 冷却缩减 |
| 赌神 | 每局升级 +1 次重掷（5 万 / 15 万 / 50 万） |

### 2.7 操作方式

| 平台 | 移动 | 选择 |
|---|---|---|
| 桌面 | `WASD` / 方向键 | 升级按 `1` `2` `3`，重掷按 `R` |
| 手机 | 按住屏幕任意位置拖动摇杆 | 点击卡片 |

跟在身后的宝可梦会自动出招，玩家**不需要也不应该**手动攻击。

---

## 三、面向开发者：二次开发指引

### 3.1 Fork 与 Clone

**只想在自己机器上跑和改：**

```bash
git clone git@github.com:helisz/poke-survivor.git
cd poke-survivor
npm install
```

**想自己发布一份（比如改完后上线到自己的 GitHub Pages）：**

1. 打开 https://github.com/helisz/poke-survivor ，点右上角 **Fork**
2. Clone 你自己那份：

```bash
git clone git@github.com:<你的用户名>/poke-survivor.git
cd poke-survivor
npm install
```

3. 如果走 GitHub Actions 自动部署，需要到仓库 **Settings → Pages** 把 Source 设为 **GitHub Actions**；如果走 `gh-pages` 分支（推荐，见 3.6），把 Source 设为 **Deploy from a branch → gh-pages / (root)**

### 3.2 开发环境要求

| 项目 | 要求 |
|---|---|
| Node.js | **20 LTS 或更高**（CI 用 20） |
| npm | 随 Node 附带即可 |
| 操作系统 | macOS / Linux / Windows 均可 |
| 浏览器 | Chrome 90+ / Safari 15+ / Edge 90+（需支持 WebGL 与 Canvas2D） |
| 磁盘 | 约 500MB（`node_modules` 占大头） |

项目**没有任何原生依赖**，`npm install` 不需要编译工具链。

### 3.3 本地启动

```bash
npm install        # 首次安装依赖
npm run dev        # 开发服务器，默认 http://localhost:5173
```

Vite 支持热更新（HMR），改 `.ts` 保存即生效。

其他命令：

```bash
npm run build      # 类型检查 + 构建到 dist/
npm run preview    # 本地预览构建产物
npm run test       # 只跑测试
npm run test:watch # 测试 watch 模式
npm run verify     # 类型检查 + 跑测试（提交前建议跑这个）
```

### 3.4 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 游戏引擎 | **Phaser 3.90** | WebGL 渲染 + Arcade 物理 |
| 语言 | **TypeScript 5.6** | `strict: true`，全局开启严格模式 |
| 构建 | **Vite 5** | 开发服务器 + 打包 |
| 测试 | **Vitest 2** | 单元测试，无需浏览器 |
| 后端（可选） | **Supabase** | 云端账号、排行榜、跨设备存档 |
| 密码哈希（可选） | **bcryptjs** | 只在接入云端账号时用到 |

**没有任何 UI 框架**（无 React/Vue）—— 全部界面由 Phaser 的 Graphics / Text / Container 手绘。这是刻意的选择，代价是布局全部手写，见 [4.9 已知陷阱](#49-已知陷阱)。

### 3.5 测试

```bash
npm run verify   # tsc --noEmit + vitest run，232 项断言
```

28 个测试文件，覆盖：

| 文件 | 覆盖内容 |
|---|---|
| `damage-tiers.test.ts` | 招式伤害层级，单体/多体/AOE 的 DPS 区间 |
| `moves.test.ts` | 招式表完整性、必填字段、样式合法性 |
| `stage.test.ts` | 关卡倍率的线性/指数断言 |
| `enemy-hp.test.ts` / `enemy-motion.test.ts` | 敌人血量成长曲线、移动行为 |
| `balance.test.ts` / `pacing.test.ts` | 整体平衡与节奏 |
| `evolution-coverage.test.ts` / `skill-growth.test.ts` | 进化覆盖度、技能成长曲线 |
| `scene-flow.test.ts` / `scene-refresh.test.ts` | 场景切换、刷新恢复 |
| `session-*.test.ts` / `logout-clears-save.test.ts` | 会话、存档、退出的数据一致性 |
| `perm.test.ts` / `score.test.ts` / `sfx.test.ts` | 局外强化定价、计分、音效映射 |

**测试不需要浏览器**：所有断言跑在 Node 环境，只测纯逻辑（数值、数据表、状态机），不测渲染。

写新测试时，直接 import `src/` 下的模块即可：

```ts
import { MOVES } from '../src/data/moves';
import { STAGE_HP_ADD, stageScale } from '../src/data/maps';
```

### 3.6 构建与部署

#### 构建

```bash
npm run build
```

产物在 `dist/`。构建前会先跑 `tsc --noEmit`，**类型报错会直接中断构建**。

`vite.config.ts` 会把 git 提交数、构建时间、版本 tag 注入为编译期常量，显示在主菜单底部（形如 `v0.4.106 · 2026-10-30 23:45:49`），用来确认手机跑的是不是最新版。

#### 部署到 GitHub Pages

> ⚠️ **重要**：仓库的 `github-pages` environment 保护规则**只允许 `gh-pages` 分支部署**。
> 直接 push `main` 触发的 Actions 会失败（`Branch "main" is not allowed to deploy to github-pages`）。
> 必须把 `dist/` 推到 `gh-pages` 分支。

**手动部署流程**（本项目实际使用的方式）：

```bash
# 1. 构建
npm run build

# 2. 准备一个 gh-pages 工作目录（首次）
git clone --branch gh-pages --single-branch \
  git@github.com:<你的用户名>/poke-survivor.git /tmp/ps-deploy

# 3. 覆盖产物（只覆盖，不删除旧文件，避免误删）
cd /tmp/ps-deploy
git pull --no-rebase origin gh-pages
cp -f <你的仓库>/dist/index.html ./index.html
cp -Rf <你的仓库>/dist/assets/. ./assets/

# 4. 提交并推送
git add -A
git commit -m "deploy: <这次改了什么>"
git push origin gh-pages
```

推送后等 **60~75 秒** CDN 生效，再刷新线上地址验证。确认线上版本：

```bash
curl -s https://<你的用户名>.github.io/poke-survivor/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

拿到的 bundle 名应该和本地 `dist/index.html` 里的一致。

**如果你 Fork 后想用 Actions 自动部署**，需要去自己仓库的 **Settings → Environments → github-pages** 里把 Deployment branches 规则改成允许 `main`（或删掉自定义规则）。

### 3.7 可选：接入云端账号与排行榜

**不配置也能完整游玩**，所有进度存 localStorage。只有想要云端账号、跨设备存档、排行榜时才需要。

在项目根目录建 `.env.local`：

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<你的 anon key>
```

`src/data/cloud.ts` 会检查这两个变量，任一缺失就退化为纯本地模式（`cloudEnabled = false`），代码里所有云端调用都做了空值保护。

Supabase 表结构在 `supabase/` 目录：

| 文件 | 用途 |
|---|---|
| `schema.sql` | 主表结构（账号、存档、段位） |
| `ranking.sql` | 排行榜视图 |
| `session-token.sql` | 会话令牌表 |
| `clear-ranking.sql` | 清空排行榜（测试用） |

按顺序在 Supabase SQL Editor 里执行即可。

> ⚠️ `.env.local` 已在 `.gitignore` 里，**不要提交**。`VITE_` 前缀的变量会被打进前端 bundle，所以这里放的必须是 **anon key**（公开可用的低权限 key），**绝不能放 service_role key**。

### 3.8 二次开发常见任务

**加一个新招式**

1. `src/data/moves.ts` — 在 `MOVES` 里加一条，参照已有条目填 `baseDamage`、`cooldown`、`style`、`traits`
2. `src/data/pokedex.ts` — 在 `POKEMON_PLAYABLE` 里加一只宝可梦，`move` 字段填新招式的 key
3. `src/data/evolutions.ts` — 可选，给这个招式加进化链
4. 跑 `npm run verify`，`moves.test.ts` 会检查字段完整性

**加一张新地图**

1. `src/data/maps.ts` — 在 `MAP_THEMES` 里追加一个主题对象，填配色、`enemyPool`、`elitePool`、`spawnMul`、`expMul`、`decorations`
2. `STAGE_COUNT` 会自动跟着变（`= MAP_THEMES.length`）
3. `tests/stage.test.ts` 会自动覆盖新关卡

**调数值平衡**

| 想改什么 | 改哪里 |
|---|---|
| 关卡难度曲线 | `src/data/maps.ts` 的 `STAGE_ATK_STEP` / `STAGE_HP_ADD` / `STAGE_SPD_STEP` |
| 玩家基础属性 | `src/data/stats.ts` 的 `BASE_STATS` |
| 一局时长 | `src/data/stats.ts` 的 `RUN_SECONDS` |
| 升级所需经验 | `src/data/stats.ts` 的 `expForLevel()` |
| 局外强化价格 | `src/data/stats.ts` 的 `PERM_COST_MIN` / `PERM_COST_MAX` / `GAMBLE_COSTS` |
| 招式伤害与冷却 | `src/data/moves.ts` |

改完必须跑 `npm run verify` —— `damage-tiers.test.ts`、`balance.test.ts`、`pacing.test.ts` 会检查改动是否破坏了预设区间。

**换素材**

| 素材 | 位置 |
|---|---|
| 宝可梦精灵图 | `public/assets/pokemon/<图鉴编号三位>.png` |
| 训练家图集 | `public/assets/trainer/` |
| UI 音效 | `public/assets/audio/` |
| 游戏 logo | `public/assets/logo.png` |

精灵图约定：**64×64 正方形 PNG 正面图**，透明底。新增宝可梦要在 `src/data/pokedex.ts` 里注册，并把编号加进 `POKEMON_IDS`，否则 `BootScene` 不会预加载。

---

## 四、技术架构

### 4.1 目录结构

```
poke-survivor/
├── index.html              # 唯一 HTML 入口，含 #game 容器与视口 CSS
├── src/
│   ├── main.ts             # 启动入口：视口校准 + Phaser.Game 配置
│   ├── globals.d.ts        # 编译期注入的全局常量类型（__BUILD_ID__ 等）
│   ├── scenes/             # 11 个 Phaser 场景
│   │   ├── BootScene.ts        # 预加载资源 → 进 Menu
│   │   ├── MenuScene.ts        # 主菜单：开始/强化/图鉴/账号/帮助/GitHub
│   │   ├── MapSelectScene.ts   # 选地图
│   │   ├── TraitSelectScene.ts # 选训练家特性
│   │   ├── PartnerSelectScene.ts # 选起手宝可梦
│   │   ├── GameScene.ts        # 核心战斗场景（最大文件）
│   │   ├── UIScene.ts          # 战斗 HUD：血条/技能栏/计时/摇杆
│   │   ├── LevelUpScene.ts     # 升级三选一弹窗
│   │   ├── GameOverScene.ts    # 结算
│   │   ├── ShopScene.ts        # 局外强化商店
│   │   └── DexScene.ts         # 图鉴
│   ├── systems/            # 无 Phaser 场景依赖的系统层
│   │   ├── CombatSystem.ts     # 招式槽、冷却、弹道、命中判定（最大系统）
│   │   ├── EnemySystem.ts      # 刷怪、移动、受击、掉落
│   │   ├── FxSystem.ts         # 粒子、冲击环、电弧、拖尾
│   │   ├── Ground.ts           # 无限程序化地面瓦片
│   │   ├── PickupSystem.ts     # 掉落的磁铁/护盾/剑
│   │   ├── SceneFlow.ts        # 统一的场景切换（绕 Phaser 队列坑）
│   │   ├── Sfx.ts              # 音效播放与映射
│   │   ├── Bgm.ts              # 背景音乐切换
│   │   └── Audio.ts            # 静音设置持久化
│   ├── objects/
│   │   └── Player.ts           # 玩家：移动、跟随队列、无敌帧、受击回调
│   ├── data/               # 纯数据与纯函数，最适合单测
│   │   ├── pokedex.ts          # 图鉴、可玩池、精英池、BOSS 池、POKEDEX_TYPE
│   │   ├── moves.ts            # 24 种招式定义
│   │   ├── evolutions.ts       # 进化链与触发条件
│   │   ├── maps.ts             # 6 张地图主题 + 关卡倍率
│   │   ├── stats.ts            # 特性、基础属性、局外强化、存档结构
│   │   ├── pickups.ts          # 掉落物定义
│   │   ├── sprites.ts / lazySprites.ts # 精灵映射与懒加载
│   │   ├── score.ts            # 计分
│   │   ├── session.ts          # 本地会话
│   │   └── cloud.ts            # Supabase 封装（可选）
│   └── ui/                 # 可复用 UI 组件
│       ├── Theme.ts            # 全局配色 token（UI.primary 等）
│       ├── RoundedPanel.ts     # 圆角面板
│       ├── Icons.ts / TraitIcons.ts # 手绘图标
│       ├── HelpPanel.ts / Feedback.ts / DevPanel.ts / BenchmarkPanel.ts
│       ├── AccountRow.ts / AuthPanel.ts  # 账号相关
│       └── devGate.ts          # 开发者模式开关
├── tests/                  # 28 个 vitest 文件
├── public/                 # 静态资源（不经过打包，原样拷贝）
│   └── assets/{pokemon,trainer,audio,ui}/
├── supabase/               # 可选的云端 SQL
├── vite.config.ts          # 构建配置 + git 版本注入
└── .github/workflows/deploy.yml  # Actions（注意 environment 保护限制）
```

### 4.2 场景流转

```
                    ┌──────────┐
                    │   Boot   │  预加载全部资源
                    └────┬─────┘
                         │ scene.start('Menu')
                         ▼
                    ┌──────────┐
       ┌────────────┤   Menu   ├────────────┐
       │            └────┬─────┘            │
       │                 │                  │
       ▼                 ▼                  ▼
 ┌──────────┐     ┌───────────┐      ┌──────────┐
 │   Shop   │     │ MapSelect │      │   Dex    │
 │  强化商店 │     └─────┬─────┘      │   图鉴    │
 └──────────┘           │            └──────────┘
                        ▼
                  ┌───────────┐
                  │TraitSelect│  选特性
                  └─────┬─────┘
                        ▼
                ┌───────────────┐
                │PartnerSelect  │  选起手宝可梦
                └───────┬───────┘
                        │ scene.launch('Game') + launch('UI')
                        ▼
        ┌───────────────────────────────┐
        │  Game  ◄─── 并行 ───►  UI     │  战斗进行中
        │        launch LevelUp         │
        │              │                │
        │              ▼                │
        │        ┌──────────┐           │
        │        │ LevelUp  │  暂停 Game │
        │        └────┬─────┘           │
        └─────────────┼─────────────────┘
                      ▼
              ┌──────────────┐
              │  GameOver    │  结算
              └──────┬───────┘
                     │ backToMenu
                     ▼
                  （Menu）
```

**关键点**：`Game` 与 `UI` 是两个**并行运行**的场景。`GameScene` 只管世界（玩家、敌人、弹道），`UIScene` 只管 HUD（血条、技能栏、计时器、虚拟摇杆）。两者通过 `GameScene` 上的 public 字段通信。

**所有场景切换必须走 `src/systems/SceneFlow.ts` 的 `goTo()` / `backToMenu()` / `abandonRun()`**，不要直接调 `scene.start()`。原因见 [4.9](#49-已知陷阱)。

### 4.3 一局的运行时循环

`GameScene.update(time, delta)` 是整局的主循环，每帧按固定顺序执行：

```
1. 早退检查         runEnded / paused → 玩家停止移动，return
2. elapsed += dt
3. 读取输入         WASD/方向键 → vx,vy；触屏摇杆优先覆盖
4. player.moveWith 应用移动
5. player.layoutFollowers  跟随队列重新排位
6. player.updateTimers    无敌帧、受击计时器递减
7. ground.update   按摄像机位置补/删地面瓦片
8. updateSpawning  按 elapsed 和地图倍率刷怪
9. enemies.update  敌人朝玩家移动、分离、接触判定
10. combat.update  各招式槽冷却判定 → 出招 → 弹道推进 → 命中结算
11. checkPlayerHit 敌人贴身接触伤害
12. updateOrbs     经验球吸附与拾取
13. updatePickups  磁铁/护盾/剑掉落的计时与拾取
14. updateChests   宝箱刷新与开启
15. 死亡判定        player.isDead → endRun(false)
16. 终局 BOSS       elapsed >= RUN_SECONDS → spawnFinalBoss()
17. updateBossBar  更新 BOSS 血条
18. updateBossSkill    终局 BOSS 三技能轮转计时
19. updateEliteSkills  精英独立计时出招
```

出招本身由 `CombatSystem` 负责：每个槽位有自己的冷却计时器，冷却归零就按招式的 `style` 走不同分支（近战扇形 / 弹道投射 / 光环持续 / AOE 落点 / 召唤）。

### 4.4 核心系统职责

| 系统 | 职责 | 不负责 |
|---|---|---|
| `CombatSystem` | 招式槽管理、冷却、出招、弹道推进、命中判定、伤害计算、进化触发 | 不碰 UI、不碰刷怪 |
| `EnemySystem` | 刷怪、敌人朝向/分离移动、受击扣血、死亡回收进对象池、伤害飘字 | 不决定出招 |
| `FxSystem` | 粒子爆发、冲击环、电弧、拖尾、击杀烟 | 不参与任何判定 |
| `Ground` | 无限地面：按摄像机视口计算需要哪些瓦片，实时增删 | 不处理碰撞 |
| `PickupSystem` | 磁铁/护盾/剑的生成、计时、拾取效果 | 不处理经验球 |
| `SceneFlow` | 统一场景切换，绕开 Phaser 的 `isProcessing` 队列坑 | 不碰游戏逻辑 |
| `Player` | 移动、跟随队列排布、无敌帧计时、受击事件发出 | 不决定伤害数值 |

对象池：敌人和弹道都用 Phaser 的 `Group` 做池化（`recycle()` 回收），避免频繁创建销毁造成 GC 抖动。同屏敌人上限 `ENEMY_CAP = 300`。

### 4.5 数据层

`src/data/` 下全是**纯数据 + 纯函数**，不依赖 Phaser，因此可以直接被 vitest import 测试。这是本项目可测性的基础。

数据之间的引用关系（改一处要同步改另一处）：

```
pokedex.ts
  POKEMON_PLAYABLE[].move ──────┐
                                ├──► moves.ts  MOVES[moveKey]
  BOSS_POOL / ELITE_POOL        │
  POKEDEX_TYPE[id]              └──► evolutions.ts  EVOLUTIONS[moveKey]
        │
        └──► GameScene.bossProfile(id) 决定 BOSS 配色与技能属性

maps.ts
  MAP_THEMES[].enemyPool ────► pokedex.ts 的精灵 id
  MAP_THEMES[].elitePool ────► pokedex.ts 的精灵 id
  STAGE_COUNT = MAP_THEMES.length
  stageScale(stage) ─────────► GameScene 用它算 hpMul / atkMul / spdMul

stats.ts
  TRAITS / BASE_STATS / PERM_UPGRADES / SaveData
```

**约束**：`POKEMON_PLAYABLE` 里的 `move` 字段必须在 `MOVES` 和 `EVOLUTIONS` 里存在，否则招式抽不到或进化不触发。`tests/moves.test.ts` 和 `tests/evolution-coverage.test.ts` 会检查这一点。

### 4.6 数值体系

**关卡倍率**（`src/data/maps.ts`）：

```ts
atk = 1.15 ^ n          // 攻击指数增长
hp  = 1 + 0.16 × n      // 血量线性增长（曾用 1.20^n，第 6 关到 3.86× 太快，已改）
spd = 1.02 ^ n          // 速度指数微增
```

`n` 是关卡序号（0 起）。血量走线性是刻意的：旧版 `1.20^n` 叠加局内时间成长后，第 6 关最坏到 **3.86×**，升级完全追不上。

**局内时间成长**（`GameScene`）：

```ts
hpMul = (1 + 0.55 × (min(t,300)/300)^1.5) × stageScale.hp
```

5 分钟时时间倍率 **1.55×**，之后不再涨。

**玩家伤害成长**：每级招式 +42%，8 级约 **3.94×**，触发进化时再跳一档。

### 4.7 UI 层

`UIScene` 与 `GameScene` 并行运行，只画 HUD。所有可调尺寸集中在 `relayout()` 里，视口变化时重排。

**配色统一走 `src/ui/Theme.ts` 的 `UI` 对象**，不要在场景里写裸色值：

```ts
import { UI } from '../ui/Theme';
const panel = this.add.rectangle(0, 0, 200, 80, UI.secondary);
```

`Theme.ts` 里定义了 `primary` / `secondary` / `primaryStroke` / `secondaryHover` 等 token。历史代码里仍有约 220 处硬编码颜色，是待清理的技术债。

### 4.8 渲染与性能约束

- **无限地面**：`Ground` 只维护视口 + 一圈缓冲区的瓦片，摄像机移动时补新瓦片、回收旧瓦片，地图没有边界也没有上限
- **对象池**：敌人、弹道、经验球全部池化，`ENEMY_CAP = 300` 上限
- **粒子上限**：`FxSystem` 每次爆发有粒子上限（`hitParticles` 最多 26），避免大规模群攻时帧率崩
- **纹理清理**：文字用 `SceneFlow.installTextTextureCleanup()` 定期销毁动态生成的文字纹理，防内存泄漏
- **移动端视口**：见 [4.9](#49-已知陷阱) 的「画面放大」

### 4.9 已知陷阱

这些是踩过的坑，改代码时注意别踩回去。

| 坑 | 现象 | 正确做法 |
|---|---|---|
| **Phaser 场景切换队列** | 在 `pointerdown` 回调里调 `scene.start()`，新场景卡在 RUNNING 但查不到 | 一律走 `SceneFlow.goTo()`，内部用 `requestAnimationFrame` 挪到下一帧 |
| **iOS 首屏画面放大** | 首次加载画面被拉伸放大，刷新才正常 | 宽度用 `innerWidth`，高度取 `innerHeight` 与 `visualViewport.height` 的较小值；启动后主动校准两次 |
| **Boot 加载被打断** | 场景永远停在 `LOADING…` | `game.scale.resize()` 不能在 Boot 的 loading 期间调用，会打断加载流程 |
| **tween 抢同一属性** | 两个 tween 同时改一个对象的 `alpha`，后起的覆盖前者，动画卡死 | 拆成两个独立对象，各自控制自己的属性 |
| **后台标签 rAF 节流** | 调试时 `loop.frame` 卡在 0，场景不进、`delayedCall` 不执行 | 不是 bug。调试时 `Page.bringToFront` + `Emulation.setFocusEmulationEnabled` |
| **`100vw` 含滚动条宽度** | 画布被拉伸几个像素 | CSS 用 `100%` 而非 `100vw` |
| **`pixelArt: true` 影响新纹理** | 非像素图（logo）边缘出白点 | 加载时显式指定 `magFilter`/`minFilter` 为 LINEAR |
| **弹体池复用残留 splitDef** | 分裂子弹继续分裂，伤害指数下溢到 `1e-37`、弹体数量暴涨 | 创建弹体和分裂时都要显式清/设 `splitDef`，子弹出必须置 `undefined` |
| **弹体缩放后碰撞体不变** | `setScale(0.55)` 后 `body` 仍按原尺寸，实际碰撞半径只剩 1~2px，看着打中却不掉血 | 缩放后按 `目标半径 / scale` 反算，重新 `setCircle` |
| **`buffTopY` 为 0** | BOSS 血条用回退值，跑到屏幕中间 | `layoutBuffs()` 里先无条件算好位置再 `if (!n) return` |

---

## 五、贡献

1. Fork 并新建分支：`git checkout -b feat/your-feature`
2. 改代码
3. **跑 `npm run verify`**，必须全绿
4. 提交：`git commit -m "feat: 做了什么"`
5. 推送并发起 Pull Request

提交信息建议用 `feat:` / `fix:` / `perf:` / `docs:` / `deploy:` 前缀。

改动数值平衡时，请一并说明改动的理由和实测数据（第几关、多少分钟、什么属性）。

---

## 六、版权与声明

本项目**仅用于学习和技术交流**，不含任何商业用途。

- 宝可梦（Pokémon）相关名称、形象、招式名称的著作权归 **Nintendo / Creatures Inc. / GAME FREAK inc.** 所有
- 玩法受《Vampire Survivors》（poncle）启发
- 本项目代码以 MIT 协议开源，**但不包含上述第三方知识产权**

如果你是权利方并认为本项目侵犯了你的权益，请联系删除。

---

<div align="right">

[⬆ 回到顶部](#poke-survivor) · [English →](README.en.md)

</div>
