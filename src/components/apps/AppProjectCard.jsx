import { ArrowUpRight, Download } from 'lucide-react'
import { apiUrl } from '../../services/apiClient.js'
import { buildProjectStatusBadges } from '../../utils/appProjectStatus.js'

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

export default function AppProjectCard({
  project,
  showStatusBadges = false,
  interactive = true,
  className = '',
  testId,
}) {
  const files = Array.isArray(project?.files) ? project.files : []
  const hasLink = Boolean(project?.linkUrl)
  const CardTag = hasLink && interactive ? 'a' : 'div'
  const cardProps = hasLink && interactive
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
      <p className={`text-xs font-semibold text-[#86868b] ${project?.description ? 'mt-4' : 'mt-3 flex-1'}`}>
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

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {hasLink && (
          interactive ? (
            <span className="inline-flex items-center gap-2 text-sm font-bold text-[#0066cc]">
              열기
              <ArrowUpRight size={15} aria-hidden="true" />
            </span>
          ) : (
            <a
              href={project.linkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-bold text-[#0066cc] no-underline"
            >
              열기
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          )
        )}
        {files.map((file) => (
          <a
            key={file.id || file.originalName || file.url}
            href={fileHref(file)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0066cc] px-3 py-1.5 text-xs font-bold text-white no-underline transition hover:bg-[#0052a3]"
            onClick={(event) => event.stopPropagation()}
          >
            <Download size={13} aria-hidden="true" />
            다운로드
          </a>
        ))}
      </div>

      {project?.displayUrl && (
        <span className="mt-3 truncate rounded-full bg-[#f5f5f7] px-3 py-1.5 text-xs font-semibold text-[#86868b]">
          {project.displayUrl}
        </span>
      )}
    </CardTag>
  )
}
