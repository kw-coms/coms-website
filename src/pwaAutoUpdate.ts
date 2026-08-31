// With registerType:'autoUpdate', a new deploy activates as soon as the service
// worker installs (the plugin forces skipWaiting + clientsClaim) — no user prompt.
// If the swap purges an old lazy chunk a stale tab still needs, Vite fires
// 'vite:preloadError' on the failed dynamic import; reloading picks up the new build.
export function setupPwaAutoUpdate() {
  if (import.meta.env.DEV) return
  window.addEventListener('vite:preloadError', () => window.location.reload())
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {
      // PWA disabled (e2e builds) or unsupported browser — nothing to do.
    })
}
