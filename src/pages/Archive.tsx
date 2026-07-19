import { useEffect, useMemo, useState } from 'react'
import { confirmDialog } from '../components/common/ConfirmDialog'
import { useScrollReveal } from '../hooks/useScrollReveal'
import { useVisibleCount } from '../hooks/useVisibleCount'
import { ArrowLeft, FileUp } from 'lucide-react'
import { deleteFile, listFiles, voteArchiveFile } from '../services/archiveApi'
import { useAuth } from '../contexts/useAuth'
import { richBodyToPlainText } from '../components/richEditor/renderRichBody'
import { ArchiveDetailView } from '../components/archive/ArchiveDetailView'
import { ArchiveListView } from '../components/archive/ArchiveListView'
import { WriteForm } from '../components/archive/WriteForm'
import { categoryLabel } from '../components/archive/archiveUtils'

export default function Archive({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [detailFile, setDetailFile] = useState(null)
  const [mode, setMode] = useState('list')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('ALL')

  useScrollReveal([files.length, loading])

  const isAdmin = user?.role === 'ADMIN'

  const loadFiles = ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true)
    setError('')
    listFiles()
      .then((data) => setFiles(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '자료실 목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listFiles()
      .then((data) => { if (mounted) setFiles(Array.isArray(data) ? data : []) })
      .catch((err) => { if (mounted) setError(err.message || '자료실 목록을 불러오지 못했습니다.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const filteredFiles = useMemo(() => {
    const byCategory = activeCategory === 'ALL'
      ? files
      : files.filter((f) => (f.category || 'GENERAL') === activeCategory)
    if (!searchQuery.trim()) return byCategory
    const q = searchQuery.toLowerCase()
    return byCategory.filter((f) =>
      (f.title || f.originalName || '').toLowerCase().includes(q) ||
      richBodyToPlainText(f.description).toLowerCase().includes(q) ||
      (f.uploaderName || f.uploadedBy || '').toLowerCase().includes(q) ||
      categoryLabel(f.category || 'GENERAL').toLowerCase().includes(q)
    )
  }, [activeCategory, files, searchQuery])

  const { visible, canLoadMore, loadMore, total } = useVisibleCount(
    filteredFiles.length,
    20,
    `${activeCategory}|${searchQuery}`,
  )
  const visibleFiles = filteredFiles.slice(0, visible)

  const categoryCounts = useMemo(() => {
    const counts = {
      ALL: files.length,
      GENERAL: 0,
      ACADEMIC_JOURNAL: 0,
    }
    files.forEach((file) => {
      const category = file.category || 'GENERAL'
      counts[category] = (counts[category] || 0) + 1
    })
    return counts
  }, [files])

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: '자료를 삭제하시겠습니까?', tone: 'danger' }))) return
    setError('')
    setNotice('')
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
      if (detailFile?.id === id) {
        setDetailFile(null)
        setMode('list')
      }
      setNotice('자료가 삭제되었습니다.')
    } catch (err) {
      setError(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  const openFile = (file) => {
    setDetailFile(file)
    setMode('detail')
  }

  const [voting, setVoting] = useState(false)
  const handleVote = async () => {
    if (!detailFile || voting) return
    setVoting(true)
    try {
      const updated = await voteArchiveFile(detailFile.id, detailFile.myVote === 1 ? 0 : 1)
      setDetailFile(updated)
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)))
    } catch (err) {
      setError(err.message || '추천 중 오류가 발생했습니다.')
    } finally {
      setVoting(false)
    }
  }

  const handleSave = (savedList, failedNames = []) => {
    const saved = Array.isArray(savedList) ? savedList : [savedList]
    setFiles((prev) => [...saved, ...prev])
    if (failedNames.length > 0) {
      setNotice('')
      setError(`${saved.length}개 자료가 등록되었습니다. 실패: ${failedNames.join(', ')}`)
    } else {
      setError('')
      setNotice(saved.length > 1 ? `${saved.length}개 자료가 등록되었습니다.` : '자료가 등록되었습니다.')
    }
    setMode('list')
  }

  const backToList = () => {
    setMode('list')
    setDetailFile(null)
  }

  return (
    <div className="w-full space-y-4 text-[var(--app-text)]">
      {mode === 'list' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="apple-detail-home-button w-full sm:w-auto"
          >
            <ArrowLeft size={14} />
            메인으로 돌아가기
          </button>
        </div>
      )}

      <section className="apple-board-shell">
        <div className="apple-board-hero px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0" data-reveal>
              <p className="apple-eyebrow">Archive</p>
              <h1 className="mt-2 text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
                {mode === 'write' ? '자료 등록' : mode === 'detail' ? '자료 상세' : '자료실'}
              </h1>
              {mode === 'list' && (
                <p className="mt-2 text-sm font-bold text-[var(--app-accent-text)]">다시 찾는 자료실</p>
              )}
              <p className="apple-copy mt-3 max-w-2xl">
                {mode === 'list' ? '세미나, 프로젝트, 학술회지 자료를 카테고리와 검색으로 빠르게 다시 찾습니다.' : ''}
              </p>
            </div>
            {mode === 'list' ? (
              <button
                type="button"
                onClick={() => setMode('write')}
                className="apple-action-primary inline-flex min-h-11 items-center justify-center gap-2 px-5 text-sm max-md:w-full sm:min-h-10"
              >
                <FileUp size={15} />
                자료 올리기
              </button>
            ) : (
              <button
                type="button"
                onClick={backToList}
                className="apple-action-secondary inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm max-md:w-full sm:min-h-10"
              >
                <ArrowLeft size={15} />
                목록
              </button>
            )}
          </div>
        </div>

        {mode === 'write' && (
          <div className="bg-[var(--app-surface-soft)] p-5 sm:p-7">
            <WriteForm onCancel={backToList} onSave={handleSave} />
          </div>
        )}

        {mode === 'list' && (
          <ArchiveListView
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            categoryCounts={categoryCounts}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filteredFiles={filteredFiles}
            notice={notice}
            error={error}
            onReload={() => loadFiles()}
            loading={loading}
            visibleFiles={visibleFiles}
            total={total}
            canLoadMore={canLoadMore}
            loadMore={loadMore}
            onOpenFile={openFile}
          />
        )}

        {mode === 'detail' && detailFile && (
          <ArchiveDetailView
            detailFile={detailFile}
            isAdmin={isAdmin}
            voting={voting}
            onVote={handleVote}
            onDelete={handleDelete}
          />
        )}
      </section>
    </div>
  )
}
