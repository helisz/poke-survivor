/**
 * 记分系统。
 *
 * 评分规则（以用户最新口径为准）：
 *   1. 本关时间越往后，每只怪分越高
 *   2. 精英 < 小 BOSS < 终局 BOSS
 *   3. **关卡倍率全部相等** —— 第 1 关和第 6 关同分，不按关数上调。
 *      早前「关数越高分越高」的要求已被这条覆盖。
 *
 * 公式：分数 = 类型基础分 × 时间倍率
 *
 * 普通怪基础分压到 3：一局实际刷出约 1600 只、击杀约 1100 只，
 * 给 10 分的话普通怪一项就吃掉总分的 60%+，精英和 BOSS 的分差
 * 被彻底淹没。压到 3 分后普通怪约占 35%，其余靠精英/BOSS/通关奖励，
 * 这样「杀大怪」才有正反馈。
 */

/** 怪物类型。和 EnemySystem.spawn 的 kind 对齐。 */
export type ScoreKind = 'normal' | 'elite' | 'miniboss' | 'finalboss';

/** 类型基础分 */
export const SCORE_BASE: Record<ScoreKind, number> = {
  normal: 3,
  elite: 60,
  miniboss: 250,
  finalboss: 1200,
};

/** 一局时长（秒）。和 stats.ts 的 RUN_SECONDS 保持一致。 */
export const SCORE_RUN_SECONDS = 300;

/**
 * 关卡倍率 —— 恒为 1。
 *
 * 保留函数而不是删掉调用点，是为了以后想重新按关数加权时改一处即可。
 * 当前口径：所有关同分。
 */
export function stageScoreMul(_stage: number): number {
  return 1;
}

/** 时间倍率：开局 1.0，满 5 分钟 2.2，线性。 */
export function timeScoreMul(elapsedSec: number): number {
  const t = Math.max(0, Math.min(elapsedSec, SCORE_RUN_SECONDS));
  return 1 + 1.2 * (t / SCORE_RUN_SECONDS);
}

/** 单只怪得分（已取整，保证显示的累计分和逐笔相加一致） */
export function killScore(kind: ScoreKind, stage: number, elapsedSec: number): number {
  return Math.round(SCORE_BASE[kind] * stageScoreMul(stage) * timeScoreMul(elapsedSec));
}

/** 通关奖励分（只在击杀终局 BOSS 并过关时给一次） */
export const CLEAR_BONUS = 5000;

export function clearBonus(stage: number): number {
  return Math.round(CLEAR_BONUS * stageScoreMul(stage));
}

/** 千分位，UI 用 */
export function formatScore(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
