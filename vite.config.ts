import { defineConfig } from 'vite';

// 构建 ID：主菜单左下角显示，用来确认手机跑的是不是最新版本
const BUILD_ID = new Date().toISOString().slice(5, 16).replace('T', ' ');

export default defineConfig({
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    open: false,
  },
});
