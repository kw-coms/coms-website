import { useEffect, useRef, useState } from 'react'
import { listFiles, uploadFile, downloadUrl, deleteFile } from '../services/archiveApi.js'
import { useAuth } from '../contexts/useAuth.js'

export default function Archive({ onBack }) {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  const isAdmin = user?.role === 'ADMIN'

  const loadFiles = () => {
    setLoading(true)
    setError('')
    listFiles()
      .then(setFiles)
      .catch((err) => setError(err.message || '자료실을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadFiles, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    try {
      await uploadFile(file)
      loadFiles()
    } catch (err) {
      setUploadError(err.message || '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('파일을 삭제하시겠습니까?')) return
    try {
      await deleteFile(id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
    } catch (err) {
      alert(err.message || '삭제 중 오류가 발생했습니다.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-[var(--theme-border-soft)] bg-[var(--theme-surface-96)] px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] shadow-[0_18px_40px_rgba(255,255,255,0.2)] transition hover:bg-white"
        >
          메인으로 돌아가기
        </button>
        {user && (
          <span className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80">
            {user.name}님
          </span>
        )}
      </div>

      <section className="shape-cut border border-white/10 bg-white/8 p-6 text-white shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">Archive</p>
            <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">자료실</h1>
            <p className="mt-3 text-sm leading-6 text-white/70">COM&apos;s 부원 자료를 확인하고 내려받을 수 있습니다.</p>
          </div>
          {isAdmin && (
            <div>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                {uploading ? '업로드 중...' : '파일 업로드'}
              </button>
              {uploadError && <p className="mt-2 text-xs text-red-300">{uploadError}</p>}
            </div>
          )}
        </div>

        {loading && <p className="text-sm text-white/70">자료실을 불러오는 중...</p>}
        {error && <p className="text-sm text-red-200">{error}</p>}
        {!loading && !error && files.length === 0 && (
          <p className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-5 text-sm text-white/70">
            등록된 자료가 없습니다.
          </p>
        )}

        {!loading && !error && files.length > 0 && (
          <div className="space-y-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="shape-cut-sm flex flex-col gap-2 border border-white/10 bg-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="block font-semibold text-white">{file.originalName}</span>
                  <span className="text-xs text-white/60">
                    {file.uploadedBy} · {formatFileSize(file.fileSize)}
                  </span>
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={downloadUrl(file.id)}
                    className="text-sm font-semibold text-cyan-100 transition hover:text-cyan-200"
                  >
                    Download
                  </a>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDelete(file.id)}
                      className="text-sm font-semibold text-red-300 transition hover:text-red-200"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '알 수 없음'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
