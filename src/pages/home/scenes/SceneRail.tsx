import { useEffect, useState } from 'react'

export type RailItem = { id: string; label: string }

// A thin index at the right edge (wide screens): where you are in the film and how much is left.
export default function SceneRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  const key = items.map((item) => item.id).join('|')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    // A scene counts as current while it crosses the middle of the screen.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id)
        })
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    key.split('|').forEach((id) => {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [key])

  const go = (id: string) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav className="scene-rail" aria-label="장면 이동">
      <ol>
        {items.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => go(item.id)}
              aria-label={`${String(i + 1).padStart(2, '0')} ${item.label}`}
              aria-current={active === item.id ? 'true' : undefined}
              className="scene-rail__item"
            >
              <span className="scene-rail__num">{String(i + 1).padStart(2, '0')}</span>
              <span className="scene-rail__name">{item.label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
