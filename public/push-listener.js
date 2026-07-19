// Push + notification-click handlers layered onto the Workbox-generated service
// worker via `workbox.importScripts` (see vite.config.js). This runs in the SW
// global scope as an additive layer — it never touches the precache/offline
// logic Workbox generates. Kept as plain JS since it is served verbatim from
// /public and is not part of the app bundle.

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (err) {
    payload = { body: event.data ? event.data.text() : '' }
  }

  // FCM delivers either a "notification" message ({ notification, data }) or a
  // raw data message; support both plus a flat shape.
  const content = payload.notification || payload
  const data = payload.data || {}
  const title = content.title || "COM's 알림"
  const options = {
    body: content.body || '',
    icon: content.icon || '/coms-logo.png',
    badge: content.badge || '/favicon.svg',
    tag: content.tag || data.tag || undefined,
    data: { url: data.url || data.link || content.url || '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clientList) {
        const clientPath = new URL(client.url).pathname
        if ((clientPath === targetUrl || client.url.endsWith(targetUrl)) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
      return undefined
    })(),
  )
})
