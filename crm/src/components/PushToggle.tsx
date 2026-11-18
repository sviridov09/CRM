import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorMessage } from '../lib/format'
import { disablePush, enablePush, getPushState, syncPush, type PushState } from '../lib/push'

/** Push-уведомления бригадиру: включить/выключить и понятное состояние. Разрешение — только по кнопке. */
export function PushToggle() {
  const { t } = useTranslation()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getPushState().then((s) => {
      setState(s)
      if (s === 'on') void syncPush().catch(() => undefined)
    })
  }, [])

  async function toggle(enable: boolean) {
    setBusy(true)
    setError(null)
    try {
      setState(enable ? await enablePush() : await disablePush())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null

  return (
    <div className="bell-push">
      {state === 'on' && (
        <>
          <span>{t('push.on')}</span>
          <button type="button" className="btn link" disabled={busy} onClick={() => void toggle(false)}>
            {t('push.turnOff')}
          </button>
        </>
      )}
      {state === 'off' && (
        <>
          <span className="muted">{t('push.offHint')}</span>
          <button type="button" className="btn small primary" disabled={busy} onClick={() => void toggle(true)}>
            {t('push.enable')}
          </button>
        </>
      )}
      {state === 'denied' && <span className="muted">{t('push.denied')}</span>}
      {state === 'ios-install' && <span className="muted">{t('push.iosInstall')}</span>}
      {state === 'unsupported' && <span className="muted">{t('push.unsupported')}</span>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
