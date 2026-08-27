import { useEffect, useRef, useState } from 'react'
import { listFiles, createPost, deleteFile, updateArchiveAuthor } from '../../services/archiveApi'
import { showToast } from '../../components/common/Toast'
import { confirmDialog, promptDialog } from '../../components/common/ConfirmDialog'
import { Skeleton, SkeletonGroup } from '../../components/common/Skeleton'

export default function AdminFiles() {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const loadFiles = () => {
    listFiles()
      .then(setFiles)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let mounted = true
    listFiles()
      .then(d => { if (mounted) setFiles(d) })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await createPost({ title: file.name, file })
      loadFiles()
    } catch (err) {
      showToast({ message: err.message || '업로드 중 오류가 발생했습니다.', tone: 'error' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAuthorEdit = async (file) => {
    const name = await promptDialog({
      message: '자료실에 표시할 작성자 이름을 입력하세요.',
      defaultValue: file.uploaderName || '',
    })
    if (name === null) return
    if (!name.trim()) {
      showToast({ message: '작성자 이름을 입력해주세요.', tone: 'error' })
      return
    }
    try {
      const updated = await updateArchiveAuthor(file.id, name.trim())
      setFiles((prev) => prev.map((item) => (item.id === file.id ? { ...item, uploaderName: updated.uploaderName } : item)))
      showToast({ message: '작성자가 변경되었습니다.' })
    } catch (err) {
      showToast({ message: err.message || '작성자 변경 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  const handleDelete = async (id) => {
    if (!(await confirmDialog({ message: '파일을 삭제하시겠습니까?', tone: 'danger' }))) return
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      showToast({ message: err.message || '삭제 중 오류가 발생했습니다.', tone: 'error' })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shape-cut-sm border border-[var(--app-hairline)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white/80 disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '파일 업로드'}
        </button>
      </div>

      {loading ? (
        <SkeletonGroup label="파일 목록을 불러오는 중">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="shape-cut-sm flex items-center justify-between gap-3 border border-[var(--app-hairline)] bg-black/5 px-4 py-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        </SkeletonGroup>
      ) : files.length === 0 ? (
        <p className="text-sm text-[var(--theme-body-muted)]">등록된 파일이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="shape-cut-sm flex items-center justify-between gap-3 border border-[var(--app-hairline)] bg-black/5 px-4 py-3"
            >
              <div>
                <p className="font-semibold text-[var(--theme-body-dark)]">{file.originalName}</p>
                <p className="text-xs text-[var(--theme-body-muted)]">
                  작성자 {file.uploaderName || file.uploadedBy || '-'} · {formatFileSize(file.fileSize)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAuthorEdit(file)}
                className="text-xs font-semibold text-blue-500 transition hover:underline"
              >
                작성자 변경
              </button>
              <button
                type="button"
                onClick={() => handleDelete(file.id)}
                className="text-xs font-semibold text-red-500 transition hover:underline"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '알 수 없음'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
