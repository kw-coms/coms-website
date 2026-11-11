// With registerType:'autoUpdate', a new deploy activates as soon as the service
// worker installs (the plugin forces skipWaiting + clientsClaim) — no user prompt.
// If the swap purges an old lazy chunk a stale tab still needs, Vite fires
// 'vite:preloadError' on the failed dynamic import; try reloading once per build.
const PRELOAD_RECOVERY_KEY = 'kwcoms-preload-recovery:v1'

export function setupPwaAutoUpdate() {
  if (import.meta.env.DEV) return
  window.addEventListener('vite:preloadError', (event) => {
    try {
      // The hashed entry URL survives reloads in storage, even if the SW serves the same broken build.
      if (window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) === import.meta.url) return
      window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, import.meta.url)
    } catch {
      // Without persistent storage, leave the error visible instead of risking another reload loop.
      return
    }
    event.preventDefault()
    window.location.reload()
  })
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      registerSW({ immediate: true })
    })
    .catch(() => {
      // PWA disabled (e2e builds) or unsupported browser — nothing to do.
    })
}
