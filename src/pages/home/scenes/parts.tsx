import type { ElementType } from 'react'
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

/** Three figures with a hairline above each. */
export function SceneStats({ id }: { id: keyof typeof sectionMetrics }) {
  return (
    <dl className="scene-stats">
      {sectionMetrics[id].map((item, i) => (
        <div key={item.value} data-cine style={cssVars({ '--i': i })}>
          <dt>{item.value}</dt>
          <dd>{item.label}</dd>
        </div>
      ))}
    </dl>
  )
}
