import { cssVars } from './cssVars'

/** The standard divider carries a short scroll-driven signal. The alternate themes keep their text strip. */
export default function Divider({ name, dir }: { name: string; dir: 1 | -1 }) {
  const text = Array.from({ length: 6 }, () => name).join('   —   ')
  return (
    <div className="scene-divider" data-scene="divider" data-chapter-divider aria-hidden="true" style={cssVars({ '--dir': dir })}>
      <span className="scene-divider__text" data-t={text} />
      <span className="scene-divider__signal" />
    </div>
  )
}
