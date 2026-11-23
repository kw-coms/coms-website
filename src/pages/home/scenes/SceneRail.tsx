import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { onSceneFrame } from '../../../hooks/useSceneProgress'

export type RailItem = { id: string; label: string }

// Keep the chapter index behind a single button and highlight the scene on screen.
export default function SceneRail({ items, calm }: { items: RailItem[]; calm: boolean }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  const [open, setOpen] = useState(false)
  const nav = useRef<HTMLElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const listId = useId()
  const key = items.map((item) => item.id).join('|')

  useEffect(() => {
    // A scene is current while it holds the middle of the screen: the last scene whose top edge
    // has passed the middle line. Measured on scroll rather than by observing, so a tall (pinned)
    // scene and a fast scroll in either direction both resolve to the scene actually under the line.
    // It reads in the scene hook's shared per-frame pass and writes after all the reads.
    const ids = key.split('|')
    return onSceneFrame(() => {
      const middle = window.innerHeight / 2
      let current = ids[0]
      let fill = 0
      for (const id of ids) {
        const el = document.getElementById(id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.top <= middle) {
          current = id
          // How far the middle line has travelled through this scene.
          fill = Math.min(1, Math.max(0, (middle - r.top) / Math.max(1, r.height)))
        }
      }
      return () => {
        nav.current?.style.setProperty('--rail-p', fill.toFixed(3))
        setActive(current)
      }
    })
  }, [key])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !nav.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }

  const go = (id: string) => {
    close()
    document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'instant' : 'smooth', block: 'start' })
  }

  return (
    <nav ref={nav} className="scene-rail" aria-label="장면 이동" onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return
      event.stopPropagation()
      close()
    }}>
      <button ref={trigger} type="button" className="scene-rail__trigger" aria-controls={listId}
        aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        홈 목차 <ChevronDown size={16} aria-hidden="true" />
      </button>
      <ol id={listId} hidden={!open}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => go(item.id)}
              aria-label={item.label}
              aria-current={active === item.id ? 'true' : undefined}
              className="scene-rail__item"
            >
              <span className="scene-rail__name">{item.label}</span>
              <span className="scene-rail__fill" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
