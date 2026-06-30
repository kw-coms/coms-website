import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'))

// Source maps are uploaded to Sentry only when SENTRY_AUTH_TOKEN is present
// (set in CI / the Docker build). Without it the plugin is omitted entirely,
// so normal/dev builds are never broken and nothing is uploaded.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN
const sentryPlugins = sentryAuthToken
  ? [
      sentryVitePlugin({
        org: process.env.SENTRY_ORG || 'kw-coms',
        project: process.env.SENTRY_PROJECT || 'coms-website',
        authToken: sentryAuthToken,
        // Delete .map files from dist after upload so they are never served publicly.
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      }),
    ]
  : []

// The bundle visualizer is opt-in: it only runs when ANALYZE is set (e.g.
// `ANALYZE=1 npm run build`), writing a treemap to dist/stats.html. Normal and
// dev builds never load it, so the default build is untouched.
const analyzePlugins = process.env.ANALYZE
  ? [
      visualizer({
        filename: './dist/stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }),
    ]
  : []

// Installable PWA + offline app shell. Conservative config:
//  - autoUpdate so a new deploy activates on the next visit (no stale-stuck SW)
//  - manifest:false — we ship our own public/manifest.webmanifest, already linked
//  - API + bot share routes are NEVER served the cached SPA shell (always network)
//  - disabled in dev so it never interferes with the dev server
const pwaPlugin = VitePWA({
  // A service worker intercepts requests in headless Playwright and is hard to
  // reason about in e2e; disable it for test builds (PWA_DISABLE=1). The SW is an
  // additive layer over identical app logic, so smoke coverage is unaffected.
  disable: process.env.PWA_DISABLE === '1',
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  manifest: false,
  includeAssets: ['favicon.svg', 'coms-logo.png'],
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//, /\/(share|share-data|share-image)$/],
    // Don't precache giant rarely-used author/editor chunks into the install.
    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
  },
  devOptions: { enabled: false },
})

export default defineConfig({
  // sentryVitePlugin must come AFTER react/tailwind so it sees the final build output.
  plugins: [react(), tailwindcss(), pwaPlugin, ...sentryPlugins, ...analyzePlugins],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },

  build: {
    // Only emit source maps when uploading to Sentry, and use 'hidden' so no
    // sourceMappingURL comment is written into the bundles — the maps are never
    // publicly discoverable, and the plugin deletes them from dist after upload.
    sourcemap: sentryAuthToken ? 'hidden' : false,
    rollupOptions: {
      output: {
        // Split heavy vendors into their own long-cached chunks so they
        // parallelize and survive app-code redeploys. ponytail: coarse grouping
        // by package, finer splits only if a chunk actually gets too big.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('@sentry')) return 'vendor-sentry'
          if (id.includes('dompurify')) return 'vendor-dompurify'
          if (id.includes('@tanstack')) return 'vendor-query'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) return 'vendor-react'
        },
      },
    },
  },

  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})