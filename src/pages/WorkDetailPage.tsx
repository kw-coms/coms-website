import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Download } from 'lucide-react'
import PageHeading from '../components/PageHeading'
import WorkComments from '../components/apps/WorkComments'
import { useAuth } from '../contexts/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { getClubProject, setClubProjectLike } from '../services/clubProjectApi'
import { apiUrl } from '../services/apiClient'
import { projectFileHref, safeProjectLinkUrl } from '../utils/appProjectUrls'
import { workViewerKey } from '../utils/workViewerKey'
import '../styles/site-pages.css'

type Work = {
  id: number
  title: string
  description?: string
  madeBy?: string
  linkUrl?: string
  images?: { id: number; url: string }[]
  files?: { id: number; url: string; originalName?: string; fileSize?: number }[]
  viewCount?: number
  likeCount?: number
  commentCount?: number
  likedByMe?: boolean
}

function WorkDetail({ workId }: { workId: number }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const [work, setWork] = useState<Work | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [likePending, setLikePending] = useState(false)
  const [likeError, setLikeError] = useState('')
  useDocumentTitle(work?.title)

  useEffect(() => {
    let active = true
    getClubProject(workId)
      .then((result) => {
        if (!active) return
        setWork(result)
        setLoadState('ready')
      })
      .catch(() => { if (active) setLoadState('error') })
    return () => { active = false }
  }, [workId, attempt])

  const onCountChange = useCallback((count: number) => {
    setWork((current) => current && current.commentCount !== count ? { ...current, commentCount: count } : current)
  }, [])

  const like = async () => {
    if (!work || !user || likePending) return
    setLikePending(true)
    setLikeError('')
    try {
      const counts = await setClubProjectLike(workId, !work.likedByMe)
      setWork((current) => current?.id === workId ? { ...current, ...counts } : current)
    } catch (cause) {
      setLikeError(cause instanceof Error ? cause.message : '추천을 저장하지 못했습니다. 다시 시도해 주세요.')
    } finally { setLikePending(false) }
  }

  const link = safeProjectLinkUrl(work?.linkUrl)
  const images = Array.isArray(work?.images) ? work.images : []
  const files = Array.isArray(work?.files) ? work.files : []

  return (
    <div className="site-page">
      <div className="site-page-inner max-w-4xl">
        <Link to="/apps" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--app-accent-text)] underline"><ArrowLeft size={16} aria-hidden="true" />작품 목록으로</Link>
        {loadState === 'loading' && <p role="status" className="mt-8 text-[var(--app-muted)]">작품을 불러오는 중...</p>}
        {loadState === 'error' && <div role="alert" className="mt-8 flex flex-wrap items-center gap-3 text-sm text-[var(--app-muted)]">작품을 불러오지 못했습니다.<button type="button" className="apple-action-secondary min-h-11 px-4" onClick={() => { setLoadState('loading'); setAttempt((value) => value + 1) }}>다시 불러오기</button></div>}
        {loadState === 'ready' && work && (
          <>
            <div className="mt-5"><PageHeading>{work.title}</PageHeading></div>
            {work.madeBy?.trim() && <p className="mt-3 min-w-0 break-words text-sm font-semibold text-[var(--app-muted)]">제작자 {work.madeBy.trim()}</p>}
            <p className="mt-4 whitespace-pre-wrap break-words text-base leading-7 text-[var(--app-text)]">{work.description}</p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-[var(--app-muted)]" aria-label="작품 반응">
              <span>조회 {Number(work.viewCount || 0).toLocaleString('ko-KR')}</span>
              <span>추천 {Number(work.likeCount || 0).toLocaleString('ko-KR')}</span>
              <span>댓글 {Number(work.commentCount || 0).toLocaleString('ko-KR')}</span>
              {user ? (
                <button type="button" aria-pressed={Boolean(work.likedByMe)} disabled={likePending} onClick={like} className="apple-action-secondary min-h-11 px-4 text-sm">{likePending ? '저장 중…' : work.likedByMe ? '추천 취소' : '추천하기'}</button>
              ) : !authLoading && <Link to="/login" state={{ from: location }} className="font-semibold text-[var(--app-accent-text)] underline">추천하려면 로그인</Link>}
            </div>
            {likeError && <p role="alert" className="mt-3 text-sm text-[var(--app-danger)]">{likeError}</p>}
            {link && <a href={link} target="_blank" rel="noreferrer" className="apple-action-primary mt-6 inline-flex min-h-11 items-center gap-2 px-5 text-sm">작품 열기 <ArrowUpRight size={16} aria-hidden="true" /></a>}
            {images.length > 0 && <section aria-label="작품 사진" className="mt-7 flex gap-3 overflow-x-auto">
              {images.map((image, index) => {
                const href = /^\/api\/club-projects\/\d+\/images\/\d+$/.test(image.url || '') ? apiUrl(image.url) : null
                return href && <a key={image.id} href={href} target="_blank" rel="noreferrer" aria-label={`${work.title} 사진 ${index + 1} 크게 보기`} className="shrink-0"><img src={href} alt={`${work.title} 사진 ${index + 1}`} loading="lazy" className="h-36 w-52 rounded-xl border border-[var(--app-hairline)] object-cover sm:h-44 sm:w-64" /></a>
              })}
            </section>}
            {files.length > 0 && <section aria-label="배포 파일" className="mt-7 flex flex-wrap gap-2">
              {files.map((file) => {
                const href = projectFileHref(file.url)
                return href !== '#' && <a key={file.id} href={href} className="apple-action-secondary inline-flex min-h-11 max-w-full items-center gap-2 px-4 text-sm"><Download size={15} aria-hidden="true" /><span className="min-w-0 truncate">{file.originalName || '배포 파일'}</span></a>
              })}
            </section>}
            <WorkComments workId={workId} onCountChange={onCountChange} />
          </>
        )}
      </div>
    </div>
  )
}

export default function WorkDetailPage() {
  const { workId } = useParams()
  const { user, loading } = useAuth()
  if (!workId || !/^[1-9]\d*$/.test(workId) || !Number.isSafeInteger(Number(workId))) {
    return <div className="site-page"><div className="site-page-inner"><p role="alert">작품을 찾을 수 없습니다.</p><Link to="/apps" className="mt-4 inline-block text-[var(--app-accent-text)] underline">작품 목록으로</Link></div></div>
  }
  if (loading && !user) return <div className="site-page"><p role="status" className="site-page-inner">로그인 상태를 확인하는 중...</p></div>
  return <WorkDetail key={`${workId}:${workViewerKey(user)}`} workId={Number(workId)} />
}
