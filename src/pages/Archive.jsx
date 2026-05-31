import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, UploadCloud } from 'lucide-react'
import { downloadFile, getFiles, uploadFile } from '../services/archiveApi.js'

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function Archive({ onBack, user }) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [notice, setNotice] = useState('')
  const fileInputRef = useRef(null)

  const isAdmin = user?.role === 'ADMIN'

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getFiles()
      setFiles(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || '자료실 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    getFiles()
      .then((data) => {
        if (!cancelled) {
          setFiles(Array.isArray(data) ? data : [])
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '자료실 목록을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleDownload = async (file) => {
    setNotice('')
    setError(null)
    try {
      await downloadFile(file.id, file.originalName)
    } catch (err) {
      setError(err.message || '다운로드 실패')
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('업로드할 파일을 선택해주세요.')
      return
    }

    setUploading(true)
    setError(null)
    setNotice('')

    try {
      await uploadFile(selectedFile)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setNotice('파일이 업로드되었습니다.')
      await loadFiles()
    } catch (err) {
      setError(err.message || '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="shape-cut-sm border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--theme-text)] transition hover:bg-white/15"
        >
          메인으로 돌아가기
        </button>
        <div className="text-sm text-white/55">
          {user?.name ? `${user.name}님` : 'COM\'s 자료실'}
        </div>
      </div>

      <section className="shape-cut border border-white/10 bg-white/5 p-5 shadow-[0_22px_70px_var(--theme-shadow-glass)] backdrop-blur-md sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-cyan-200">Archive</p>
            <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">자료실</h1>
            <p className="mt-3 max-w-2xl leading-7 text-white/68">
              COM&apos;s 활동 자료와 공지 파일을 확인하고 다운로드할 수 있습니다.
            </p>
          </div>

          {isAdmin && (
            <div className="shape-cut-sm border border-white/10 bg-black/20 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                  className="max-w-full text-sm text-white/70 file:mr-3 file:shape-cut-sm file:border-0 file:bg-white/82 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--theme-body-dark)]"
                />
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="shape-cut-sm inline-flex items-center justify-center gap-2 bg-white/85 px-4 py-2 text-sm font-semibold text-[var(--theme-body-dark)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UploadCloud size={16} />
                  {uploading ? '업로드 중...' : '업로드'}
                </button>
              </div>
            </div>
          )}
        </div>

        {notice && (
          <div className="mt-5 shape-cut-sm border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">
            {notice}
          </div>
        )}

        {error && (
          <div className="mt-5 flex flex-col gap-3 shape-cut-sm border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm text-red-100 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={loadFiles}
              className="inline-flex items-center justify-center gap-2 shape-cut-sm border border-white/10 bg-white/10 px-3 py-2 font-semibold text-white transition hover:bg-white/15"
            >
              <RefreshCw size={15} />
              다시 시도
            </button>
          </div>
        )}

        <div className="mt-6 overflow-hidden shape-cut-sm border border-white/10 bg-black/18">
          {loading ? (
            <div className="px-5 py-16 text-center text-white/65">자료를 불러오는 중...</div>
          ) : files.length === 0 ? (
            <div className="px-5 py-16 text-center text-white/65">등록된 자료가 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-white/10 bg-white/8 text-xs uppercase tracking-[0.24em] text-white/45">
                  <tr>
                    <th className="px-4 py-3 font-semibold">파일명</th>
                    <th className="px-4 py-3 font-semibold">크기</th>
                    <th className="px-4 py-3 font-semibold">업로드</th>
                    <th className="px-4 py-3 font-semibold">날짜</th>
                    <th className="px-4 py-3 text-right font-semibold">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {files.map((file) => (
                    <tr key={file.id} className="text-white/75 transition hover:bg-white/5">
                      <td className="max-w-[320px] px-4 py-4 font-semibold text-white">
                        <span className="block truncate" title={file.originalName}>
                          {file.originalName}
                        </span>
                      </td>
                      <td className="px-4 py-4">{formatSize(file.fileSize)}</td>
                      <td className="px-4 py-4">{file.uploadedBy || '-'}</td>
                      <td className="px-4 py-4">{formatDate(file.uploadedAt)}</td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDownload(file)}
                          className="shape-cut-sm inline-flex items-center justify-center gap-2 border border-white/10 bg-white/10 px-3 py-2 font-semibold text-white transition hover:bg-white/15"
                        >
                          <Download size={15} />
                          다운로드
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
