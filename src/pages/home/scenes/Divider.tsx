import { cssVars } from './cssVars'

/** A band of very large outlined text between scenes. It slides sideways with the scroll. */
export default function Divider({ name, dir }: { name: string; dir: 1 | -1 }) {
  const text = Array.from({ length: 4 }, () => name).join('   —   ')
  return (
    <div className="scene-divider" data-scene="divider" aria-hidden="true" style={cssVars({ '--dir': dir })}>
      <span className="scene-divider__text" data-t={text} />
    </div>
  )
}
