import { request, requestNoContent } from './apiClient'

// Backend push is Firebase Cloud Messaging: a device registers one opaque FCM
// token string (max 1024) against the logged-in member. There is intentionally
// no unregister endpoint — the server prunes tokens FCM reports as stale.
export interface PushTokenRegistration {
  token: string
  platform?: string
  deviceId?: string
}

export async function registerPushToken(registration: PushTokenRegistration): Promise<void> {
  return requestNoContent('/api/mobile/v1/push-tokens', {
    method: 'POST',
    body: JSON.stringify(registration),
  })
}

export interface MobileAppConfig {
  minimumSupportedVersion?: string
  latestVersion?: string
  updateUrl?: string
  maintenanceMessage?: string
  pushEnabled?: boolean
}

export async function getMobileAppConfig(): Promise<MobileAppConfig> {
  return request('/api/mobile/v1/app-config')
}
