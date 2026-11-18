// Web Push для бригадира: подписка браузера → таблица push_subscriptions (миграция 0007),
// отправка — Edge Function send-push. Service worker регистрируется только в сборке (main.tsx),
// поэтому на localhost в режиме разработки push недоступен — проверять на Vercel.
import { supabase } from './supabase'

/** Публичный ключ VAPID — он и должен быть публичным. Приватный — в секретах Supabase (send-push). */
export const VAPID_PUBLIC_KEY = 'BIskEVb0lQErzPiWVUfXgccqiVwc_qVT5mFhJaSqf9WAxLZxuNNO3OerE-KyidYk8siLmGtE8rc7jf7KlLMJ1pU'

export type PushState =
  | 'on'
  | 'off'
  | 'denied' // заблокировано в настройках браузера
  | 'ios-install' // iPhone: push только у PWA с главного экрана (iOS 16.4+)
  | 'unsupported'

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined
  return navigator.serviceWorker.getRegistration()
}

export async function getPushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

async function saveSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

/** Включить: разрешение браузера (только по нажатию кнопки) → подписка → сохранить на сервере. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  await saveSubscription(sub)
  return 'on'
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
    await sub.unsubscribe()
  }
  return 'off'
}

/**
 * Подписка браузера уже есть — привязываем её к вошедшему бригадиру
 * (после входа под другим аккаунтом в том же браузере push пойдёт ему).
 */
export async function syncPush() {
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) await saveSubscription(sub)
}

/** Перед выходом: этот браузер больше не получает push за этого бригадира. Подписку браузера не трогаем. */
export async function forgetPushOnServer() {
  const sub = await (await registration())?.pushManager.getSubscription()
  if (sub) await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
}
