import { ArrowUpRight } from 'lucide-react'
import { projectDetails, sectionStories, visualDetails } from '../../../data/homeContent'
import { ProjectLabVisual } from '../HomeVisuals'
import { CineTitle, SceneActionRow, SceneStats, Slate, type SceneActions } from './parts'
import { cssVars } from './cssVars'

// What each row of projectDetails is, in the same order (the site's own three kinds of work).
const KINDS = ['Web', 'IoT', 'Web', 'App']

// Scene 4. The projects as an index: one full-width row each. A row opens to its description on
// hover or focus; on touch screens, and with reduced motion or lite, every description is shown.
export default function Projects({ index, actions, onOpen }: { index: number; actions: SceneActions; onOpen: () => void }) {
  const story = sectionStories.projects

  return (
    <section id="projects" className="scene scene-projects">
      <div className="scene-inner">
        <Slate index={index} name="Projects" />
        <CineTitle text={story.title} />
        <p className="scene-lede" data-cine style={cssVars({ '--i': 2 })}>{story.body}</p>
        <SceneActionRow actions={actions} />

        <div className="scene-projects__grid">
          <ol className="scene-index" aria-label="프로젝트 목록">
            {projectDetails.map((item, i) => (
              <li key={item.title} data-cine style={cssVars({ '--i': i })}>
                <button type="button" className="scene-row" onClick={onOpen}>
                  <span className="cine-hud scene-row__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="scene-row__title">{item.title}</span>
                  <span className="cine-hud scene-row__tag">{KINDS[i % KINDS.length]}</span>
                  <ArrowUpRight size={22} aria-hidden="true" className="scene-row__go" />
                  <span className="scene-row__desc">{item.description}</span>
                </button>
              </li>
            ))}
          </ol>
          <aside className="scene-projects__side">
            <div className="cine-wipe">
              <ProjectLabVisual {...visualDetails.projects} />
            </div>
            <SceneStats id="projects" />
          </aside>
        </div>
      </div>
    </section>
  )
}
