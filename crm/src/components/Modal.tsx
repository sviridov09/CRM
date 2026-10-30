import { useEffect, useRef, type ReactNode } from 'react'

type Props = {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Модальное окно на нативном <dialog>: Esc и фокус работают из коробки. */
export function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  // Без close() в cleanup: StrictMode в dev прогоняет эффект дважды, close() шлёт
  // событие close → onClose, и окно сразу закрывается. При размонтировании
  // <dialog> и так удаляется из DOM вместе с модальным слоем.
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {children}
    </dialog>
  )
}
