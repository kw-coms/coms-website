import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { initialSettingsOpen, readSettingsOpen, writeSettingsOpen } from '../../utils/settingsSections'

const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * A native <details> section: open by default on desktop, remembers the member's choice, and opens for its #anchor.
 * `needsAction` (a short label such as 미인증) opens it on first render and shows the label in the summary line.
 */
export default function SettingsSection({ id, title, children, needsAction = '' }: { id: string; title: string; children: ReactNode; needsAction?: string }) {
  const ref = useRef<HTMLDetailsElement>(null)
  // Only the first value is passed to <details>: the browser owns the open state afterwards, so a
  // re-render can never fight the member's click.
  const [initialOpen] = useState(() => Boolean(needsAction) || initialSettingsOpen(
    id,
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DESKTOP_QUERY).matches,
    readSettingsOpen(),
  ))

  useEffect(() => {
    const openForHash = () => {
      if (window.location.hash !== `#${id}`) return
      if (ref.current) ref.current.open = true
      // Wait a frame so the section is expanded before scrolling to it.
      window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
    }
    openForHash()
    window.addEventListener('hashchange', openForHash)
    return () => window.removeEventListener('hashchange', openForHash)
  }, [id])

  return (
    <details
      id={id}
      ref={ref}
      open={initialOpen}
      className="group mt-4 scroll-mt-24"
    >
      <summary
        // The click runs before the browser flips the state; Enter and Space reach here too.
        onClick={() => writeSettingsOpen(id, !ref.current?.open)}
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 py-2 text-lg font-bold text-[var(--app-text)] marker:content-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--app-accent)] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          {title}
          {needsAction && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">{needsAction}</span>}
        </span>
        <ChevronDown size={18} aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 pt-1">{children}</div>
    </details>
  )
}
