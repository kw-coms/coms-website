import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { activityDetails, sectionStories, showcaseItems, visualDetails } from '../../../data/homeContent'
import { BuildMini, FlowMini, JoinMini, LearningStackVisual } from '../HomeVisuals'
import { CineTitle, SceneActionRow, SceneStats, Slate, type SceneActions } from './parts'
import { cssVars } from './cssVars'

const SHOWCASE_ART = [FlowMini, BuildMini, JoinMini]

const code = (n: number) => `A-${String(n).padStart(2, '0')}`

// Scene 3. The routine as rows of frames: three pictures to a row, then the details two to a row.
export default function Activities({ index, actions, onOpen, backdrop }: { index: number; actions: SceneActions; onOpen: (id: string) => void; backdrop: ReactNode }) {
  const story = sectionStories.activities

  return (
    <section id="activities" data-scene="activities" className="scene scene-activities">
      {backdrop}
      <div className="scene-inner">
        <div className="scene-activities__head">
          <div>
            <Slate index={index} name="Activities" />
            <CineTitle text={story.title} />
            <p className="scene-lede" data-cine style={cssVars({ '--i': 2 })}>{story.body}</p>
            <SceneActionRow actions={actions} />
          </div>
          {/* The first frame sits beside the words it illustrates. */}
          <article className="scene-frame scene-frame--lead" data-scene="frame" data-tilt data-rule>
            <p className="cine-hud scene-frame__code" data-cine>{code(1)} · {visualDetails.activities.title}</p>
            <div className="scene-frame__media cine-wipe">
              <LearningStackVisual {...visualDetails.activities} />
            </div>
          </article>
        </div>
        <SceneStats id="activities" />

        <div className="scene-frames">
          {showcaseItems.map((item, i) => {
            const Art = SHOWCASE_ART[i % SHOWCASE_ART.length]
            return (
              <article key={item.title} className="scene-frame scene-frame--link scene-frame--third" data-scene="frame" data-tilt data-rule style={cssVars({ '--i': i })}>
                <div className="scene-frame__media cine-wipe">
                  <Art />
                </div>
                <p className="cine-hud scene-frame__code" data-cine>{code(i + 2)} · {item.eyebrow}</p>
                <h3 className="scene-frame__title" data-cine>
                  <button type="button" className="scene-frame__link" onClick={() => onOpen(item.target)}>{item.title}</button>
                </h3>
                <p className="scene-frame__body" data-cine>{item.body}</p>
                <span className="scene-frame__go" aria-hidden="true">더 보기 <ArrowRight size={15} /></span>
              </article>
            )
          })}

          {activityDetails.map((item, i) => (
            <article key={item.title} className="scene-frame scene-frame--text" data-rule style={cssVars({ '--i': i % 2 })}>
              <span className="cine-hud scene-frame__code" data-cine>{code(showcaseItems.length + i + 2)}</span>
              <h3 className="scene-frame__title" data-cine>{item.title}</h3>
              <p className="scene-frame__body" data-cine>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
