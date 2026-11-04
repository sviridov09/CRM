// Минимальный service worker: установка на главный экран и основа для Web Push.
// Ничего не кэшируем: CRM работает только с сетью, а кэш мог бы показать старую версию.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
