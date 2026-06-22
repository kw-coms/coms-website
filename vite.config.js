import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'

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

export default defineConfig({
  // sentryVitePlugin must come AFTER react/tailwind so it sees the final build output.
  plugins: [react(), tailwindcss(), ...sentryPlugins, ...analyzePlugins],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '0.0.0'),
  },

  build: {
    // Only emit source maps when uploading to Sentry, and use 'hidden' so no
    // sourceMappingURL comment is written into the bundles — the maps are never
    // publicly discoverable, and the plugin deletes them from dist after upload.
    sourcemap: sentryAuthToken ? 'hidden' : false,
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