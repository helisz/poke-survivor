/**
 * 开发者模式开关（会话级）
 *
 * 主页默认不显示齿轮。连点问号 5 次才把齿轮放出来。
 * 存在模块级变量里而不是 localStorage：刷新页面就回到"隐藏"状态，
 * 玩家不会因为一直带着开发面板而看穿游戏平衡。
 */
let taps = 0;
let revealed = false;

export function devTap() { taps += 1; }
export function devTaps() { return taps; }
export function devRevealed() { return revealed; }
export function setDevRevealed() { revealed = true; }
