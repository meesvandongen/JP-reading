import type { ComponentChildren } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Icon } from './Icon'

/** Bottom sheet on phones, side panel on wide screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  class: cls = '',
}: {
  open: boolean
  onClose: () => void
  title?: ComponentChildren
  children: ComponentChildren
  class?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <div
        class={`sheet ${cls}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="sheet-handle" />
        <div class="sheet-head">
          <div class="sheet-title">{title}</div>
          <button class="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  )
}
