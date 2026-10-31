<div align="right">

[简体中文](README.md) · **English**

</div>

# Poke Survivor

A Pokémon-themed roguelite bullet-heaven survivor (Vampire Survivors style), built with Phaser 3 + TypeScript + Vite. Pure frontend — playable straight in the browser.

**🎮 Play now → https://helisz.github.io/poke-survivor/**

---

## Table of Contents

- [1. Introduction](#1-introduction)
- [2. Gameplay](#2-gameplay)
  - [2.1 A Run, Step by Step](#21-a-run-step-by-step)
  - [2.2 Trainer Traits](#22-trainer-traits)
  - [2.3 Level-Up: Pick 1 of 3](#23-level-up-pick-1-of-3)
  - [2.4 Three Tiers of Enemies](#24-three-tiers-of-enemies)
  - [2.5 Six Maps](#25-six-maps)
  - [2.6 Meta Progression](#26-meta-progression)
  - [2.7 Controls](#27-controls)
- [3. For Developers: Building on This](#3-for-developers-building-on-this)
  - [3.1 Fork & Clone](#31-fork--clone)
  - [3.2 Requirements](#32-requirements)
  - [3.3 Running Locally](#33-running-locally)
  - [3.4 Tech Stack](#34-tech-stack)
  - [3.5 Testing](#35-testing)
  - [3.6 Build & Deploy](#36-build--deploy)
  - [3.7 Optional: Cloud Accounts & Leaderboard](#37-optional-cloud-accounts--leaderboard)
  - [3.8 Common Development Tasks](#38-common-development-tasks)
- [4. Architecture](#4-architecture)
  - [4.1 Directory Layout](#41-directory-layout)
  - [4.2 Scene Flow](#42-scene-flow)
  - [4.3 The Run Loop](#43-the-run-loop)
  - [4.4 System Responsibilities](#44-system-responsibilities)
  - [4.5 Data Layer](#45-data-layer)
  - [4.6 Balance Model](#46-balance-model)
  - [4.7 UI Layer](#47-ui-layer)
  - [4.8 Rendering & Performance](#48-rendering--performance)
  - [4.9 Known Pitfalls](#49-known-pitfalls)
- [5. Contributing](#5-contributing)
- [6. Copyright & Disclaimer](#6-copyright--disclaimer)

---

## 1. Introduction

If you've played Vampire Survivors you already know the loop: you press no buttons, you just dodge, and the character kills things by itself. The difference here is that "the character" is a whole squad of Pokémon — whichever move you draft, the matching Pokémon shows up, follows you, and auto-casts.

- **5-minute runs** (`RUN_SECONDS = 5 * 60`; the plan is 15 minutes for the full release)
- **6 maps**, each with different spawn and EXP multipliers
- **24 playable Pokémon**, each bound to one signature move, with evolutions
- **24 moves** across 5 archetypes (melee / projectile / aura / AOE / summon)
- **6 move slots**, pick 1 of 3 on level-up, rerollable
- **Three-tier boss system**: elites (every 30s) → mini-bosses (timed) → final boss (3-skill rotation)
- **Meta progression**: coins in localStorage, 9 permanent upgrades in the shop, persistent across runs

Roughly **12,700 lines of TypeScript**, 28 test files, 232 assertions.

---

## 2. Gameplay

### 2.1 A Run, Step by Step

1. **Pick a map** — six maps, later ones spawn more enemies and give more EXP
2. **Pick a trainer trait** — 1 of 9, sets the stat bias for the run
3. **Pick a partner** — 1 of 24 playable Pokémon, sets your starting move
4. **Fight** — dodge enemies, your partner auto-attacks
5. **Collect EXP orbs** — dropped on kill, magnetized to you, then you level up
6. **Level up: pick 1 of 3** — new move / upgrade / stat boost, rerolls available
7. **Survive to the timer** — at zero a final boss spawns; **you must kill it to clear the run**
8. **Settle** — collect coins, head back to the shop and spend them

Timeline:

| Time | Event |
|---|---|
| 0:00 | Run starts, common enemies begin spawning |
| Every 30s | Elite wave (2–3 at a time in later stages) |
| ~2:00 | Mini-boss spawns (1.47× scale, 3000 HP) |
| ~4:40 | Second mini-boss |
| 5:00 | Timer ends, final boss enters (3-skill rotation) |
| Final boss killed | Run cleared |

### 2.2 Trainer Traits

1 of 9, all small bonuses, defining your growth curve for the run:

| Trait | Effect |
|---|---|
| Swift (急足) | Move speed +6% |
| Iron Wall (铁壁) | Max HP +12, damage taken −5% |
| Affinity (亲和) | Pickup radius +15%, EXP +5% |
| Brute Force (蛮力) | Damage +5% |
| Haste (迅捷) | Move cooldown −4% |
| Vitality (活力) | Max HP +18, heal orb effect +15% |
| Scholar (好学) | EXP +8% |
| Magnet (磁力) | Pickup radius +25% |
| Guardian (守护) | Damage taken −8% |

Defined in `TRAITS` in `src/data/stats.ts`.

### 2.3 Level-Up: Pick 1 of 3

Each level-up offers three cards, in four kinds:

| Card kind | Effect |
|---|---|
| **New move** | Takes an empty slot, adds a new Pokémon partner |
| **Upgrade** | Levels up an existing move — damage/area/cooldown scale per the move table |
| **Evolve** | Appears at move level `MOVE_LEVEL_EVOLVE_AT = 8`; the Pokémon transforms, damage multiplier jumps |
| **Stat** | Direct stat boost (HP / attack / speed / crit / pickup) |

Slot cap is `MAX_SLOTS = 6`. Rerolls start at 3; each shop level of "Gambler" adds 1.

### 2.4 Three Tiers of Enemies

| Type | Scale | HP | Appearance | Behavior |
|---|---|---|---|---|
| Common | 0.62–0.70× | 26 | Throughout | Body-checks only |
| **Elite** | 1.35× | 260 | Every 30s | **Casts skills**: 5.5s interval, 0.45 power |
| **Mini-boss** | 1.47× | 3000 | One at 2:00, one at 4:40 | **Casts skills**: 4.2s interval, 0.55 power |
| **Final boss** | 1.47× | — | When timer ends | **3-skill rotation**: one per 2.4s, 1.0 power |

**Elite and boss skills follow the Pokémon's own type** (Grass→quake, Fire→charge, Electric→thunder, Ice→shards, Water→tide, Psychic→wave, Dragon→dash). The type table lives in `POKEDEX_TYPE` in `src/data/pokedex.ts`; anything unlisted falls back by type name.

Three safeguards keep elites from turning the screen into bullet hell:

- Only elites within **620px** of the player cast; off-screen ones keep walking in
- At most **2 elites** cast simultaneously
- Each elite **times itself independently**, with a random 1.5–5.5s initial delay, so a wave never fires in unison

The final boss rotates three skills, each demanding a different dodge:

1. **Type signature** — the boss's own elemental skill
2. **Homing snipe** — 3–4 homing shots, each re-locking your live position; standing still gets you hit, moving dodges it
3. **Nova ring** — interleaved double rings (13+11, 16+13 when enraged); the second ring is offset half a gap so there's a seam

Below **40%** HP the boss enrages, increasing shot count and speed.

### 2.5 Six Maps

| Stage | Map | Spawn mult. | EXP mult. |
|---|---|---|---|
| 1 | Grassland | 1.00× | 1.00× |
| 2 | Forest | 1.15× | 1.05× |
| 3 | Cave | 0.85× | 1.20× |
| 4 | Swamp | 1.35× | 1.10× |
| 5 | Volcano | 1.10× | 1.30× |
| 6 | Ruins | 1.20× | 1.45× |

Each map has its own palette, ground decorations, enemy pool, and elite pool. Defined in `MAP_THEMES` in `src/data/maps.ts`.

### 2.6 Meta Progression

Coins live in localStorage and accumulate across runs. The shop has 9 permanent upgrades, 10 levels each ("Gambler" has 3), priced from 50 up to 30,000 on a flat-then-steep curve:

| Upgrade | Effect |
|---|---|
| Body (体魄) | Max HP |
| Power (威力) | Damage |
| Legs (脚力) | Move speed |
| Keen Eye (锐眼) | Crit chance |
| Wrath (怒击) | Crit damage |
| Magnet Pull (磁引) | Pickup radius |
| Insight (悟性) | EXP gain |
| Rhythm (节律) | Cooldown reduction |
| Gambler (赌神) | +1 reroll per level-up (50k / 150k / 500k) |

### 2.7 Controls

| Platform | Move | Select |
|---|---|---|
| Desktop | `WASD` / arrow keys | `1` `2` `3` on level-up, `R` to reroll |
| Mobile | Hold anywhere and drag the virtual stick | Tap a card |

Your trailing Pokémon auto-attacks. The player **does not — and should not —** attack manually.

---

## 3. For Developers: Building on This

### 3.1 Fork & Clone

**Just to run and modify it locally:**

```bash
git clone git@github.com:helisz/poke-survivor.git
cd poke-survivor
npm install
```

**To publish your own copy (e.g. deploy your fork to your own GitHub Pages):**

1. Open https://github.com/helisz/poke-survivor and click **Fork** (top right)
2. Clone your copy:

```bash
git clone git@github.com:<your-username>/poke-survivor.git
cd poke-survivor
npm install
```

3. For GitHub Actions deploys, go to **Settings → Pages** and set Source to **GitHub Actions**. For the `gh-pages` branch route (recommended, see 3.6), set Source to **Deploy from a branch → gh-pages / (root)**.

### 3.2 Requirements

| Item | Requirement |
|---|---|
| Node.js | **20 LTS or newer** (CI uses 20) |
| npm | Whatever ships with Node |
| OS | macOS / Linux / Windows all work |
| Browser | Chrome 90+ / Safari 15+ / Edge 90+ (needs WebGL and Canvas2D) |
| Disk | ~500MB (mostly `node_modules`) |

There are **no native dependencies** — `npm install` needs no compiler toolchain.

### 3.3 Running Locally

```bash
npm install        # first-time dependency install
npm run dev        # dev server, http://localhost:5173 by default
```

Vite provides HMR — save a `.ts` file and it reloads.

Other commands:

```bash
npm run build      # type-check + build into dist/
npm run preview    # preview the built output locally
npm run test       # tests only
npm run test:watch # tests in watch mode
npm run verify     # type-check + tests (run this before committing)
```

### 3.4 Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Engine | **Phaser 3.90** | WebGL rendering + Arcade physics |
| Language | **TypeScript 5.6** | `strict: true` |
| Build | **Vite 5** | Dev server + bundler |
| Testing | **Vitest 2** | Unit tests, no browser needed |
| Backend (optional) | **Supabase** | Cloud accounts, leaderboard, cross-device saves |
| Password hashing (optional) | **bcryptjs** | Only used with cloud accounts |

**There is no UI framework** (no React/Vue) — every screen is hand-drawn with Phaser Graphics / Text / Container. This is deliberate; the cost is that all layout is hand-placed. See [4.9 Known Pitfalls](#49-known-pitfalls).

### 3.5 Testing

```bash
npm run verify   # tsc --noEmit + vitest run, 232 assertions
```

28 test files covering:

| File | Coverage |
|---|---|
| `damage-tiers.test.ts` | Damage tiers, DPS ranges for single/multi/AOE moves |
| `moves.test.ts` | Move table completeness, required fields, valid styles |
| `stage.test.ts` | Stage multiplier curve (linear/exponential) assertions |
| `enemy-hp.test.ts` / `enemy-motion.test.ts` | Enemy HP curve, movement behavior |
| `balance.test.ts` / `pacing.test.ts` | Overall balance and pacing |
| `evolution-coverage.test.ts` / `skill-growth.test.ts` | Evolution coverage, skill growth curves |
| `scene-flow.test.ts` / `scene-refresh.test.ts` | Scene transitions, refresh recovery |
| `session-*.test.ts` / `logout-clears-save.test.ts` | Session, save, and logout data consistency |
| `perm.test.ts` / `score.test.ts` / `sfx.test.ts` | Meta upgrade pricing, scoring, SFX mapping |

**Tests need no browser**: every assertion runs in Node against pure logic (numbers, data tables, state machines), never rendering.

To write a new test, just import from `src/`:

```ts
import { MOVES } from '../src/data/moves';
import { STAGE_HP_ADD, stageScale } from '../src/data/maps';
```

### 3.6 Build & Deploy

#### Build

```bash
npm run build
```

Output lands in `dist/`. The build runs `tsc --noEmit` first — **type errors abort the build**.

`vite.config.ts` injects the git commit count, build time, and version tag as compile-time constants, shown at the bottom of the main menu (e.g. `v0.4.106 · 2026-10-30 23:45:49`) so you can confirm whether your phone is running the latest build.

#### Deploying to GitHub Pages

> ⚠️ **Important**: this repo's `github-pages` environment protection rule **only allows deploys from the `gh-pages` branch**.
> Pushing to `main` triggers an Actions run that fails with `Branch "main" is not allowed to deploy to github-pages`.
> You must push `dist/` to the `gh-pages` branch.

**Manual deploy flow** (what this project actually uses):

```bash
# 1. Build
npm run build

# 2. Prepare a gh-pages working copy (first time only)
git clone --branch gh-pages --single-branch \
  git@github.com:<your-username>/poke-survivor.git /tmp/ps-deploy

# 3. Copy the build output in (overwrite only, never delete)
cd /tmp/ps-deploy
git pull --no-rebase origin gh-pages
cp -f <your-repo>/dist/index.html ./index.html
cp -Rf <your-repo>/dist/assets/. ./assets/

# 4. Commit and push
git add -A
git commit -m "deploy: <what changed>"
git push origin gh-pages
```

Wait **60–75 seconds** for the CDN, then reload the live URL. Verify the deployed bundle:

```bash
curl -s https://<your-username>.github.io/poke-survivor/ | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

The bundle name should match the one in your local `dist/index.html`.

**To use Actions auto-deploy after forking**, go to your repo's **Settings → Environments → github-pages** and change the Deployment branches rule to allow `main` (or remove the custom rule).

### 3.7 Optional: Cloud Accounts & Leaderboard

**Everything works without this** — all progress lives in localStorage. You only need it for cloud accounts, cross-device saves, and leaderboards.

Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key>
```

`src/data/cloud.ts` checks both variables; if either is missing it degrades to pure local mode (`cloudEnabled = false`), and every cloud call is null-guarded.

SQL lives in `supabase/`:

| File | Purpose |
|---|---|
| `schema.sql` | Main tables (accounts, saves, rank) |
| `ranking.sql` | Leaderboard view |
| `session-token.sql` | Session token table |
| `clear-ranking.sql` | Clear the leaderboard (for testing) |

Run them in order in the Supabase SQL Editor.

> ⚠️ `.env.local` is gitignored — **never commit it**. `VITE_`-prefixed variables get bundled into the frontend, so it must be the **anon key** (a public, low-privilege key). **Never put a service_role key here.**

### 3.8 Common Development Tasks

**Add a new move**

1. `src/data/moves.ts` — add an entry to `MOVES`; follow existing entries for `baseDamage`, `cooldown`, `style`, `traits`
2. `src/data/pokedex.ts` — add a Pokémon to `POKEMON_PLAYABLE`, with `move` pointing at the new move key
3. `src/data/evolutions.ts` — optional, add an evolution chain for the move
4. Run `npm run verify`; `moves.test.ts` validates field completeness

**Add a new map**

1. `src/data/maps.ts` — append a theme object to `MAP_THEMES` with palette, `enemyPool`, `elitePool`, `spawnMul`, `expMul`, `decorations`
2. `STAGE_COUNT` follows automatically (`= MAP_THEMES.length`)
3. `tests/stage.test.ts` picks up the new stage automatically

**Tune balance**

| What | Where |
|---|---|
| Stage difficulty curve | `STAGE_ATK_STEP` / `STAGE_HP_ADD` / `STAGE_SPD_STEP` in `src/data/maps.ts` |
| Player base stats | `BASE_STATS` in `src/data/stats.ts` |
| Run length | `RUN_SECONDS` in `src/data/stats.ts` |
| EXP per level | `expForLevel()` in `src/data/stats.ts` |
| Meta upgrade pricing | `PERM_COST_MIN` / `PERM_COST_MAX` / `GAMBLE_COSTS` in `src/data/stats.ts` |
| Move damage and cooldown | `src/data/moves.ts` |

Always run `npm run verify` afterwards — `damage-tiers.test.ts`, `balance.test.ts`, and `pacing.test.ts` check that your change didn't break the expected ranges.

**Swap assets**

| Asset | Location |
|---|---|
| Pokémon sprites | `public/assets/pokemon/<3-digit dex id>.png` |
| Trainer atlas | `public/assets/trainer/` |
| UI sound effects | `public/assets/audio/` |
| Game logo | `public/assets/logo.png` |

Sprite convention: **64×64 square PNG, front-facing, transparent background**. New Pokémon must be registered in `src/data/pokedex.ts` and their id added to `POKEMON_IDS`, or `BootScene` won't preload them.

---

## 4. Architecture

### 4.1 Directory Layout

```
poke-survivor/
├── index.html              # Single HTML entry: #game container + viewport CSS
├── src/
│   ├── main.ts             # Entry point: viewport calibration + Phaser.Game config
│   ├── globals.d.ts        # Compile-time global constant types (__BUILD_ID__ etc.)
│   ├── scenes/             # 11 Phaser scenes
│   │   ├── BootScene.ts        # Preload assets → go to Menu
│   │   ├── MenuScene.ts        # Main menu: play/shop/dex/account/help/GitHub
│   │   ├── MapSelectScene.ts   # Map selection
│   │   ├── TraitSelectScene.ts # Trainer trait selection
│   │   ├── PartnerSelectScene.ts # Starting Pokémon selection
│   │   ├── GameScene.ts        # Core combat scene (largest file)
│   │   ├── UIScene.ts          # Combat HUD: HP bar/move bar/timer/virtual stick
│   │   ├── LevelUpScene.ts     # Pick-1-of-3 modal
│   │   ├── GameOverScene.ts    # Run summary
│   │   ├── ShopScene.ts        # Meta upgrade shop
│   │   └── DexScene.ts         # Pokédex
│   ├── systems/            # System layer, free of scene-level dependencies
│   │   ├── CombatSystem.ts     # Move slots, cooldowns, projectiles, hit detection (largest system)
│   │   ├── EnemySystem.ts      # Spawning, movement, damage, drops
│   │   ├── FxSystem.ts         # Particles, shock rings, arcs, trails
│   │   ├── Ground.ts           # Infinite procedural ground tiles
│   │   ├── PickupSystem.ts     # Magnet/shield/sword drops
│   │   ├── SceneFlow.ts        # Centralized scene switching (works around a Phaser queue bug)
│   │   ├── Sfx.ts              # Sound effect playback and mapping
│   │   ├── Bgm.ts              # Background music switching
│   │   └── Audio.ts            # Mute setting persistence
│   ├── objects/
│   │   └── Player.ts           # Player: movement, follower queue, i-frames, hurt callback
│   ├── data/               # Pure data + pure functions — the ideal unit-test surface
│   │   ├── pokedex.ts          # Dex, playable pool, elite pool, boss pool, POKEDEX_TYPE
│   │   ├── moves.ts            # 24 move definitions
│   │   ├── evolutions.ts       # Evolution chains and triggers
│   │   ├── maps.ts             # 6 map themes + stage multipliers
│   │   ├── stats.ts            # Traits, base stats, meta upgrades, save structure
│   │   ├── pickups.ts          # Drop definitions
│   │   ├── sprites.ts / lazySprites.ts # Sprite mapping and lazy loading
│   │   ├── score.ts            # Scoring
│   │   ├── session.ts          # Local session
│   │   └── cloud.ts            # Supabase wrapper (optional)
│   └── ui/                 # Reusable UI components
│       ├── Theme.ts            # Global color tokens (UI.primary etc.)
│       ├── RoundedPanel.ts     # Rounded panel
│       ├── Icons.ts / TraitIcons.ts # Hand-drawn icons
│       ├── HelpPanel.ts / Feedback.ts / DevPanel.ts / BenchmarkPanel.ts
│       ├── AccountRow.ts / AuthPanel.ts  # Account UI
│       └── devGate.ts          # Developer mode toggle
├── tests/                  # 28 vitest files
├── public/                 # Static assets (copied verbatim, not bundled)
│   └── assets/{pokemon,trainer,audio,ui}/
├── supabase/               # Optional cloud SQL
├── vite.config.ts          # Build config + git version injection
└── .github/workflows/deploy.yml  # Actions (mind the environment protection rule)
```

### 4.2 Scene Flow

```
                    ┌──────────┐
                    │   Boot   │  preload everything
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
 └──────────┘     └─────┬─────┘      └──────────┘
                        ▼
                  ┌───────────┐
                  │TraitSelect│  pick trait
                  └─────┬─────┘
                        ▼
                ┌───────────────┐
                │PartnerSelect  │  pick starter
                └───────┬───────┘
                        │ scene.launch('Game') + launch('UI')
                        ▼
        ┌───────────────────────────────┐
        │  Game  ◄── parallel ──►  UI   │  combat running
        │        launch LevelUp         │
        │              │                │
        │              ▼                │
        │        ┌──────────┐           │
        │        │ LevelUp  │  pauses Game │
        │        └────┬─────┘           │
        └─────────────┼─────────────────┘
                      ▼
              ┌──────────────┐
              │  GameOver    │  run summary
              └──────┬───────┘
                     │ backToMenu
                     ▼
                  （Menu）
```

**Key point**: `Game` and `UI` are two **concurrently running** scenes. `GameScene` owns the world (player, enemies, projectiles); `UIScene` owns the HUD (HP bar, move bar, timer, virtual stick). They communicate through public fields on `GameScene`.

**All scene transitions must go through `goTo()` / `backToMenu()` / `abandonRun()` in `src/systems/SceneFlow.ts`** — never call `scene.start()` directly. See [4.9](#49-known-pitfalls) for why.

### 4.3 The Run Loop

`GameScene.update(time, delta)` is the main loop for the whole run, executing in a fixed order each frame:

```
1.  Early exit         runEnded / paused → stop the player, return
2.  elapsed += dt
3.  Read input         WASD/arrows → vx,vy; touch stick overrides
4.  player.moveWith    apply movement
5.  player.layoutFollowers  re-position the follower queue
6.  player.updateTimers    tick i-frames and hurt timers
7.  ground.update      add/remove ground tiles based on camera position
8.  updateSpawning     spawn enemies by elapsed time and map multipliers
9.  enemies.update     enemies home in, separate, touch damage
10. combat.update      per-slot cooldown → cast → projectile advance → hit resolution
11. checkPlayerHit     melee contact damage from enemies
12. updateOrbs         EXP orb magnetism and pickup
13. updatePickups      magnet/shield/sword timers and pickup
14. updateChests       chest spawning and opening
15. Death check        player.isDead → endRun(false)
16. Final boss         elapsed >= RUN_SECONDS → spawnFinalBoss()
17. updateBossBar      refresh the boss HP bar
18. updateBossSkill    final boss 3-skill rotation timer
19. updateEliteSkills  per-elite independent cast timers
```

Casting itself lives in `CombatSystem`: each slot has its own cooldown timer; when it hits zero, the move's `style` selects a branch (melee cone / projectile / sustained aura / AOE ground target / summon).

### 4.4 System Responsibilities

| System | Owns | Does not own |
|---|---|---|
| `CombatSystem` | Move slots, cooldowns, casting, projectile advance, hit detection, damage calc, evolution triggers | No UI, no spawning |
| `EnemySystem` | Spawning, enemy homing/separation movement, damage, pooling on death, damage numbers | Doesn't decide casting |
| `FxSystem` | Particle bursts, shock rings, arcs, trails, kill puffs | No gameplay logic |
| `Ground` | Infinite ground: computes which tiles the viewport needs, adds/removes live | No collision |
| `PickupSystem` | Magnet/shield/sword spawn, timers, effects | Doesn't handle EXP orbs |
| `SceneFlow` | Centralized scene switching, working around Phaser's `isProcessing` queue bug | No game logic |
| `Player` | Movement, follower queue layout, i-frame timing, emitting hurt events | Doesn't decide damage values |

Object pooling: enemies and projectiles use Phaser `Group` pools (`recycle()`), avoiding create/destroy churn and GC jitter. Concurrent enemy cap is `ENEMY_CAP = 300`.

### 4.5 Data Layer

Everything under `src/data/` is **pure data + pure functions**, with no Phaser dependency, so vitest can import it directly. This is the foundation of the project's testability.

Cross-references (change one, update the other):

```
pokedex.ts
  POKEMON_PLAYABLE[].move ──────┐
                                ├──► moves.ts  MOVES[moveKey]
  BOSS_POOL / ELITE_POOL        │
  POKEDEX_TYPE[id]              └──► evolutions.ts  EVOLUTIONS[moveKey]
        │
        └──► GameScene.bossProfile(id) decides boss palette and skill type

maps.ts
  MAP_THEMES[].enemyPool ────► sprite ids in pokedex.ts
  MAP_THEMES[].elitePool ────► sprite ids in pokedex.ts
  STAGE_COUNT = MAP_THEMES.length
  stageScale(stage) ─────────► GameScene uses it for hpMul / atkMul / spdMul

stats.ts
  TRAITS / BASE_STATS / PERM_UPGRADES / SaveData
```

**Constraint**: every `move` in `POKEMON_PLAYABLE` must exist in both `MOVES` and `EVOLUTIONS`, or the move can't be drawn and evolution never triggers. `tests/moves.test.ts` and `tests/evolution-coverage.test.ts` enforce this.

### 4.6 Balance Model

**Stage multipliers** (`src/data/maps.ts`):

```ts
atk = 1.15 ^ n          // attack grows exponentially
hp  = 1 + 0.16 × n      // HP grows linearly (was 1.20^n; stage 6 hit 3.86×, too fast)
spd = 1.02 ^ n          // speed grows slightly exponentially
```

`n` is the stage index (0-based). The linear HP curve is deliberate: the old `1.20^n` stacked with in-run time scaling pushed stage 6 to **3.86×** at worst, which level-ups could not keep up with.

**In-run time scaling** (`GameScene`):

```ts
hpMul = (1 + 0.55 × (min(t,300)/300)^1.5) × stageScale.hp
```

The time multiplier peaks at **1.55×** at 5 minutes and stops growing.

**Player damage growth**: each move level adds 42%, reaching roughly **3.94×** at level 8, with another jump on evolution.

### 4.7 UI Layer

`UIScene` runs alongside `GameScene` and only draws the HUD. All tunable dimensions live in `relayout()`, which re-runs on viewport changes.

**Use the `UI` token object from `src/ui/Theme.ts`** — don't write raw color literals in scenes:

```ts
import { UI } from '../ui/Theme';
const panel = this.add.rectangle(0, 0, 200, 80, UI.secondary);
```

`Theme.ts` defines tokens like `primary` / `secondary` / `primaryStroke` / `secondaryHover`. Around 220 hard-coded colors remain in historical code — known tech debt.

### 4.8 Rendering & Performance

- **Infinite ground**: `Ground` only maintains tiles for the viewport plus a one-tile buffer, adding and recycling as the camera moves; the map has neither bounds nor limit
- **Object pooling**: enemies, projectiles, and EXP orbs are all pooled; `ENEMY_CAP = 300`
- **Particle caps**: `FxSystem` caps particles per burst (`hitParticles` max 26) so large group attacks don't tank the frame rate
- **Texture cleanup**: `SceneFlow.installTextTextureCleanup()` periodically destroys dynamically generated text textures to prevent leaks
- **Mobile viewport**: see "Screen zooms in" in [4.9](#49-known-pitfalls)

### 4.9 Known Pitfalls

Hard-won lessons — don't step on them again.

| Pitfall | Symptom | Correct approach |
|---|---|---|
| **Phaser scene-switch queue** | Calling `scene.start()` inside a `pointerdown` callback leaves the new scene stuck in RUNNING but unreachable | Always use `SceneFlow.goTo()`, which defers via `requestAnimationFrame` |
| **iOS first-load screen zoom** | Screen appears stretched/enlarged on first load; fixed only by refreshing | Width from `innerWidth`; height from the smaller of `innerHeight` and `visualViewport.height`; calibrate twice after startup |
| **Boot load interrupted** | Scene hangs forever on `LOADING…` | Never call `game.scale.resize()` while Boot is loading — it aborts the load pipeline |
| **Two tweens fighting one property** | Two tweens animate the same `alpha`; the later one overwrites the former and animation freezes | Split into two separate objects, each controlling its own property |
| **Background-tab rAF throttling** | While debugging, `loop.frame` stays at 0, scenes don't advance, `delayedCall` never fires | Not a bug. Use `Page.bringToFront` + `Emulation.setFocusEmulationEnabled` when debugging |
| **`100vw` includes scrollbar width** | Canvas stretched by a few pixels | Use `100%` in CSS, not `100vw` |
| **`pixelArt: true` affects new textures** | White speckles around non-pixel art (e.g. the logo) | Set `magFilter`/`minFilter` to LINEAR explicitly at load time |

---

## 5. Contributing

1. Fork and branch: `git checkout -b feat/your-feature`
2. Make your changes
3. **Run `npm run verify`** — it must be all green
4. Commit: `git commit -m "feat: what you did"`
5. Push and open a Pull Request

Prefix commit messages with `feat:` / `fix:` / `perf:` / `docs:` / `deploy:`.

When changing balance numbers, please explain the reasoning and include measured data (which stage, how many minutes, which stats).

---

## 6. Copyright & Disclaimer

This project is **for learning and technical exchange only**, with no commercial use.

- Pokémon names, artwork, and move names are the property of **Nintendo / Creatures Inc. / GAME FREAK inc.**
- Gameplay is inspired by *Vampire Survivors* (poncle)
- This project's code is released under the MIT license, **excluding all third-party intellectual property above**

If you are a rights holder and believe this project infringes on your rights, please reach out and it will be removed.

---

<div align="right">

[⬆ Back to top](#poke-survivor) · [简体中文 →](README.md)

</div>
