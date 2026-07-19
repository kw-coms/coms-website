import { getMobileAppConfig, registerPushToken } from './pushApi'

// Web push wiring for the Firebase Cloud Messaging backend.
//
// The browser can only produce an FCM registration token (the one shape the
// backend's POST /api/mobile/v1/push-tokens accepts) through the Firebase Web
// SDK, which needs a Firebase web app config plus a Web Push VAPID key. The
// backend supplies neither, so those values must arrive out-of-band via build
// env. When any are absent the whole feature is treated as unavailable and the
// UI hides itself — nothing here runs, and no Firebase code is loaded.

export interface FirebasePushConfig {
  apiKey: string
  projectId: string
  appId: string
  messagingSenderId: string
  vapidKey: string
}

const DEVICE_ID_STORAGE_KEY = 'coms.push.deviceId'

function readEnv(key: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function getFirebasePushConfig(): FirebasePushConfig | null {
  const config: FirebasePushConfig = {
    apiKey: readEnv('VITE_FIREBASE_API_KEY'),
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
    appId: readEnv('VITE_FIREBASE_APP_ID'),
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    vapidKey: readEnv('VITE_FIREBASE_VAPID_KEY'),
  }
  const complete = Object.values(config).every((entry) => entry.length > 0)
  return complete ? config : null
}

// True only when the browser can run push AND the Firebase web config is
// present. Callers gate the entire UI on this so an unconfigured deploy shows
// nothing rather than a dead toggle.
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'PushManager' in window
  )
}

export function isPushConfigured(): boolean {
  return getFirebasePushConfig() !== null
}

export function isPushAvailable(): boolean {
  return isPushSupported() && isPushConfigured()
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported'

export function getPushPermission(): PushPermission {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}

// The backend has no per-device unregister endpoint, so a stable client id lets
// re-subscribes upsert the same row instead of accumulating token rows.
function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (existing) return existing
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated)
    return generated
  } catch {
    return 'web'
  }
}

// Loaded lazily and only when config is present, so the Firebase SDK never
// enters the default bundle and an unconfigured build never resolves it. The
// variable specifier plus the vite-ignore hint keep the bundler from trying to
// pre-resolve a dependency that an unconfigured project has not installed.
async function acquireFcmToken(config: FirebasePushConfig): Promise<string> {
  const appModuleSpecifier = 'firebase/app'
  const messagingModuleSpecifier = 'firebase/messaging'
  const [appModule, messagingModule] = await Promise.all([
    import(/* @vite-ignore */ appModuleSpecifier),
    import(/* @vite-ignore */ messagingModuleSpecifier),
  ])
  const { initializeApp, getApps, getApp } = appModule
  const { getMessaging, getToken } = messagingModule

  const app = getApps().length > 0 ? getApp() : initializeApp(config)
  const messaging = getMessaging(app)
  const registration = await navigator.serviceWorker.ready
  const token = await getToken(messaging, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: registration,
  })
  if (!token) throw new Error('푸시 토큰을 발급받지 못했습니다.')
  return token
}

export type PushSubscribeResult =
  | { status: 'subscribed' }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }

// Must be invoked from an explicit user gesture — Notification.requestPermission
// only resolves to a real prompt inside one. Never call this on load.
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  const config = getFirebasePushConfig()
  if (!isPushSupported() || !config) return { status: 'unavailable' }

  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch {
    return { status: 'unavailable' }
  }
  if (permission !== 'granted') return { status: 'denied' }

  try {
    const token = await acquireFcmToken(config)
    await registerPushToken({ token, platform: 'web', deviceId: getDeviceId() })
    return { status: 'subscribed' }
  } catch (err) {
    const message = err instanceof Error ? err.message : '푸시 알림을 켜지 못했습니다.'
    return { status: 'error', message }
  }
}

// Best-effort local teardown. The backend keeps the token (no unregister
// endpoint) but deleting the FCM token stops delivery to this browser.
export async function unsubscribeFromPush(): Promise<void> {
  const config = getFirebasePushConfig()
  if (!config) return
  try {
    const messagingModuleSpecifier = 'firebase/messaging'
    const messagingModule = await import(/* @vite-ignore */ messagingModuleSpecifier)
    const appModuleSpecifier = 'firebase/app'
    const appModule = await import(/* @vite-ignore */ appModuleSpecifier)
    const { getApps, getApp } = appModule
    const { getMessaging, deleteToken } = messagingModule
    if (getApps().length === 0) return
    await deleteToken(getMessaging(getApp()))
  } catch {
    // Nothing actionable — the local token is gone or was never issued.
  }
}

// Secondary server-side gate: even a client-configured build should hide push
// when ops has not turned it on. Resilient — availability failing closed means
// the caller simply keeps the feature hidden.
export async function isPushEnabledOnServer(): Promise<boolean> {
  try {
    const config = await getMobileAppConfig()
    return config.pushEnabled !== false
  } catch {
    return false
  }
}
