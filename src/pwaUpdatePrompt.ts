import { showToast } from './components/common/Toast'

// With registerType:'prompt', a new deploy installs a waiting service worker and
// fires onNeedRefresh instead of silently swapping assets mid-session (which
// could break lazy-loaded chunks). The toast lets the user apply it when ready.
export function setupPwaUpdatePrompt() {
  if (import.meta.env.DEV) return
  import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          showToast({
            message: '새 버전이 준비되었습니다.',
            duration: 0,
            action: { label: '새로고침', onClick: () => updateSW(true) },
          })
        },
      })
    })
    .catch(() => {
      // PWA disabled (e2e builds) or unsupported browser — nothing to do.
    })
}
