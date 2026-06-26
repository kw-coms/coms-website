import { useState } from 'react'
import { ArrowUpRight, Download, FileText, PanelTopOpen } from 'lucide-react'
import { apiUrl } from '../../services/apiClient'
import { buildProjectStatusBadges } from '../../utils/appProjectStatus'
import AppEmbedModal from './AppEmbedModal'

const DEFAULT_MADE_BY = '최준혁'

const STATUS_TONE_CLASS = {
  ready: 'bg-[#e8f3ff] text-[#0066cc]',
  hosted: 'bg-[#eaf8ee] text-[#248a3d]',
  external: 'bg-[#fff4de] text-[#b76e00]',
  download: 'bg-[#f0ecff] text-[#6e3fd8]',
  draft: 'bg-[#f5f5f7] text-[#6e6e73]',
}

function fileHref(file) {
  if (!file?.url || file.url === '#') return '#'
  return apiUrl(file.url)
}

function formatFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`
  if (n >= 1024) return `${Math.round(n / 1024)}KB`
  return `${n}B`
}

function fileLabel(file) {
  return file?.originalName || file?.name || '배포파일'
}

export default function AppProjectCard({
  project,
  showStatusBadges = false,
  interactive = true,
  className = '',
  testId,
}: any) {
  const [embedOpen, setEmbedOpen] = useState(false)
  const files = Array.isArray(project?.files) ? project.files : []
  const hasLink = Boolean(project?.linkUrl)
  // Keep the whole card clickable only when there's nothing interactive nested
  // inside it (no embed button, no download files) — anchors can't wrap buttons.
  const wholeCardLink = hasLink && interactive && files.length === 0
  const canEmbed = hasLink && interactive && !wholeCardLink
  const openEmbed = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setEmbedOpen(true)
  }
  const CardTag = wholeCardLink ? 'a' : 'div'
  const cardProps = wholeCardLink
    ? { href: project.linkUrl, target: '_blank', rel: 'noreferrer' }
    : {}
  const badges = showStatusBadges ? buildProjectStatusBadges(project) : []

  return (
    <CardTag
      {...cardProps}
      data-testid={testId}
      className={`apple-product-panel group flex min-h-64 flex-col px-6 py-6 text-left no-underline transition hover:-translate-y-0.5 ${className}`}
    >
      {project?.eyebrow && <p className="text-sm font-semibold text-[#0066cc]">{project.eyebrow}</p>}
      <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#1d1d1f]">{project?.title || '입력 중인 Apps 항목'}</h3>
      {project?.description && (
        <p className="mt-3 flex-1 text-sm font-medium leading-6 text-[#6e6e73]">{project.description}</p>
      )}
      <p className={`text-xs font-semibold text-[var(--app-subtle)] ${project?.description ? 'mt-4' : 'mt-3 flex-1'}`}>
        만든 사람: {project?.madeBy || DEFAULT_MADE_BY}
      </p>

      {badges.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5" aria-label="앱 상태">
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

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {hasLink && (
          wholeCardLink ? (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#0066cc]">
              열기
              <ArrowUpRight size={15} aria-hidden="true" />
            </span>
          ) : (
            <a
              href={project.linkUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`${project?.title || '앱'} 열기`}
              className="inline-flex items-center gap-2 text-sm font-bold text-[#0066cc] no-underline"
            >
              열기
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          )
        )}
        {canEmbed && (
          <button
            type="button"
            onClick={openEmbed}
            aria-label={`${project?.title || '앱'} 여기서 열기`}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--app-accent-text)]"
          >
            <PanelTopOpen size={15} aria-hidden="true" />
            여기서 열기
          </button>
        )}
      </div>

      {files.length > 0 && (
        <div className="mt-4 grid gap-2" aria-label="배포 파일">
          {files.map((file) => {
            const size = formatFileSize(file.fileSize)
            const href = fileHref(file)
            return (
              <a
                key={file.id || file.originalName || file.url}
                href={href}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-[#d2d2d7] bg-white/72 px-3 py-2 text-xs font-bold text-[#1d1d1f] no-underline transition hover:border-[#0066cc] hover:text-[#0066cc]"
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

      {project?.displayUrl && (
        <span className="mt-3 truncate rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[var(--app-subtle)]">
          {project.displayUrl}
        </span>
      )}

      {canEmbed && (
        <AppEmbedModal
          open={embedOpen}
          title={project?.title || '미니 앱'}
          url={project.linkUrl}
          onClose={() => setEmbedOpen(false)}
        />
      )}
    </CardTag>
  )
}
