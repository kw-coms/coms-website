// Lazy Sentry init — keeps the dependency optional and out of the unit-test path.
// Mirrors coms-member-app/src/services/observability.js so the two projects
// stay consistent in how they report errors.
let initialized = false

// Only the three functions we actually call are kept, and they are destructured
// straight off the dynamic import so the bundler can drop the rest of the SDK's
// re-exports (session replay, the feedback widget, the router integrations).
// Reaching for a `Sentry.` namespace instead pins the whole package.
let sentry: {
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void
  setUser: (user: { id: string } | null) => void
} | null = null

function pickDsn() {
  if (typeof import.meta === 'undefined' || !import.meta.env) return ''
  return import.meta.env.VITE_SENTRY_DSN || ''
}

function pickEnvironment() {
  if (typeof import.meta === 'undefined' || !import.meta.env) return 'development'
  return import.meta.env.VITE_SENTRY_ENV || import.meta.env.MODE || 'production'
}

export async function initObservability({ release }: { release?: string } = {}) {
  if (initialized) return
  const dsn = pickDsn()
  if (!dsn) return
  try {
    const { init, captureException, setUser } = await import('@sentry/react')
    init({
      dsn,
      environment: pickEnvironment(),
      release,
      tracesSampleRate: 0.1,
    })
    sentry = { captureException, setUser }
    initialized = true
  } catch (error) {
    console.warn('Sentry init skipped', error)
  }
}

export async function captureError(error, context = {}) {
  if (!sentry) return
  try {
    sentry.captureException(error, { extra: context })
  } catch {
    // swallow — observability must never break the app
  }
}

export async function setUserContext(user) {
  if (!sentry) return
  try {
    if (!user) {
      sentry.setUser(null)
      return
    }
    // Sentry is a third-party processor: send ONLY the opaque internal id. The
    // member's real name and 학번 are personal data and must never leave the app —
    // an id is enough to correlate an error with a member in our own DB.
    if (!user.id) {
      sentry.setUser(null)
      return
    }
    sentry.setUser({ id: String(user.id) })
  } catch {
    // ignore
  }
}
