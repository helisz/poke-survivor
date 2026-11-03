// 把 dist 产物铺到仓库根，供 CloudBase 静态托管直接部署
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 部署形态：仓库根目录 = 线上静态站点。
 *
 * 坑（踩过一次，排查了很久）：根目录 index.html 的 `<script src>` 一旦写死
 * 文件名，vite 按内容 hash 生成新名字后没有任何代码去改这一行 —— build、
 * publish、部署全绿，线上却一直是老代码。
 *
 * 现在：源码 index.html 固定写 `/src/main.ts`（vite 靠它找入口），
 * publish 把 dist/index.html 里真实的 hash 文件名回写进根 index.html。
 * 注意本文件是 .mjs，不要写 TS 类型注解。
 */

const dist = 'dist';
const root = '.';

/** 匹配 html 里的入口 script 标签（整行） */
const ENTRY_TAG_RE = /<script type="module"[^>]*src="[^"]*"[^>]*><\/script>/;
/** 只匹配 src 值，方便替换 */
const ENTRY_SRC_RE = /(<script type="module"[^>]*\ssrc=")([^"]*)(")/;

// 1. 铺产物（这一步会把 dist/index.html 覆盖到根目录）
for (const name of await readdir(dist)) {
  await cp(join(dist, name), join(root, name), { recursive: true, force: true });
  console.log('copied', name);
}

// 2. 校正根 index.html 的入口引用
const builtHtml = await readFile(join(dist, 'index.html'), 'utf8');
const builtSrc = builtHtml.match(ENTRY_SRC_RE)?.[2];
if (!builtSrc) {
  console.error('[publish] dist/index.html 里找不到入口 script，中止');
  process.exit(1);
}

const rootHtmlPath = join(root, 'index.html');
const rootHtml = await readFile(rootHtmlPath, 'utf8');
const currentSrc = rootHtml.match(ENTRY_SRC_RE)?.[2];

if (currentSrc === builtSrc) {
  console.log('index.html 入口已是最新:', builtSrc);
} else if (currentSrc) {
  // 引用了旧名字（典型场景：只跑过 build，没跑过 publish）
  await writeFile(rootHtmlPath, rootHtml.replace(ENTRY_SRC_RE, `$1${builtSrc}$3`));
  console.log(`index.html 入口修正: ${currentSrc} → ${builtSrc}`);
} else {
  await writeFile(rootHtmlPath, rootHtml.replace('</head>', `  ${builtSrc}\n  </head>`));
  console.log('index.html 入口补写:', builtSrc);
}

console.log('done — 请 git add -A && git commit && git push');
