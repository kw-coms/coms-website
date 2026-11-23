import { useEffect, useId, useRef, useState } from 'react'
import { List } from 'lucide-react'
import { onSceneFrame } from '../../../hooks/useSceneProgress'

export type RailItem = { id: string; label: string }

// Show progress even when the chapter index is closed.
export default function SceneRail({ items, calm }: { items: RailItem[]; calm: boolean }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  const [progress, setProgress] = useState(0)
  const [open, setOpen] = useState(false)
  const nav = useRef<HTMLElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const listId = useId()
  const currentId = useId()
  const key = items.map((item) => item.id).join('|')
  const activeIndex = items.findIndex((item) => item.id === active)

  useEffect(() => {
    // A scene is current while it holds the middle of the screen: the last scene whose top edge
    // has passed the middle line. Measured on scroll rather than by observing, so a tall (pinned)
    // scene and a fast scroll in either direction both resolve to the scene actually under the line.
    // It reads in the scene hook's shared per-frame pass and writes after all the reads.
    const ids = key.split('|')
    return onSceneFrame(() => {
      if (!nav.current?.getClientRects().length) return
      const middle = window.innerHeight / 2
      const scroll = document.scrollingElement
      const distance = scroll ? scroll.scrollHeight - scroll.clientHeight : 0
      const progress = scroll && distance > 0
        ? Math.min(100, Math.max(0, Math.round((scroll.scrollTop / distance) * 100)))
        : 0
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
        setProgress(progress)
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

  const go = (id: string, fromMenu = false) => {
    if (fromMenu) close()
    else setOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: calm ? 'instant' : 'smooth', block: 'start' })
  }

  return (
    <nav ref={nav} className="scene-rail" aria-label="장면 이동" onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return
      event.stopPropagation()
      close()
    }}>
      <ol className="scene-rail__markers" aria-label="홈 구간 바로가기">
        {items.map((item, index) => (
          <li key={item.id}>
            <button
              type="button"
              className="scene-rail__marker"
              aria-label={item.label}
              aria-current={index === activeIndex ? 'true' : undefined}
              data-passed={index < activeIndex ? '' : undefined}
              onClick={() => go(item.id)}
            >
              <span aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <span id={currentId} className="sr-only">{items[activeIndex]?.label}</span>
      <div className="sr-only" role="progressbar" aria-label="홈 스크롤 진행률" aria-valuenow={progress} />
      <button ref={trigger} type="button" className="scene-rail__trigger" aria-controls={listId}
        aria-label="홈 목차" aria-describedby={currentId} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <List size={16} aria-hidden="true" />
      </button>
      <ol id={listId} className="scene-rail__menu" aria-label="홈 구간" hidden={!open}>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => go(item.id, true)}
              aria-label={item.label}
              aria-current={active === item.id ? 'true' : undefined}
              className="scene-rail__item"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
