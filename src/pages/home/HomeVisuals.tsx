import type { ReactNode } from 'react'
import {
  BookOpen,
  Check,
  Code2,
  FolderOpen,
  Lightbulb,
  Plus,
  Presentation,
  Rocket,
  User,
} from 'lucide-react'
import { getLogoAsset } from '../../utils/logoAssets'

/**
 * Artwork for the home sections. Every piece is decoration (aria-hidden) drawn with plain
 * elements and CSS in the site's one accent; the words in them are the section's own rows
 * from homeContent, so nothing here says anything the page does not already say.
 * Styles: styles/home-sections.css. Each piece rests in its finished state, so with reduced
 * motion (animations off) it is simply a still picture.
 */

type Panel = { title: string; subtitle: string; rows: string[] }

function Frame({ kind, title, subtitle, children }: { kind: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className={`coms-visual coms-visual-${kind}`} aria-hidden="true">
      <div className="coms-visual-bar">
        <span className="coms-visual-dots"><i /><i /><i /></span>
        <span className="coms-visual-name">{title}</span>
        <span className="coms-visual-sub">{subtitle}</span>
      </div>
      <div className="coms-visual-body">{children}</div>
    </div>
  )
}

/** About: the club as a small operating system, its three tracks running as processes. */
export function ClubOsVisual({ title, subtitle, rows }: Panel) {
  return (
    <Frame kind="os" title={title} subtitle={subtitle}>
      <div className="coms-os-core">
        <span className="coms-os-ring" />
        <span className="coms-os-ring coms-os-ring-2" />
        <span className="coms-os-tile">
          <img src={getLogoAsset('COMs_logo_vec')} alt="" className="coms-os-logo" />
        </span>
      </div>
      <ul className="coms-os-rows">
        {rows.map((row, index) => (
          <li key={row} style={{ '--i': index } as React.CSSProperties}>
            <span className="coms-os-led" />
            <span className="coms-os-name">{row}</span>
            <span className="coms-os-meter"><i /></span>
            <span className="coms-os-pid">{String(index + 1).padStart(2, '0')}</span>
          </li>
        ))}
      </ul>
    </Frame>
  )
}

/** Activities: three layers stacked on one another, the routine built up from the bottom. */
export function LearningStackVisual({ title, subtitle, rows }: Panel) {
  return (
    <Frame kind="stack" title={title} subtitle={subtitle}>
      <div className="coms-stack">
        {rows.map((row, index) => (
          <div key={row} className="coms-stack-layer" style={{ '--i': index, '--n': rows.length } as React.CSSProperties}>
            <span className="coms-stack-plate" />
            <span className="coms-stack-tag">
              <b>{String(index + 1).padStart(2, '0')}</b>
              {row}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

const PIPELINE_ICONS = [Lightbulb, Code2, Rocket]

/** Projects: an idea moving through the three stages, with a strip of work lighting up under it. */
export function ProjectLabVisual({ title, subtitle, rows }: Panel) {
  return (
    <Frame kind="lab" title={title} subtitle={subtitle}>
      <div className="coms-lab-line">
        {rows.map((row, index) => {
          const Icon = PIPELINE_ICONS[index % PIPELINE_ICONS.length]
          return (
            <div key={row} className="coms-lab-stage" style={{ '--i': index } as React.CSSProperties}>
              <span className="coms-lab-node"><Icon size={20} strokeWidth={2} /></span>
              <span className="coms-lab-name">{row}</span>
            </div>
          )
        })}
        <span className="coms-lab-track"><i /></span>
      </div>
      <div className="coms-lab-grid">
        {Array.from({ length: 36 }, (_, index) => (
          <i key={index} style={{ '--i': index, '--a': ((index * 53 + 17) % 100) / 100 } as React.CSSProperties} />
        ))}
      </div>
    </Frame>
  )
}

/** Recruit: the three steps of joining, checked off from the top. */
export function JoinFlowVisual({ title, subtitle, rows }: Panel) {
  return (
    <Frame kind="flow" title={title} subtitle={subtitle}>
      <ol className="coms-flow">
        {rows.map((row, index) => (
          <li key={row} style={{ '--i': index } as React.CSSProperties}>
            <span className="coms-flow-mark"><Check size={16} strokeWidth={3} /></span>
            <span className="coms-flow-name">{row}</span>
            <span className="coms-flow-step">STEP {index + 1}</span>
          </li>
        ))}
        <span className="coms-flow-track"><i /></span>
      </ol>
    </Frame>
  )
}

/** Showcase card "Learn": seminar, study and archive joined into one line. */
export function FlowMini() {
  const stops: Array<[typeof Presentation, string]> = [[Presentation, '세미나'], [BookOpen, '스터디'], [FolderOpen, '자료실']]
  return (
    <div className="coms-mini coms-mini-flow" aria-hidden="true">
      <span className="coms-mini-rail"><i /></span>
      {stops.map(([Icon, label], index) => (
        <span key={label} className="coms-mini-stop" style={{ '--i': index } as React.CSSProperties}>
          <span className="coms-mini-chip"><Icon size={18} strokeWidth={2} /></span>
          <small>{label}</small>
        </span>
      ))}
    </div>
  )
}

/** Showcase card "Build": a small editor writing a few lines, then the build passing. */
export function BuildMini() {
  return (
    <div className="coms-mini coms-mini-build" aria-hidden="true">
      <div className="coms-mini-editor">
        <span className="coms-mini-editor-bar"><i /><i /><i /></span>
        {[62, 84, 46, 70].map((width, index) => (
          <span key={index} className="coms-mini-code" style={{ '--w': `${width}%`, '--i': index } as React.CSSProperties} />
        ))}
      </div>
      <span className="coms-mini-pass"><Check size={14} strokeWidth={3} />build</span>
    </div>
  )
}

/** Showcase card "Join": a row of members, with room for one more. */
export function JoinMini() {
  return (
    <div className="coms-mini coms-mini-join" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <span key={index} className="coms-mini-face" style={{ '--i': index } as React.CSSProperties}><User size={18} strokeWidth={2} /></span>
      ))}
      <span className="coms-mini-face coms-mini-face-new"><Plus size={18} strokeWidth={2.4} /></span>
    </div>
  )
}
