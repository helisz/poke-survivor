/** 由 vite.config.ts 的 define 注入，主菜单底部显示，用于确认版本 */
declare const __BUILD_ID__: string;

/** 构建戳：迭代数 + 日期 + 时间戳 + tag */
declare const __BUILD_STAMP__: {
  iter: number;
  tag: string;
  iso: string;
  date: string;
  time: string;
  epoch: number;
};
