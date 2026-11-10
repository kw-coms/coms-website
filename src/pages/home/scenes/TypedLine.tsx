import { useEffect, useRef, useState } from 'react'
import { heroHighlights } from '../../../data/homeContent'
import { useCalm } from '../../../hooks/useCalm'

const items = heroHighlights.map((h) => ({ lead: `${h.label} ${h.value}`, detail: h.detail }))

// A monospace line under the opening copy that types the three highlights in turn. Screen readers
// get the three items once, as a plain list; the typing itself is hidden from them. Calm modes show
// the first item, finished.
export default function TypedLine() {
  const calm = useCalm()
  const [step, setStep] = useState({ i: 0, n: 0 })
  const box = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting))
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    // No timer while calm or off screen; the observer above restarts it.
    if (calm || !visible) return
    const full = (i: number) => items[i].lead.length + 3 + items[i].detail.length
    const timer = window.setTimeout(
      () => setStep((s) => (s.n < full(s.i) ? { i: s.i, n: s.n + 1 } : { i: (s.i + 1) % items.length, n: 0 })),
      step.n >= full(step.i) ? 2600 : step.n === 0 ? 400 : 38,
    )
    return () => window.clearTimeout(timer)
  }, [calm, visible, step])

  const { lead, detail } = items[calm ? 0 : step.i]
  const n = calm ? Infinity : step.n
  const shownLead = lead.slice(0, n)
  const shownDetail = n > lead.length + 3 ? detail.slice(0, n - lead.length - 3) : ''

  return (
    <div ref={box} className="scene-typed">
      <p className="scene-typed__line" aria-hidden="true">
        <b>{shownLead}</b>
        {n > lead.length ? <span>{' — '.slice(0, Math.min(3, n - lead.length))}</span> : null}
        <span>{shownDetail}</span>
        {!calm && <i className="scene-typed__caret" />}
      </p>
      <ul className="sr-only" aria-label="COM's의 활동">
        {items.map((item) => (
          <li key={item.lead}>{item.lead}. {item.detail}</li>
        ))}
      </ul>
    </div>
  )
}
