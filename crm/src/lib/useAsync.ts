import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './format'

type State<T> = { data: T | null; error: string | null; loading: boolean }

/**
 * Загружает данные через load() и перезагружает, когда меняется load
 * (оборачивайте её в useCallback) или вызван reload().
 */
export function useAsync<T>(load: () => Promise<T>) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    load().then(
      (data) => {
        if (alive) setState({ data, error: null, loading: false })
      },
      (e) => {
        if (alive) setState((s) => ({ ...s, error: errorMessage(e), loading: false }))
      },
    )
    return () => {
      alive = false
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { ...state, reload }
}
