import { ArrowUpRight, Download, FileText } from 'lucide-react'
import { buildProjectStatusBadges } from '../../utils/appProjectStatus'
import '../../styles/site-pages.css'
import { projectFileHref, safeProjectLinkUrl } from '../../utils/appProjectUrls'

const STATUS_TONE_CLASS = {
  ready: 'bg-[#e8f3ff] text-[var(--app-accent-text)]',
  hosted: 'bg-[#eaf8ee] text-[#248a3d]',
  external: 'bg-[#fff4de] text-[#b76e00]',
  download: 'bg-[#f0ecff] text-[#6e3fd8]',
  draft: 'bg-[#f5f5f7] text-[#6e6e73]',
  // Theme tokens, not fixed colours: the other tones are remapped for the dark theme by hue.
  down: 'border border-[var(--app-hairline-strong)] bg-transparent text-[var(--app-text)]',
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

/** The host only ("coms.kw.ac.kr"): the path is noise on a card, the link itself is the card. */
function hostOf(url) {
  if (typeof url !== 'string') return ''
  return url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0]
}

function fileLabel(file) {
  return file?.originalName || file?.name || '배포파일'
}

type AppProject = {
  title?: string
  eyebrow?: string
  description?: string
  madeBy?: string
  linkUrl?: string
  displayUrl?: string
  files?: { id?: string | number; url?: string; originalName?: string; name?: string; size?: number; fileSize?: number }[]
  [key: string]: unknown
}

export default function AppProjectCard({
  project,
  showStatusBadges = false,
  linkState = null,
  interactive = true,
  showAuthor = true,
  className = '',
  testId,
}: {
  project: AppProject
  showStatusBadges?: boolean
  /** What the server's last look at the link found; see linkStateOf. */
  linkState?: 'UP' | 'DOWN' | 'UNKNOWN' | null
  interactive?: boolean
  /** False where one author is said once for the whole page instead of on every card. */
  showAuthor?: boolean
  className?: string
  testId?: string
}) {
  const files = Array.isArray(project?.files) ? project.files : []
  const linkHref = safeProjectLinkUrl(project?.linkUrl)
  const hasLink = Boolean(linkHref)
  // Keep the whole card clickable only when there's nothing interactive nested
  // inside it (no embed button, no download files) — anchors can't wrap buttons.
  const wholeCardLink = hasLink && interactive && files.length === 0
  const CardTag = wholeCardLink ? 'a' : 'div'
  const cardProps = wholeCardLink
    ? { href: linkHref, target: '_blank', rel: 'noreferrer' }
    : {}
  const badges = showStatusBadges ? buildProjectStatusBadges(project, linkState) : []
  // Said on the card itself wherever the badges are not shown: the link still opens (the look
  // can be minutes old), but a visitor should not find out from an error page.
  const notAnswering = hasLink && linkState === 'DOWN' && !showStatusBadges

  const title = project?.title || '입력 중인 Apps 항목'
  const host = hostOf(project?.displayUrl)
  const open = hasLink && (
    wholeCardLink ? (
      <span className="app-card-open">
        열기
        <ArrowUpRight size={15} aria-hidden="true" />
      </span>
    ) : (
      <a
        href={linkHref || undefined}
        target="_blank"
        rel="noreferrer"
        aria-label={`${title} 열기`}
        className="app-card-open"
      >
        열기
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    )
  )

  return (
    <CardTag
      {...cardProps}
      data-testid={testId}
      className={`apple-product-panel app-card group text-left no-underline transition hover:-translate-y-0.5 ${className}`}
    >
      <span className="app-card-tile" aria-hidden="true">{Array.from(title)[0]?.toUpperCase()}</span>
      <div className="app-card-head">
        {project?.eyebrow && <p className="app-card-eyebrow">{project.eyebrow}</p>}
        <h3 className="app-card-title">{title}</h3>
      </div>
      {open}
      {project?.description && <p className="app-card-desc">{project.description}</p>}
      {(host || notAnswering || (showAuthor && project?.madeBy)) && (
        <div className="app-card-foot">
          {notAnswering && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--app-hairline-strong)] px-2.5 py-0.5 text-xs font-bold text-[var(--app-text)]">
              <span className="size-1.5 rounded-full bg-[var(--app-danger)]" aria-hidden="true" />
              지금 응답 없음
            </span>
          )}
          {host && <span className="app-card-host">{host}</span>}
          {showAuthor && project?.madeBy && <span>만든 사람: {project.madeBy}</span>}
        </div>
      )}

      <div className="app-card-more">
      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="앱 상태">
          {badges.map((badge) => (
            <span
              key={badge.key}
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_TONE_CLASS[badge.tone] || STATUS_TONE_CLASS.draft}`}
            >
              {badge.label}
            </span>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-3 grid gap-2" aria-label="배포 파일">
          {files.map((file) => {
            const size = formatFileSize(file.fileSize)
            const href = projectFileHref(file.url)
            return (
              <a
                key={file.id || file.originalName || file.url}
                href={href}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--app-hairline-strong)] bg-[var(--app-surface-soft)] px-3 py-2 text-xs font-bold text-[var(--app-text)] no-underline transition hover:border-[var(--app-accent-text)] hover:text-[var(--app-accent-text)]"
                onClick={(event) => {
                  event.stopPropagation()
                  if (href === '#') event.preventDefault()
                }}
              >
                <FileText size={14} aria-hidden="true" className="shrink-0 text-[var(--app-subtle)]" />
                <span className="min-w-0 flex-1 truncate">{fileLabel(file)}</span>
                {size && <span className="shrink-0 text-[var(--app-subtle)]">{size}</span>}
                <Download size={13} aria-hidden="true" className="shrink-0" />
                <span className="sr-only">다운로드</span>
              </a>
            )
          })}
        </div>
      )}

      </div>
    </CardTag>
  )
}
