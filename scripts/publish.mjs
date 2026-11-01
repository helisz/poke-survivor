// 把 dist 产物铺到仓库根，供 CloudBase 静态托管直接部署
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dist = 'dist';
const root = '.';
const keep = new Set(['node_modules', 'src', 'public', 'tests', 'supabase', '.git', '.github', 'scripts', 'dist']);

for (const name of await readdir(dist)) {
  await cp(join(dist, name), join(root, name), { recursive: true, force: true });
  console.log('copied', name);
}
console.log('done — 请 git add -A && git commit && git push');
