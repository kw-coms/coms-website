import { cssVars } from './cssVars'
import { MOODS } from './moods'

// Each scene has its own mood colour (cinema-core.css defines --mood-0..5); its backdrop washes from
// the previous scene's mood into its own and on towards the next one's.
type Props = { numeral: number; variant: keyof typeof MOODS; prev: keyof typeof MOODS; next?: keyof typeof MOODS }

/** Decorative layers behind a scene: colour wash, two glows, a texture and a giant outlined numeral. */
export default function Backdrop({ numeral, variant, prev, next }: Props) {
  const style = cssVars({
    '--m-prev': `var(--mood-${MOODS[prev]})`,
    '--m-me': `var(--mood-${MOODS[variant]})`,
    '--m-next': `var(--mood-${MOODS[next ?? variant]})`,
  })
  return (
    <div className={`scene-bg scene-bg--${variant}`} style={style} aria-hidden="true">
      <span className="scene-bg__wash" />
      <span className="scene-bg__glow scene-bg__glow--a" />
      <span className="scene-bg__glow scene-bg__glow--b" />
      <span className="scene-bg__tex" />
      <span className="scene-bg__numeral" data-n={String(numeral).padStart(2, '0')} />
    </div>
  )
}
