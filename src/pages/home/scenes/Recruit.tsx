import type { ReactNode } from 'react'
import { sectionStories, visualDetails } from '../../../data/homeContent'
import { JoinFlowVisual } from '../HomeVisuals'
import { CineTitle, SceneActionRow, SceneStats, Slate, type SceneActions } from './parts'
import { cssVars } from './cssVars'

const MARQUEE = Array.from({ length: 2 }, () => `${sectionStories.recruit.primary}   ·   ${sectionStories.recruit.secondary}   ·   `).join('')

// The finale. The title is set very large and drifts a few percent sideways as the scene passes
// (--p, scroll only), then the copy, the actions, the steps and the join flow.
export default function Recruit({ index, actions, backdrop }: { index: number; actions: SceneActions; backdrop: ReactNode }) {
  const story = sectionStories.recruit

  return (
    <section id="recruit" data-scene="recruit" className="scene scene-recruit">
      {backdrop}
      <div className="scene-inner">
        <Slate index={index} name="Recruit" />
        <div className="scene-recruit__drift">
          <CineTitle text={story.title} className="scene-title--finale" />
        </div>
        <div className="scene-recruit__body">
          <div>
            <p className="scene-lede" data-cine style={cssVars({ '--i': 2 })}>{story.body}</p>
            <SceneActionRow actions={actions} />
            <SceneStats id="recruit" />
          </div>
          <div className="cine-wipe">
            <JoinFlowVisual {...visualDetails.recruit} />
          </div>
        </div>
      </div>
      <div className="scene-recruit__marquee" aria-hidden="true">
        <span className="scene-recruit__marquee-run" data-t={MARQUEE} />
      </div>
    </section>
  )
}
