import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { onSceneFrame } from '../../../hooks/useSceneProgress'
import { cssVars } from './cssVars'

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
  const activeLabel = items.find((item) => item.id === active)?.label

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
        aria-label="홈 목차" aria-describedby={currentId} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="scene-rail__caption">홈 목차 <ChevronDown size={13} aria-hidden="true" /></span>
        <span id={currentId} className="scene-rail__current">{activeLabel}</span>
      </button>
      <div className="scene-rail__progress" role="progressbar" aria-label="홈 스크롤 진행률" aria-valuenow={progress}
        style={cssVars({ '--rail-page-progress': progress / 100 })}>
        <span className="scene-rail__progress-track" aria-hidden="true" />
        <span>{progress}%</span>
      </div>
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
