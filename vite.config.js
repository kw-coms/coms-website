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
  // autoUpdate: a new deploy activates on the SW's next install check, no user
  // prompt. Stale tabs that lose a lazy chunk to the swap recover via the
  // vite:preloadError reload guard (src/pwaAutoUpdate.ts). Note: with
  // injectRegister:false the plugin does NOT force skipWaiting/clientsClaim,
  // so they are set explicitly in workbox below — all three must stay in sync.
  registerType: 'autoUpdate',
  injectRegister: false,
  manifest: false,
  includeAssets: ['favicon.svg', 'coms-logo.png'],
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
    // Layer push + notificationclick handlers onto the generated SW without
    // rewriting to injectManifest — the script is served verbatim from /public
    // and only adds event listeners, leaving the precache/offline logic intact.
    importScripts: ['/push-listener.js'],
    cleanupOutdatedCaches: true,
    skipWaiting: true,
    clientsClaim: true,
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [
      /^\/api\//,
      /\/(share|share-data|share-image)$/,
      // Sibling apps the host nginx serves under sub-paths of this origin.
      // Without these the SW hijacks their navigations and renders the SPA 404.
      /^\/(foodclub|gameclub|BugSnap|LogDoctor|PRDoctor|worldcup|tier|team-randomizer)(\/|$)/,
    ],
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
          // Anchor to /node_modules/<pkg>/: the unanchored '/react/' also matched
          // node_modules/@tiptap/react/, which dragged @tiptap/core and three
          // prosemirror-* packages (~85 KB gz of editor engine) into vendor-react —
          // a chunk index.html modulepreloads on every page, editor or not.
          // Deliberately NO manual group for tiptap/prosemirror: naming one makes
          // rolldown place react's own CJS module in it, which then makes that chunk
          // eager for the whole app. Left unassigned, the editor lands in the lazy
          // TiptapTextEditor chunk and is fetched only when someone opens an editor.
          if (id.includes('/node_modules/react-dom/') || id.includes('/node_modules/react/') || id.includes('/node_modules/scheduler/')) return 'vendor-react'
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