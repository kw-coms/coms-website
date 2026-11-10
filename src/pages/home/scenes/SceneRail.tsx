import { useEffect, useRef, useState } from 'react'

export type RailItem = { id: string; label: string }

// A thin index at the right edge (wide screens): where you are in the film and how much is left.
export default function SceneRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  const nav = useRef<HTMLElement | null>(null)
  const key = items.map((item) => item.id).join('|')

  useEffect(() => {
    // A scene is current while it holds the middle of the screen: the last scene whose top edge
    // has passed the middle line. Measured on scroll rather than by observing, so a tall (pinned)
    // scene and a fast scroll in either direction both resolve to the scene actually under the line.
    let raf = 0
    const measure = () => {
      raf = 0
      const middle = window.innerHeight / 2
      let current = key.split('|')[0]
      let fill = 0
      for (const id of key.split('|')) {
        const el = document.getElementById(id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.top <= middle) {
          current = id
          // How far the middle line has travelled through this scene.
          fill = Math.min(1, Math.max(0, (middle - r.top) / Math.max(1, r.height)))
        }
      }
      nav.current?.style.setProperty('--rail-p', fill.toFixed(3))
      setActive(current)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [key])

  const go = (id: string) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav ref={nav} className="scene-rail" aria-label="장면 이동">
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
              <span className="scene-rail__fill" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
