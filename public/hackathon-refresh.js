export async function refreshWorker(registration, serviceWorker = navigator.serviceWorker, timeoutMs = 10000) {
  const previous = registration.active
  let timer, next, onStateChange, onControllerChange
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('update timed out')), timeoutMs) })
  try {
    await Promise.race([registration.update(), timeout])
    next = registration.installing || registration.waiting || (registration.active !== previous ? registration.active : null)
    if (next && next !== previous && next.state !== 'activated') {
      await Promise.race([new Promise((resolve) => {
        onStateChange = () => {
          if (next.state !== 'activated') return
          resolve()
        }
        next.addEventListener('statechange', onStateChange)
        onStateChange()
      }), timeout])
    }
    if (next && serviceWorker.controller === previous) {
      await Promise.race([new Promise((resolve) => {
        onControllerChange = () => {
          if (serviceWorker.controller === next) resolve()
        }
        serviceWorker.addEventListener('controllerchange', onControllerChange)
        onControllerChange()
      }), timeout])
    }
  } finally {
    clearTimeout(timer)
    if (next && onStateChange) next.removeEventListener('statechange', onStateChange)
    if (onControllerChange) serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }
}

if (typeof document !== 'undefined') {
  const status = document.getElementById('status')
  const fallback = document.getElementById('fallback')
  async function open() {
    status.textContent = '평가 자료를 준비하고 있습니다.'
    fallback.hidden = true
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        if (registration) await refreshWorker(registration)
      }
      location.replace('/hackathon')
    } catch {
      status.textContent = '자료 준비가 지연되고 있습니다. 다시 시도해 주세요.'
      fallback.hidden = false
    }
  }
  document.getElementById('retry').addEventListener('click', open)
  open()
}
