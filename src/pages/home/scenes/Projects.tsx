import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { useCalm } from '../../../hooks/useCalm'
import { projectDetails, sectionStories, visualDetails } from '../../../data/homeContent'
import { ProjectLabVisual } from '../HomeVisuals'
import { CineTitle, SceneActionRow, SceneStats, Slate, type SceneActions } from './parts'
import { cssVars } from './cssVars'

// What each row of projectDetails is, in the same order (the site's own three kinds of work).
const KINDS = ['Web', 'IoT', 'Web', 'App']

// Scene 4. The projects as an index: one full-width row each. A row opens to its description on
// hover or focus; on touch screens, and with reduced motion or lite, every description is shown.
export default function Projects({ index, actions, onOpen, backdrop }: { index: number; actions: SceneActions; onOpen: () => void; backdrop: ReactNode }) {
  const story = sectionStories.projects
  const grid = useRef<HTMLDivElement | null>(null)
  const calm = useCalm()

  // The big index numeral follows the row that is passing the middle of the screen.
  useEffect(() => {
    const el = grid.current
    if (!el || calm) return
    let raf = 0
    const measure = () => {
      raf = 0
      const box = el.getBoundingClientRect()
      if (box.bottom < 0 || box.top > window.innerHeight) return
      const mid = window.innerHeight / 2
      let best = 0
      let bestDist = Infinity
      el.querySelectorAll('.scene-index > li').forEach((li, i) => {
        const r = li.getBoundingClientRect()
        const d = Math.abs(r.top + r.height / 2 - mid)
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      })
      el.dataset.active = String(best)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [calm])

  return (
    <section id="projects" data-scene="projects" className="scene scene-projects">
      {backdrop}
      <div className="scene-inner">
        <Slate index={index} name="Projects" />
        <CineTitle text={story.title} />
        <p className="scene-lede" data-cine style={cssVars({ '--i': 2 })}>{story.body}</p>
        <SceneActionRow actions={actions} />

        <div className="scene-projects__grid" ref={grid} data-active="0">
          <div className="scene-projects__list" data-scene="index">
            <span className="scene-projects__line" aria-hidden="true"><i /></span>
          <ol className="scene-index" aria-label="프로젝트 목록">
            {projectDetails.map((item, i) => (
              <li key={item.title} data-cine="slide" style={cssVars({ '--i': i })}>
                <button type="button" className="scene-row" onClick={onOpen}>
                  <span className="cine-hud scene-row__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="scene-row__title">{item.title}</span>
                  <span className="cine-hud scene-row__tag">
                    <span className="scene-row__tagrun">
                      <span>{KINDS[i % KINDS.length]}</span>
                      {[0, 1, 2].map((n) => <span key={n} aria-hidden="true">{KINDS[i % KINDS.length]}</span>)}
                    </span>
                  </span>
                  <ArrowUpRight size={22} aria-hidden="true" className="scene-row__go" />
                  <span className="scene-row__desc">{item.description}</span>
                </button>
              </li>
            ))}
          </ol>
          </div>
          <aside className="scene-projects__side">
            <div className="scene-projects__numerals" aria-hidden="true">
              {projectDetails.map((item, i) => (
                <span key={item.title} data-n={String(i + 1).padStart(2, '0')} />
              ))}
            </div>
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
