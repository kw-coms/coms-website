import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/lab/',
  plugins: [react()],
  // LAB_IGNORE_CORE=1: another lane is editing src/core; skip HMR reloads while iterating on the UI
  server: { watch: process.env.LAB_IGNORE_CORE ? { ignored: ['**/src/core/**', '**/compiler/**'] } : undefined, proxy: { '/lab/api': { target: process.env.LAB_COMPILE_URL ?? 'http://127.0.0.1:8787', changeOrigin: true } } },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
