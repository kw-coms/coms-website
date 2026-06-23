// Lazy Sentry init — keeps the dependency optional and out of the unit-test path.
// Mirrors coms-member-app/src/services/observability.js so the two projects
// stay consistent in how they report errors.
let initialized = false

function pickDsn() {
  if (typeof import.meta === 'undefined' || !import.meta.env) return ''
  return import.meta.env.VITE_SENTRY_DSN || ''
}

function pickEnvironment() {
  if (typeof import.meta === 'undefined' || !import.meta.env) return 'development'
  return import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE || 'production'
}

export async function initObservability({ release }: any = {}) {
  if (initialized) return
  const dsn = pickDsn()
  if (!dsn) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn,
      environment: pickEnvironment(),
      release,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    })
    initialized = true
  } catch (error) {
    console.warn('Sentry init skipped', error)
  }
}

export async function captureError(error, context = {}) {
  if (!initialized) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.captureException(error, { extra: context })
  } catch {
    // swallow — observability must never break the app
  }
}

export async function setUserContext(user) {
  if (!initialized) return
  try {
    const Sentry = await import('@sentry/react')
    if (!user) {
      Sentry.setUser(null)
      return
    }
    Sentry.setUser({
      id: String(user.id || user.studentId || 'member'),
      username: user.name || undefined,
    })
  } catch {
    // ignore
  }
}
