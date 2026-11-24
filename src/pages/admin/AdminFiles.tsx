import { useEffect, useMemo, useState } from 'react'
import { FileArchive, FileImage, FileText, File as FileIcon, Search, Upload } from 'lucide-react'
import { listFiles, deleteFile, updateArchiveAuthor, updateArchiveVisibility, searchArchiveVisibilityMembers, type ArchiveVisibility } from '../../services/archiveApi'
import { showToast } from '../../components/common/Toast'
import { confirmDialog } from '../../components/common/ConfirmDialog'
import AuthorChangeDialog from '../../components/common/AuthorChangeDialog'
import { WriteForm } from '../../components/archive/WriteForm'
import { canEditArchive, ownsArchive } from '../../utils/contentEditing'
import { useAuth } from '../../contexts/useAuth'
import { usePermissions } from '../../contexts/usePermissions'
import { PERMISSIONS } from '../../utils/roleAccess'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'
import { ARCHIVE_VISIBILITY_LABELS, archiveAttachments, archiveFileSize, categoryLabel, formatDate, formatSize } from '../../components/archive/archiveUtils'
import { archiveFileType, filterSortArchiveFiles, type ArchiveFileFilters, type ArchiveFileRow } from './archiveFileFilters'

const ICONS = { image: FileImage, document: FileText, archive: FileArchive, other: FileIcon }
const FILTER_CLASS = 'min-h-11 min-w-0 rounded-lg border border-[var(--app-hairline)] bg-[var(--app-surface)] px-3 text-sm text-[var(--app-text)]'
const ACTION_CLASS = 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--app-hairline)] px-4 text-sm font-semibold text-[var(--app-accent-text)]'

export default function AdminFiles() {
  const { user } = useAuth()
  const { can } = usePermissions()
  const [editingFile, setEditingFile] = useState<ArchiveFileRow | null>(null)
  const [authorFile, setAuthorFile] = useState<ArchiveFileRow | null>(null)
  const [files, setFiles] = useState<ArchiveFileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [filters, setFilters] = useState<ArchiveFileFilters>({ query: '', category: 'ALL', visibility: 'ALL', fileType: 'ALL', sort: 'newest' })
  const [selectedFile, setSelectedFile] = useState<ArchiveFileRow | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [memberQuery, setMemberQuery] = useState('')
  const [memberResults, setMemberResults] = useState<{ studentId: string; name: string; role: string }[]>([])
  const [memberSearchError, setMemberSearchError] = useState(false)
  const [memberSearchNonce, setMemberSearchNonce] = useState(0)
  const [savingVisibility, setSavingVisibility] = useState(false)
  const visibleFiles = useMemo(() => filterSortArchiveFiles(files, filters), [files, filters])
  const canSetRestricted = can(PERMISSIONS.archiveVisibility)

  const loadFiles = async () => {
    setLoading(true)
    setError('')
    try {
      const rows = await listFiles()
      setFiles(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError((err as Error).message || '자료 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    listFiles()
      .then((rows) => { if (active) setFiles(Array.isArray(rows) ? rows : []) })
      .catch((err) => { if (active) setError((err as Error).message || '자료 목록을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!selectedFile || !canSetRestricted) return
    let active = true
    searchArchiveVisibilityMembers(memberQuery)
      .then((members) => { if (active) { setMemberResults(members); setMemberSearchError(false) } })
      .catch(() => { if (active) { setMemberResults([]); setMemberSearchError(true) } })
    return () => { active = false }
  }, [selectedFile, memberQuery, canSetRestricted, memberSearchNonce])

  const replaceFile = (updated: ArchiveFileRow) => setFiles((rows) => rows.map((row) => row.id === updated.id ? updated : row))
  const changeVisibility = async (file: ArchiveFileRow, visibility: ArchiveVisibility, selectedStudentIds: string[] = []) => {
    setSavingVisibility(true)
    try {
      const updated = await updateArchiveVisibility(file.id, { visibility, selectedStudentIds })
      replaceFile(updated)
      setSelectedFile(null)
      showToast({ message: '공개 범위가 변경되었습니다.' })
    } catch (err) {
      showToast({ message: (err as Error).message || '공개 범위를 변경하지 못했습니다.', tone: 'error' })
    } finally {
      setSavingVisibility(false)
    }
  }
  const handleDelete = async (id: number) => {
    if (!(await confirmDialog({ message: '파일을 삭제하시겠습니까?', tone: 'danger' }))) return
    try {
      await deleteFile(id)
      setFiles((rows) => rows.filter((row) => row.id !== id))
    } catch (err) {
      showToast({ message: (err as Error).message || '삭제 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      {authorFile && <AuthorChangeDialog name={authorFile.uploaderName} allowMemberSelection={user?.role === 'ADMIN'} onClose={() => setAuthorFile(null)} onSave={async payload => {
        const updated = await updateArchiveAuthor(authorFile.id, payload.studentId ? { studentId: payload.studentId } : { uploaderName: payload.name })
        replaceFile(updated)
      }} />}
      {editingFile && <WriteForm key={editingFile.id} initialFile={editingFile} onCancel={() => setEditingFile(null)} onSave={(savedList) => {
        replaceFile(savedList[0] as ArchiveFileRow)
        setEditingFile(null)
        showToast({ message: '자료가 수정되었습니다.' })
      }} />}
      {showUpload && <WriteForm onCancel={() => setShowUpload(false)} onSave={(savedList) => {
        setFiles((rows) => [...savedList as ArchiveFileRow[], ...rows])
        setShowUpload(false)
        showToast({ message: '자료가 등록되었습니다.' })
      }} />}
      <button type="button" onClick={() => setShowUpload(true)} disabled={loading || showUpload} className="apple-action-primary inline-flex min-h-11 items-center gap-2 px-4 text-sm disabled:opacity-50"><Upload size={16} />파일 업로드</button>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-5" role="search">
        <label className="relative min-w-0 sm:col-span-2 xl:col-span-1">
          <span className="sr-only">자료 검색</span><Search size={16} className="absolute left-3 top-3.5 text-[var(--app-subtle)]" />
          <input value={filters.query} onChange={(event) => setFilters((value) => ({ ...value, query: event.target.value }))} placeholder="제목, 파일명, 작성자" className={`${FILTER_CLASS} w-full pl-9`} />
        </label>
        <label><span className="sr-only">카테고리</span><select value={filters.category} onChange={(event) => setFilters((value) => ({ ...value, category: event.target.value }))} className={`${FILTER_CLASS} w-full`}><option value="ALL">모든 카테고리</option><option value="GENERAL">일반 자료</option><option value="ACADEMIC_JOURNAL">학술회지</option></select></label>
        <label><span className="sr-only">공개 범위</span><select value={filters.visibility} onChange={(event) => setFilters((value) => ({ ...value, visibility: event.target.value }))} className={`${FILTER_CLASS} w-full`}><option value="ALL">모든 공개 범위</option>{Object.entries(ARCHIVE_VISIBILITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">파일 종류</span><select value={filters.fileType} onChange={(event) => setFilters((value) => ({ ...value, fileType: event.target.value }))} className={`${FILTER_CLASS} w-full`}><option value="ALL">모든 파일 종류</option><option value="document">문서</option><option value="image">이미지</option><option value="archive">압축 파일</option><option value="other">기타</option></select></label>
        <label><span className="sr-only">정렬</span><select value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value as ArchiveFileFilters['sort'] }))} className={`${FILTER_CLASS} w-full`}><option value="newest">최신순</option><option value="name">이름순</option><option value="size">용량순</option><option value="views">조회순</option></select></label>
      </div>
      {!loading && <p className="text-xs text-[var(--app-subtle)]">{visibleFiles.length}개 자료</p>}
      {loading ? <SkeletonGroup label="파일 목록을 불러오는 중"><div className="space-y-2">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="apple-soft-panel p-4"><Skeleton className="h-5 w-44" /><Skeleton className="mt-2 h-4 w-28" /></div>)}</div></SkeletonGroup>
        : error ? <div role="alert" className="apple-soft-panel p-4 text-sm text-red-700">{error}<button type="button" onClick={() => void loadFiles()} className={`${ACTION_CLASS} ml-3`}>다시 시도</button></div>
        : visibleFiles.length === 0 ? <p className="apple-soft-panel p-5 text-sm text-[var(--app-muted)]">{files.length ? '검색 조건에 맞는 자료가 없습니다.' : '등록된 파일이 없습니다.'}</p>
        : <div className="space-y-2">{visibleFiles.map((file) => {
          const Icon = ICONS[archiveFileType(file)]
          const owns = ownsArchive(user, file)
          const canChange = file.visibility !== 'GROUP' && (canSetRestricted || owns && ['PUBLIC', 'MEMBERS'].includes(file.visibility || 'MEMBERS'))
          return <article key={file.id} className="apple-soft-panel min-w-0 p-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 gap-3"><Icon size={20} aria-hidden="true" className="mt-1 shrink-0 text-[var(--app-accent-text)]" /><div className="min-w-0 flex-1">
                <h3 className="break-words font-semibold text-[var(--app-text)]">{file.title || file.originalName}</h3>
                <p className="mt-1 break-all text-xs text-[var(--app-subtle)]">{archiveAttachments(file).map((attachment) => attachment.originalName).join(', ')}</p>
                <p className="mt-2 text-xs text-[var(--app-muted)]">{categoryLabel(file.category || 'GENERAL')} · {file.uploaderName || file.uploadedBy || '-'} · {formatSize(archiveFileSize(file))} · {formatDate(file.uploadedAt)} · 조회 {file.viewCount ?? 0}</p>
                <span className="mt-2 inline-flex rounded-full bg-[var(--app-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--app-accent-text)]">{ARCHIVE_VISIBILITY_LABELS[(file.visibility || 'MEMBERS') as ArchiveVisibility]}</span>
              </div></div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {canEditArchive(user, file, can(PERMISSIONS.archiveEditAny) ? [PERMISSIONS.archiveEditAny] : []) && <button type="button" onClick={() => setEditingFile(file)} className={ACTION_CLASS}>수정</button>}
                {can(PERMISSIONS.archiveAuthorChange) && <button type="button" onClick={() => setAuthorFile(file)} className={ACTION_CLASS}>작성자 변경</button>}
                {(owns || can(PERMISSIONS.archiveDelete)) && <button type="button" onClick={() => void handleDelete(file.id)} className={`${ACTION_CLASS} text-red-700`}>삭제</button>}
              </div>
            </div>
            {canChange && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--app-hairline)] pt-3">
              <label className="text-xs font-bold text-[var(--app-subtle)]">공개 범위 <select aria-label={`${file.title || file.originalName} 공개 범위`} value={file.visibility || 'MEMBERS'} disabled={savingVisibility} onChange={(event) => {
                const visibility = event.target.value as ArchiveVisibility
                if (visibility === 'SELECTED') { setSelectedFile(file); setSelectedIds(file.selectedStudentIds || []); return }
                void changeVisibility(file, visibility)
              }} className={`${FILTER_CLASS} ml-2`}>
                {Object.entries(ARCHIVE_VISIBILITY_LABELS).filter(([value]) => value !== 'GROUP').map(([value, label]) => <option key={value} value={value} disabled={!canSetRestricted && (value === 'OFFICERS' || value === 'SELECTED')}>{label}</option>)}
              </select></label>
              {canSetRestricted && file.visibility === 'SELECTED' && <button type="button" onClick={() => { setSelectedFile(file); setSelectedIds(file.selectedStudentIds || []) }} className={ACTION_CLASS}>지정 회원 수정</button>}
            </div>}
            {selectedFile?.id === file.id && <div className="mt-3 space-y-2 rounded-lg border border-[var(--app-hairline)] p-3">
              <label className="text-xs font-bold text-[var(--app-subtle)]">공개할 회원 검색<input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="이름 또는 학번" className={`${FILTER_CLASS} mt-2 block w-full`} /></label>
              <div className="max-h-48 overflow-y-auto">{memberResults.map((member) => <label key={member.studentId} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selectedIds.includes(member.studentId)} onChange={(event) => setSelectedIds((ids) => event.target.checked ? [...ids, member.studentId] : ids.filter((id) => id !== member.studentId))} />{member.name} · {member.studentId}</label>)}</div>
              {memberSearchError && <p role="alert" className="text-xs text-red-600">회원 검색에 실패했습니다. <button type="button" onClick={() => setMemberSearchNonce((value) => value + 1)} className="min-h-11 underline">다시 시도</button></p>}
              <p className="break-all text-xs text-[var(--app-muted)]">선택: {selectedIds.join(', ') || '없음'}</p>
              <div className="flex gap-2"><button type="button" disabled={savingVisibility || selectedIds.length === 0} onClick={() => void changeVisibility(file, 'SELECTED', selectedIds)} className={ACTION_CLASS}>저장</button><button type="button" onClick={() => setSelectedFile(null)} className={ACTION_CLASS}>취소</button></div>
            </div>}
          </article>
        })}</div>}
    </div>
  )
}
