// Service worker CRM: установка на главный экран и Web Push.
// Ничего не кэшируем: CRM работает только с сетью, а кэш мог бы показать старую версию.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Время события в поясе бригадира: функция send-push работает в UTC и ставит заглушку {{at}}
function formatAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  return d.toLocaleString(undefined, {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  })
}

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const body = String(data.body || '').replace('{{at}}', formatAt(data.at))
  event.waitUntil(
    self.registration.showNotification(data.title || 'Field CRM', {
      body,
      tag: data.tag, // повтор по той же задаче заменяет прошлое уведомление, а не копится
      renotify: Boolean(data.tag),
      icon: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

// Клик — открыть CRM на нужной задаче: в уже открытой вкладке, если есть
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus()
          if ('navigate' in client) await client.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
