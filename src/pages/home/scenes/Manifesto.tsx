import { experiencePills, heroHighlights, sectionStories, visualDetails } from '../../../data/homeContent'
import { ClubOsVisual } from '../HomeVisuals'
import { SceneActionRow, SceneStats, Slate, cssVars, type SceneActions } from './parts'

// Scene 2, the one pinned moment: the statement sits still for about 80vh of scrolling while its
// words light up one by one (--p comes from useSceneProgress). Reduced motion and lite drop the
// pin and show every word lit.
export default function Manifesto({ index, actions }: { index: number; actions: SceneActions }) {
  const story = sectionStories.about
  const words = story.title.split(/\s+/)

  return (
    <section id="about" className="scene scene-about">
      <div className="scene-about__track" data-scene="manifesto" data-scene-pin>
        <div className="scene-about__pin">
          <Slate index={index} name="About" />
          <h2 className="scene-title scene-title--xl cine-scrub-words" style={cssVars({ '--n': words.length })}>
            {words.map((word, i) => (
              <span key={i}>
                <span className="cine-w" style={cssVars({ '--i': i })}>{word}</span>{' '}
              </span>
            ))}
          </h2>
        </div>
      </div>

      <div className="scene-about__after">
        <div className="scene-about__copy">
          <p className="scene-lede" data-cine>{story.body}</p>
          <SceneActionRow actions={actions} />
        </div>
        <div className="scene-about__visual cine-wipe">
          <ClubOsVisual {...visualDetails.about} />
        </div>
        <div className="scene-about__facts">
          <SceneStats id="about" />
          <ul className="scene-highlights">
            {heroHighlights.map((item, i) => (
              <li key={item.value} data-cine style={cssVars({ '--i': i })}>
                <span className="cine-hud">{item.label}</span>
                <strong>{item.value}</strong>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
          <ul className="scene-pills" aria-label="경험 키워드">
            {experiencePills.map((pill) => (
              <li key={pill}>{pill}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
