import { useEffect, useRef, type ReactNode } from 'react'
import { useCalm } from '../../../hooks/useCalm'
import { projectDetails, sectionStories, visualDetails } from '../../../data/homeContent'
import { ProjectLabVisual } from '../HomeVisuals'
import { CineTitle, SceneActionRow, SceneStats, Slate, type SceneActions } from './parts'
import { cssVars } from './cssVars'

export default function Projects({ index, actions, backdrop }: { index: number; actions: SceneActions; backdrop: ReactNode }) {
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
                <li key={item.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-3 py-5 sm:grid-cols-[2.25rem_minmax(0,1fr)] sm:gap-4 sm:py-6" data-cine="slide" style={cssVars({ '--i': i })}>
                  <span className="cine-hud" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="scene-index__title min-w-0 wrap-anywhere">{item.title}</h3>
                      <span className="cine-hud">{item.kind}</span>
                    </div>
                    <p className="mt-2 max-w-[40rem] text-base leading-relaxed text-[var(--cine-body)] [word-break:keep-all]">{item.description}</p>
                  </div>
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
