import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { compileOrigin } from './src/core/compile-origin.mjs';

export default defineConfig({
  base: '/lab/',
  plugins: [react()],
  // LAB_IGNORE_CORE=1: another lane is editing src/core; skip HMR reloads while iterating on the UI
  server: { watch: process.env.LAB_IGNORE_CORE ? { ignored: ['**/src/core/**', '**/compiler/**'] } : undefined, proxy: { '/lab/api': { target: compileOrigin(), changeOrigin: true } } },
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
