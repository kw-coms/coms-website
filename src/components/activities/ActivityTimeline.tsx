import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react'
import {
  foundingExtraPhotoIds,
  foundingProgram,
  photoSrc,
  resolveStatus,
  statusLabel,
  summerClubs,
  timelineEvents,
  timelinePhotos,
} from '../../data/activityTimeline'
import type { TimelineEvent, TimelinePhoto, TimelineStatus } from '../../data/activityTimeline'
import { mergeActivityTimeline } from '../../data/activityTimelineMerge'
import type { PublicTimelineActivity } from '../../data/activityTimelineMerge'
import { RECRUIT_FACTS, recruitSummary } from '../../data/recruitFacts'
import { useAuth } from '../../contexts/useAuth'
import { listClubActivityTimeline } from '../../services/clubActivityApi'
import './activities.css'

const photoById = new Map(timelinePhotos.map((p) => [p.id, p]))
const HACKATHON_TICK_MS = 60_000

type OpenPhoto = (id: string) => void

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function StatusBadge({ status }: { status: TimelineStatus }) {
  return (
    <span className="act-status" data-status={status}>
      <i aria-hidden="true" />
      {statusLabel[status]}
    </span>
  )
}

function PhotoButton({ photo, onOpen, sizes, className = '' }: { photo: TimelinePhoto; onOpen: OpenPhoto; sizes: string; className?: string }) {
  const { user, loading } = useAuth()
  // The photos show members' faces and nginx only serves them to a signed-in session. A guest gets no
  // <img> at all, so no photo URL is requested (nothing 401s); the slot is a quiet placeholder that keeps its
  // ratio. The one login notice sits above the timeline.
  if (!user) {
    return <div className={`act-photo act-photo-locked ${className}`} aria-hidden="true" aria-busy={loading || undefined} />
  }
  const { src, srcSet } = photoSrc(photo)
  return (
    <button type="button" className={`act-photo ${className}`} onClick={() => onOpen(photo.id)} aria-label={`${photo.caption ?? photo.alt} 사진 크게 보기`}>
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        width={photo.width}
        height={photo.height}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        style={photo.focus ? ({ objectPosition: photo.focus } as CSSProperties) : undefined}
      />
      <span className="act-photo-zoom" aria-hidden="true"><Maximize2 size={14} strokeWidth={2.4} /></span>
    </button>
  )
}

/** Public facts for everyone; internal agenda lines only for a signed-in member. */
function Facts({ event }: { event: TimelineEvent }) {
  const { user } = useAuth()
  const facts = [...(event.facts ?? []), ...(user ? event.memberFacts ?? [] : [])]
  if (facts.length === 0) return null
  return (
    <ul className="act-facts">
      {facts.map((fact) => <li key={fact}>{fact}</li>)}
    </ul>
  )
}

function EventBody({ event, status, children }: { event: TimelineEvent; status: TimelineStatus; children?: ReactNode }) {
  return (
    <div className="act-body">
      <div className="act-meta">
        <StatusBadge status={status} />
        <span className="act-kind">{event.kind}</span>
      </div>
      <h4 className="act-card-title">{event.title}</h4>
      <p className="act-card-text">{event.summary}</p>
      <Facts event={event} />
      {children}
    </div>
  )
}

/** 1학기: the sources give no day, so these are a plain grid and not a dated spine. Events without a photo share one card. */
function SpringGrid({ events, onOpen }: { events: TimelineEvent[]; onOpen: OpenPhoto }) {
  const withPhoto = events.filter((e) => e.photoId)
  const textOnly = events.filter((e) => !e.photoId)
  return (
    <ul className="act-grid">
      {withPhoto.map((event) => {
        const photo = photoById.get(event.photoId ?? '')
        return (
          <li key={event.id} className="act-card" data-has-photo="true">
            {photo && <PhotoButton photo={photo} onOpen={onOpen} sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 92vw" />}
            <EventBody event={event} status={event.status} />
          </li>
        )
      })}
      <li className="act-card act-card-list">
        <div className="act-body">
          <div className="act-meta">
            <StatusBadge status="done" />
            <span className="act-kind">그 밖의 활동</span>
          </div>
          <ul className="act-mini">
            {textOnly.map((event) => (
              <li key={event.id}>
                <h4 className="act-mini-title">{event.title}<span>{event.kind}</span></h4>
                <p>{event.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      </li>
    </ul>
  )
}

function SummerClubs({ onOpen }: { onOpen: OpenPhoto }) {
  return (
    <ul className="act-clubs">
      {summerClubs.map((club) => {
        const photo = photoById.get(club.photoId)
        return (
          <li key={club.id}>
            {photo && <PhotoButton photo={photo} onOpen={onOpen} sizes="(min-width: 1024px) 380px, (min-width: 640px) 30vw, 92vw" />}
            <p className="act-club-name">{club.name}</p>
            <p className="act-club-what">{club.what}</p>
          </li>
        )
      })}
    </ul>
  )
}

function Founding({ event, onOpen }: { event: TimelineEvent; onOpen: OpenPhoto }) {
  const lead = event.photoId ? photoById.get(event.photoId) : undefined
  const extras = foundingExtraPhotoIds.map((id) => photoById.get(id)).filter((p): p is TimelinePhoto => Boolean(p))
  return (
    <article className="act-founding">
      <div className="act-founding-media">
        {lead && <PhotoButton photo={lead} onOpen={onOpen} className="act-photo-lead" sizes="(min-width: 1024px) 640px, 92vw" />}
        <div className="act-founding-extras">
          {extras.map((p) => <PhotoButton key={p.id} photo={p} onOpen={onOpen} sizes="(min-width: 1024px) 310px, 46vw" />)}
        </div>
      </div>
      <div className="act-founding-body">
        <div className="act-meta">
          <StatusBadge status="done" />
          <span className="act-kind">{event.kind}</span>
        </div>
        <h4 className="act-founding-title">{event.title}</h4>
        <p className="act-card-text">{event.summary}</p>
        <Facts event={event} />
        <p className="act-subhead" id="act-program-title">진행 순서</p>
        <ol className="act-program" aria-labelledby="act-program-title">
          {foundingProgram.map((step) => (
            <li key={step.label}>
              <span className="act-program-time">{step.time ?? ''}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </article>
  )
}

function Hackathon({ event, status, now }: { event: TimelineEvent; status: TimelineStatus; now: number }) {
  const start = Date.parse(event.start ?? '')
  const end = Date.parse(event.end ?? '')
  const total = Math.round((end - start) / 3_600_000)
  const elapsed = Math.min(total, Math.max(0, Math.floor((now - start) / 3_600_000)))
  const pct = total ? Math.round((elapsed / total) * 100) : 0
  return (
    <article className="act-live">
      <EventBody event={event} status={status}>
        <div className="act-progress">
          <div
            className="act-progress-track"
            role="progressbar"
            aria-label="해커톤 경과 시간"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={elapsed}
            aria-valuetext={`${total}시간 중 ${elapsed}시간 경과`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="act-progress-label"><b>{elapsed}</b> / {total}시간 경과</p>
        </div>
      </EventBody>
    </article>
  )
}

function FallSpine({ events, now, onOpen }: { events: TimelineEvent[]; now: number; onOpen: OpenPhoto }) {
  return (
    <ol className="act-spine">
      {events.map((event) => {
        const status = event.fromDb ? event.status : resolveStatus(event, now)
        const photo = event.photoId ? photoById.get(event.photoId) : undefined
        return (
          <li key={event.id} className="act-row" data-status={status}>
            <div className="act-date">
              {event.start ? <time dateTime={event.start.slice(0, 10)}>{event.dateLabel}</time> : <span>{event.dateLabel}</span>}
            </div>
            {event.id === 'fall-founding' ? (
              <Founding event={event} onOpen={onOpen} />
            ) : event.id === 'fall-hackathon' ? (
              <Hackathon event={event} status={status} now={now} />
            ) : (
              <article className="act-card act-card-row" data-has-photo={photo ? 'true' : 'false'}>
                {photo && <PhotoButton photo={photo} onOpen={onOpen} sizes="(min-width: 1024px) 300px, (min-width: 640px) 40vw, 92vw" />}
                <EventBody event={event} status={status} />
              </article>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Lightbox({ dialogRef, openId, setOpenId }: { dialogRef: React.RefObject<HTMLDialogElement | null>; openId: string | null; setOpenId: (id: string | null) => void }) {
  const index = timelinePhotos.findIndex((p) => p.id === openId)
  const photo = index >= 0 ? timelinePhotos[index] : undefined
  const step = (delta: number) => {
    const next = (index + delta + timelinePhotos.length) % timelinePhotos.length
    setOpenId(timelinePhotos[next].id)
  }
  const sources = photo ? photoSrc(photo) : undefined
  return (
    <dialog
      ref={dialogRef}
      className="act-lightbox"
      aria-label="활동 사진 크게 보기"
      onClose={() => setOpenId(null)}
      onClick={(e) => { if (e.target === e.currentTarget) dialogRef.current?.close() }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      }}
    >
      {photo && sources && (
        <figure className="act-lightbox-figure">
          <img key={photo.id} src={sources.src} srcSet={sources.srcSet} sizes="96vw" width={photo.width} height={photo.height} alt={photo.alt} decoding="async" />
          <figcaption>
            <span>{photo.caption ?? photo.alt}</span>
            <span className="act-lightbox-count" aria-live="polite">{index + 1} / {timelinePhotos.length}</span>
          </figcaption>
        </figure>
      )}
      <button type="button" className="act-lb-btn act-lb-close" onClick={() => dialogRef.current?.close()} aria-label="닫기 (Esc)"><X size={20} /></button>
      <button type="button" className="act-lb-btn act-lb-prev" onClick={() => step(-1)} aria-label="이전 사진"><ChevronLeft size={22} /></button>
      <button type="button" className="act-lb-btn act-lb-next" onClick={() => step(1)} aria-label="다음 사진"><ChevronRight size={22} /></button>
    </dialog>
  )
}

export default function ActivityTimeline() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const now = useNow(HACKATHON_TICK_MS)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [openId, setOpenIdState] = useState<string | null>(null)
  const [dbResult, setDbResult] = useState<{ owner: string; items: PublicTimelineActivity[] }>({ owner: '', items: [] })
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [timelineError, setTimelineError] = useState(false)
  const memberId = String(user?.studentId ?? '')

  const setOpenId = useCallback((id: string | null) => setOpenIdState(id), [])
  const open = useCallback((id: string) => setOpenIdState(id), [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    if (openId && !dialog.open) dialog.showModal()
    const prev = document.body.style.overflow
    if (openId) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [openId])

  useEffect(() => {
    if (loading) return undefined
    let active = true
    const refresh = () => listClubActivityTimeline()
      .then((items) => { if (active) { setDbResult({ owner: memberId, items: Array.isArray(items) ? items : [] }); setTimelineError(false) } })
      .catch(() => { if (active) { setDbResult({ owner: memberId, items: [] }); setTimelineError(true) } })
      .finally(() => { if (active) setTimelineLoading(false) })
    refresh()
    const timer = window.setInterval(refresh, HACKATHON_TICK_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [loading, memberId])

  const { sections, upcoming, hasUndatedUpcoming, liveTerms } = useMemo(
    () => mergeActivityTimeline(dbResult.owner === memberId ? dbResult.items : [], now, timelineEvents), [dbResult, memberId, now])
  const spring = sections.find((section) => section.id === 'act-spring')?.events ?? []

  return (
    <section className="coms-sec coms-sec-top act-timeline" id="timeline" aria-labelledby="act-timeline-title">
      <div className="coms-sec-inner">
        <header className="act-head">
          <div>
            <h2 id="act-timeline-title" className="act-title">2026년, COM’s가 한 일</h2>
            <p className="act-lede">1학기에 했던 활동, 2학기 활동, 앞으로 예정된 일정을 시간 순서로 모았습니다.</p>
          </div>
          <nav className="act-jump" aria-label="타임라인 구간 바로가기">
            {sections.map((section) => <a key={section.id} href={`#${section.id}`}>
              <b>{section.id === 'act-summer' ? summerClubs.length + section.events.length : section.events.length}</b>
              <span>{section.term}{liveTerms.has(section.term) ? ' · 진행 중' : ''}</span>
            </a>)}
            {!timelineLoading && upcoming.length > 0 && <a href="#act-upcoming"><b>{upcoming.length}</b><span>예정</span></a>}
          </nav>
        </header>

        {timelineError && <p className="act-note" role="status">활동 일정을 불러오지 못했습니다. 기존 활동 기록은 계속 볼 수 있습니다.</p>}
        {timelineLoading && <p className="act-note" role="status">활동 일정을 불러오는 중입니다.</p>}

        {!user && !loading && (
          <p className="act-guest-note" data-testid="act-photo-notice">
            로그인하면 활동 사진을 볼 수 있어요. <Link to="/login" state={{ from: location }}>로그인</Link>
          </p>
        )}

        {sections.map((section) => <section key={section.id} className="act-term" id={section.id} aria-labelledby={`${section.id}-title`}>
          <div className="act-term-head">
            <h3 id={`${section.id}-title`} className="act-term-title">{section.id === 'act-summer' ? '2026 여름방학 소모임' : section.term}</h3>
            {liveTerms.has(section.term) ? <StatusBadge status="live" /> : section.id === 'act-spring' || section.id === 'act-summer' ? <StatusBadge status="done" /> : null}
          </div>
          {section.id === 'act-spring' && <SpringGrid events={spring.filter((event) => !event.fromDb)} onOpen={open} />}
          {section.id === 'act-summer' && <SummerClubs onOpen={open} />}
          {section.id !== 'act-summer' && section.id !== 'act-spring' && <FallSpine events={section.events} now={now} onOpen={open} />}
          {(section.id === 'act-spring' || section.id === 'act-summer') && section.events.some((event) => event.fromDb) &&
            <FallSpine events={section.events.filter((event) => event.fromDb)} now={now} onOpen={open} />}
        </section>)}

        {!timelineLoading && upcoming.length > 0 && <section className="act-term" id="act-upcoming" aria-labelledby="act-upcoming-title">
          <div className="act-term-head">
            <h3 id="act-upcoming-title" className="act-term-title">예정</h3>
            <StatusBadge status="planned" />
          </div>
          <ul className="act-grid act-grid-planned">
            {upcoming.map((event) => (
              <li key={event.id} className="act-card act-card-planned" data-has-photo="false">
                <EventBody event={event} status={event.status}>
                  <p className="act-when">{event.dateLabel}</p>
                </EventBody>
              </li>
            ))}
          </ul>
          {hasUndatedUpcoming && <p className="act-note">예정 항목의 날짜는 미정입니다.</p>}
        </section>}

        <aside className="act-recruit" aria-labelledby="act-recruit-title">
            <div>
              <h4 id="act-recruit-title" className="act-recruit-title">{RECRUIT_FACTS.headline}</h4>
              <p className="act-card-text">{recruitSummary}</p>
            </div>
            <Link to="/recruit" className="act-recruit-link">지원 안내 보기 <ArrowRight size={16} aria-hidden="true" /></Link>
        </aside>
      </div>
      <Lightbox dialogRef={dialogRef} openId={openId} setOpenId={setOpenId} />
    </section>
  )
}
