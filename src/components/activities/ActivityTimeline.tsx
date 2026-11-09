import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
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

function EventBody({ event, status, children }: { event: TimelineEvent; status: TimelineStatus; children?: ReactNode }) {
  return (
    <div className="act-body">
      <div className="act-meta">
        <StatusBadge status={status} />
        <span className="act-kind">{event.kind}</span>
      </div>
      <h4 className="act-card-title">{event.title}</h4>
      <p className="act-card-text">{event.summary}</p>
      {event.facts && (
        <ul className="act-facts">
          {event.facts.map((fact) => <li key={fact}>{fact}</li>)}
        </ul>
      )}
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
        {event.facts && (
          <ul className="act-facts">
            {event.facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>
        )}
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
        const status = resolveStatus(event, now)
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
  const now = useNow(HACKATHON_TICK_MS)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [openId, setOpenIdState] = useState<string | null>(null)

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

  const spring = useMemo(() => timelineEvents.filter((e) => e.term === 'spring'), [])
  const fall = useMemo(() => timelineEvents.filter((e) => e.term === 'fall'), [])
  const fallLive = fall.some((e) => resolveStatus(e, now) === 'live')
  const upcoming = useMemo(() => timelineEvents.filter((e) => e.term === 'upcoming'), [])

  return (
    <section className="coms-sec coms-sec-top act-timeline" id="timeline" aria-labelledby="act-timeline-title">
      <div className="coms-sec-inner">
        <header className="act-head">
          <div>
            <h2 id="act-timeline-title" className="act-title">2026년, COM’s가 한 일</h2>
            <p className="act-lede">1학기에 했던 활동, 2학기 활동, 앞으로 예정된 일정을 시간 순서로 모았습니다.</p>
          </div>
          <nav className="act-jump" aria-label="타임라인 구간 바로가기">
            <a href="#act-spring"><b>{spring.length}</b><span>2026 1학기 · 완료</span></a>
            <a href="#act-fall"><b>{fall.length}</b><span>2026 2학기{fallLive ? ' · 진행 중' : ''}</span></a>
            <a href="#act-upcoming"><b>{upcoming.length}</b><span>예정</span></a>
          </nav>
        </header>

        <section className="act-term" id="act-spring" aria-labelledby="act-spring-title">
          <div className="act-term-head">
            <h3 id="act-spring-title" className="act-term-title">2026 1학기</h3>
            <StatusBadge status="done" />
          </div>
          <SpringGrid events={spring} onOpen={open} />
        </section>

        <section className="act-term" id="act-summer" aria-labelledby="act-summer-title">
          <div className="act-term-head">
            <h3 id="act-summer-title" className="act-term-title">2026 여름방학 소모임</h3>
            <StatusBadge status="done" />
          </div>
          <SummerClubs onOpen={open} />
        </section>

        <section className="act-term" id="act-fall" aria-labelledby="act-fall-title">
          <div className="act-term-head">
            <h3 id="act-fall-title" className="act-term-title">2026 2학기</h3>
            {fallLive && <StatusBadge status="live" />}
          </div>
          <FallSpine events={fall} now={now} onOpen={open} />
        </section>

        <section className="act-term" id="act-upcoming" aria-labelledby="act-upcoming-title">
          <div className="act-term-head">
            <h3 id="act-upcoming-title" className="act-term-title">예정</h3>
            <StatusBadge status="planned" />
          </div>
          <ul className="act-grid act-grid-planned">
            {upcoming.map((event) => (
              <li key={event.id} className="act-card act-card-planned" data-has-photo="false">
                <EventBody event={event} status="planned">
                  <p className="act-when">{event.dateLabel}</p>
                </EventBody>
              </li>
            ))}
          </ul>
          <p className="act-note">예정 항목은 2026.11.07 창립제 자료와 해커톤 개회식 자료를 기준으로 하며, 날짜는 아직 정해지지 않았습니다.</p>

          <aside className="act-recruit" aria-labelledby="act-recruit-title">
            <div>
              <h4 id="act-recruit-title" className="act-recruit-title">지금 60기 상시 모집 중</h4>
              <p className="act-card-text">마감 없이 받고 있고, 코딩이 처음이어도 괜찮습니다. 회비는 2만원, 동아리방은 복지관 403호입니다.</p>
            </div>
            <Link to="/recruit" className="act-recruit-link">지원 안내 보기 <ArrowRight size={16} aria-hidden="true" /></Link>
          </aside>
        </section>
      </div>
      <Lightbox dialogRef={dialogRef} openId={openId} setOpenId={setOpenId} />
    </section>
  )
}
