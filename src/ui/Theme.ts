/**
 * 全局 UI 色板。
 *
 * 主色调为金色（品牌色），用于所有「非属性」的通用按钮与界面元素：
 * 主按钮、次级按钮、卡片描边、面板底色、开发者菜单、结算页等。
 *
 * 例外规则：凡是为「宝可梦属性」服务的颜色，一律用属性本色，
 * 不要套金色 —— 例如技能属性标签、招式类型色、特性强调色。
 * 见 TYPE_COLORS / ACCENT / TraitIcons。
 *
 * 之前这些值硬编码散落在 10 个场景文件里（67 处），改一次主题要枪扫全仓，
 * 现在统一收敛到这里。
 */

/** 十六进制数字 → CSS 字符串，写 Text 的 color 时用 */
export const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

export const UI = {
  /** 主按钮填充（亮金） */
  primary: 0xd9a730,
  /** 主按钮悬停 / 高亮描边（浅金） */
  primaryLight: 0xf0c85a,
  /** 主按钮描边 */
  primaryStroke: 0xe8bb4a,
  /** 次级按钮填充 */
  secondary: 0x2a2216,
  /** 次级按钮悬停 */
  secondaryHover: 0x3a2f1c,
  /** 次级按钮描边 */
  secondaryStroke: 0x6b5a2e,

  /** 卡片 / 面板底色 */
  card: 0x1c1810,
  /** 卡片选中态底色 */
  cardOn: 0x2a2314,
  /** 卡片描边（未选中） */
  cardStroke: 0x39301c,
  /** 卡片描边（悬停） */
  cardStrokeHover: 0x5c4d26,

  /** 主按钮上的深色文字（压在亮金上） */
  onPrimary: 0x1a1408,
  /** 禁用 / 不可用填充 */
  disabled: 0x3a3327,
  /** 禁用描边 */
  disabledStroke: 0x4a4230,
} as const;

/** 通用金色文字（标题副标、提示等） */
export const TEXT = {
  /** 正文白 */
  main: '#ffffff',
  /** 次要灰 */
  dim: '#8fa8b8',
  /** 金色强调文字 */
  gold: '#f0c85a',
  /** 金色暗调 */
  goldDim: '#d9a730',
  /** 主按钮上的深色字 */
  onPrimary: '#1a1408',
  /** 禁用文字 */
  off: '#6b6045',
} as const;
