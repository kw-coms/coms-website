import { useEffect, useRef, useState, type ElementType } from 'react'
import { useCalm } from '../../../hooks/useCalm'
import { sectionMetrics } from '../../../data/homeContent'
import { cssVars } from './cssVars'

export type SceneActions = {
  primary: { label: string; onClick: () => void }
  secondary: { label: string; onClick?: () => void; href?: string }
}

/** The slate in the corner of a scene: "SCENE 02 · ABOUT". Text is kept in its own case; CSS sets it in capitals. */
export function Slate({ index, name }: { index: number; name: string }) {
  return (
    <p className="cine-hud scene-slate" data-cine>
      Scene {String(index).padStart(2, '0')} · {name}
    </p>
  )
}

/** A heading whose lines rise out of a mask. Lines break after a comma; otherwise it is one line. */
export function CineTitle({ text, className = '', as: Tag = 'h2' }: { text: string; className?: string; as?: ElementType }) {
  const lines = text.split(/(?<=,)\s+/)
  return (
    <Tag className={`cine-lines scene-title ${className}`}>
      {lines.map((line, i) => (
        <span key={line}>
          <span className="cine-m" style={cssVars({ '--i': i })}>
            <span>{line}</span>
          </span>
          {i < lines.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  )
}

/** The scene's actions, one solid and one quiet. */
export function SceneActionRow({ actions, className = '' }: { actions: SceneActions; className?: string }) {
  const { primary, secondary } = actions
  return (
    <div className={`scene-actions ${className}`} data-cine style={cssVars({ '--i': 3 })}>
      <button type="button" onClick={primary.onClick} className="apple-action-primary scene-btn">
        {primary.label}
      </button>
      {secondary.href ? (
        <a href={secondary.href} target="_blank" rel="noreferrer" className="apple-action-secondary scene-btn">
          {secondary.label}
        </a>
      ) : (
        <button type="button" onClick={secondary.onClick} className="apple-action-secondary scene-btn">
          {secondary.label}
        </button>
      )}
    </div>
  )
}

/** A figure made only of digits counts up from zero once it is on screen; the final value is what is read aloud. */
function CountUp({ value }: { value: string }) {
  const calm = useCalm()
  const [shown, setShown] = useState(value)
  const ref = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const el = ref.current
    // Calm (reduced motion or lite, also when it turns on while counting) shows the finished figure.
    if (calm || !el || typeof IntersectionObserver === 'undefined') {
      setShown(value)
      return
    }
    const target = Number(value)
    let raf = 0
    setShown('0'.repeat(value.length))
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      const t0 = performance.now()
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 1200)
        const eased = 1 - Math.pow(1 - k, 3)
        setShown(String(Math.round(target * eased)).padStart(value.length, '0'))
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [calm, value])
  return (
    <>
      <span ref={ref} aria-hidden="true">{shown}</span>
      <span className="sr-only">{value}</span>
    </>
  )
}

/** Three figures with a rule above each that draws itself. Digit-only figures count up; others fade in. */
export function SceneStats({ id }: { id: keyof typeof sectionMetrics }) {
  return (
    <dl className="scene-stats">
      {sectionMetrics[id].map((item, i) => (
        <div key={item.value} data-cine data-rule style={cssVars({ '--i': i })}>
          <dt>{/^\d+$/.test(item.value) ? <CountUp value={item.value} /> : item.value}</dt>
          <dd>{item.label}</dd>
        </div>
      ))}
    </dl>
  )
}
