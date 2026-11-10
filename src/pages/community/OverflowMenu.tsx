import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Ellipsis } from 'lucide-react'

/** A "더보기" menu button: closes on Escape (focus returns to the button), outside click and choosing an item. */
export default function OverflowMenu({ items, className = '' }: {
  items: { label: string; icon?: ReactNode; onSelect: () => void }[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="더보기"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="apple-action-secondary flex size-12 items-center justify-center"
      >
        <Ellipsis size={18} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} role="menu" className="absolute right-0 z-20 mt-2 flex w-44 flex-col gap-1 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] p-1.5 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); item.onSelect() }}
              className="flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold hover:bg-[var(--app-surface-soft)]"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
